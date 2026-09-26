import { MapStorageService, validateManifest } from './MapStorageService.js';
import { MemoryDirectory, mapFixture, storageAdapter } from '../test/mapFixtures.js';
import { computeSha256 } from '../utils/mapPackage.js';

describe('Verified persistent map library', () => {
  let root, service, pkg;
  beforeEach(async () => { root = new MemoryDirectory(); service = new MapStorageService({ storage: storageAdapter(root) }); pkg = await mapFixture(); });
  const folder = '2026-09-25T10-00-00.000Z__robot-1__session-1';
  it('writes complete packages, discovers ended-session maps and loads verified content', async () => {
    const saved = await service.savePackage({ ...pkg, sessionFolderName: folder });
    const result = await service.listMaps();
    expect(result.status).toBe('ready');
    expect(result.maps[0].source.run_id).toBe('run-1');
    expect((await service.loadMapArtifact(result.maps[0])).data.length).toBe(16);
    const session = await root.getDirectoryHandle(folder);
    const run = await (await session.getDirectoryHandle('runs')).getDirectoryHandle('run-1');
    expect(await (await run.getFileHandle('run.json')).getFile().then(f=>f.text())).toContain('mapping');
    expect(saved.manifest.package_sha256).toBe(pkg.package_sha256);
  });
  it('detects same-length tampering, not merely missing files', async () => {
    const saved = await service.savePackage({ ...pkg, sessionFolderName: folder });
    const file = await saved.dirHandle.getFileHandle('map.pgm');
    file.bytes[file.bytes.length - 1] ^= 1;
    expect((await service.listMaps()).status).toBe('corrupt');
    await expect(service.loadMapArtifact({ ...saved.manifest, dirHandle: saved.dirHandle })).rejects.toThrow(/Integrity/);
  });
  it('idempotently reuses identical maps, refuses to overwrite a complete revision', async () => {
    await service.savePackage({ ...pkg, sessionFolderName: folder });
    await service.savePackage({ ...pkg, sessionFolderName: folder });
    pkg.files['map.pgm'][pkg.files['map.pgm'].length-1] = 0;
    pkg.manifest.files[1].sha256 = await computeSha256(pkg.files['map.pgm']);
    await expect(service.savePackage({ ...pkg, sessionFolderName: folder })).rejects.toThrow(/already exists/);
    expect((await service.listMaps()).maps).toHaveLength(1);
  });
  it('separates missing folder, permissions, empty library and read errors without requesting permission', async () => {
    expect((await service.listMaps()).status).toBe('empty');
    root.permission = 'prompt';
    expect((await service.listMaps()).status).toBe('needs-permission');
    service.storage.getSavedFolder = async () => null;
    expect((await service.listMaps()).status).toBe('needs-folder');
  });
  it('rejects unknown provenance, unsafe names, oversized dimensions, invalid origin and incomplete inventory', () => {
    for (const change of [ { source: {} }, { files: [{ name: '../x' }] }, { grid: { ...pkg.manifest.grid, width: 99999999 } }, { grid: { ...pkg.manifest.grid, origin: { position: {x:NaN}, orientation:{} } } }, { files: [pkg.manifest.files[0]] } ]) {
      expect(() => validateManifest({ ...pkg.manifest, ...change })).toThrow();
    }
  });
  it('rejects metadata/image disagreement even when file hashes are valid', async () => {
    pkg.manifest.grid.width = 5;
    await expect(service.savePackage({ ...pkg, sessionFolderName: folder })).rejects.toThrow(/metadata/);
    expect((await service.listMaps()).status).toBe('empty');
  });
});
