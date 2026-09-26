import { MapActivationService } from './MapActivationService.js';
import { MapTransferService, decodeChunk, encodeChunk } from './MapTransferService.js';
import { MapStorageService } from './MapStorageService.js';
import { MemoryDirectory, mapFixture, storageAdapter } from '../test/mapFixtures.js';
import { harness } from '../test/workspaceHarness.js';

describe('Map activation: real storage and bounded transfer integration', () => {
  let server, pkg, map, activation, statuses;
  beforeEach(async () => {
    server = harness(); pkg = await mapFixture(300, 200); statuses = [];
    const storage = new MapStorageService({ storage: storageAdapter(new MemoryDirectory()) });
    await storage.savePackage({ ...pkg, sessionFolderName: 'session-1' });
    map = (await storage.listMaps()).maps[0];
    server.bridge.setSelection({ effectiveEnvironment: 'indoor', operatingMode: 'navigation' });
    activation = new MapActivationService({ bridge: server.bridge, storage, transfer: new MapTransferService(server.bridge) });
  });
  afterEach(() => server.bridge.stop());
  function serve(request) {
    const args = request.args;
    if (request.op === 'artifact.begin') server.reply(request, { package_sha256: args.package_sha256, verified: false });
    if (request.op === 'artifact.write') server.reply(request, { package_sha256: args.package_sha256, file: args.file, next_offset: args.offset + decodeChunk(args.data).length });
    if (request.op === 'artifact.commit') server.reply(request, { package_sha256: args.package_sha256, verified: true });
    if (request.op === 'map.activate') server.reply(request, { operation_id: args.operation_id, package_sha256: args.package_sha256 });
  }
  it('uploads every exact file byte and requires matching localized heartbeat', async () => {
    const received = {};
    server.onRequest = request => {
      serve(request);
      if (request.op === 'artifact.write') {
        const {file, offset, data} = request.args;
        received[file] ||= new Uint8Array(pkg.files[file].length);
        const chunk = decodeChunk(data); expect(chunk.length).toBeLessThanOrEqual(32768);
        received[file].set(chunk, offset);
      }
      if (request.op === 'map.activate') {
        server.heartbeat({ active_map: { ...request.args, operation_id: 'wrong' }, localization: 'localized', navigation_ready: true });
        expect(statuses.some(s=>s.status==='ready')).toBe(false);
        server.heartbeat({ active_map: request.args, localization: 'localized', navigation_ready: true });
      }
    };
    expect(await activation.activateMap({ map, operationId: 'op-1', onStatus: patch => statuses.push(patch) })).toEqual({ success: true });
    expect(received).toEqual(pkg.files);
    expect(statuses.at(-1).status).toBe('ready');
  });
  it('does not become ready for loaded but unlocalized map', async () => {
    server.onRequest = request => { serve(request); if (request.op==='map.activate') server.heartbeat({ active_map: request.args, localization: 'converging', navigation_ready: false }); };
    const result = await activation.activateMap({ map, operationId: 'op-2', timeoutMs: 30, onStatus: p=>statuses.push(p) });
    expect(result.success).toBe(false); expect(statuses.some(s=>s.status==='ready')).toBe(false);
  });
  it('rejects missing capability without publishing any transfer', async () => {
    server.heartbeat({ capabilities: [] });
    expect((await activation.activateMap({ map, operationId: 'op-3' })).success).toBe(false);
    expect(server.requests).toHaveLength(0);
  });
  it('cancels superseded activation and never reports ready', async () => {
    const controller = new AbortController();
    server.onRequest = request => { serve(request); if (request.op==='map.activate') controller.abort(); };
    const result = await activation.activateMap({ map, operationId: 'op-4', signal: controller.signal, onStatus: p=>statuses.push(p) });
    expect(result.success).toBe(false); expect(statuses.some(s=>s.status==='ready')).toBe(false);
  });
  it('downloads server artifacts in bounded correlated chunks and verifies integrity', async () => {
    server.onRequest = request => {
      const { file, offset, length, package_sha256 } = request.args;
      server.reply(request, { file, offset, package_sha256, data: encodeChunk(pkg.files[file].slice(offset,offset+length)) });
    };
    const result = await new MapTransferService(server.bridge).download(pkg.manifest);
    expect(result.files).toEqual(pkg.files);
    expect(server.requests.every(r=>r.args.length<=32768)).toBe(true);
  });
});
