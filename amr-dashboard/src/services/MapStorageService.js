import mcapStorage from './McapStorageService.js';
import { computeSha256 } from '../utils/mapPackage.js';
import { validateManifest, validatePackage, validId } from '../utils/mapManifest.js';
export { validateManifest } from '../utils/mapManifest.js';
export const MANIFEST_SCHEMA_VERSION = 1;

async function write(dir, name, bytes) {
  const stream = await (await dir.getFileHandle(name, { create: true })).createWritable();
  try { await stream.write(bytes); await stream.close(); }
  catch (error) { await stream.abort?.(); throw error; }
}
export class MapStorageService {
  constructor(deps = {}) { this.storage = deps.storage || mcapStorage; this.queue = Promise.resolve(); }
  get isSupported() { return this.storage.isSupported; }
  getRootFolder() { return this.storage.getSavedFolder(); }
  pickRootFolder() { return this.storage.pickFolder(); }
  async checkPermission(handle, mode = 'readwrite', request = false) {
    if (!handle) return false;
    // Background scans NEVER trigger browser permission prompts.
    if (request) return this.storage.verifyPermission(handle, mode);
    return (await handle.queryPermission({ mode })) === 'granted';
  }
  async readPackage(dirHandle) {
    const file = await (await dirHandle.getFileHandle('manifest.json')).getFile();
    if (file.size > 16384) throw new Error('Oversized manifest');
    const manifest = JSON.parse(await file.text());
    validateManifest(manifest);
    const files = {};
    for (const desc of manifest.files) {
      const item = await (await dirHandle.getFileHandle(desc.name)).getFile();
      if (item.size !== desc.size) throw new Error(`File length mismatch: ${desc.name}`);
      files[desc.name] = new Uint8Array(await item.arrayBuffer());
    }
    return validatePackage(manifest, files);
  }
  async loadMapArtifact(entry) {
    if (!entry?.dirHandle) throw new Error('Invalid map entry');
    const result = await this.readPackage(entry.dirHandle);
    if (entry.map_id !== result.manifest.map_id || entry.revision !== result.manifest.revision ||
        (entry.package_sha256 && entry.package_sha256 !== result.package_sha256) ||
        (entry.source?.session_id && result.manifest.source?.session_id && entry.source.session_id !== result.manifest.source.session_id)) {
      throw new Error('Map changed since selection. Refresh the library.');
    }
    return result;
  }
  async loadMapPackage(entry) {
    return this.loadMapArtifact(entry);
  }
  savePackage(options) {
    const execute = () => this.persistPackage(options);
    const task = this.queue.then(() => globalThis.navigator?.locks
      ? navigator.locks.request('xtrmbly-map-library-write', execute) : execute());
    this.queue = task.catch(() => {});
    return task;
  }
  async persistPackage({ manifest, files, sessionFolderName, rootHandle }) {
    const verified = await validatePackage(manifest, files);
    if (typeof sessionFolderName !== 'string' || !/^[a-zA-Z0-9_.-]{1,240}$/.test(sessionFolderName) || sessionFolderName.includes('..')) throw new Error('Invalid session folder');
    const root = rootHandle || await this.getRootFolder();
    if (!await this.checkPermission(root)) throw new Error('Storage folder write permission required.');
    const sessionDir = await root.getDirectoryHandle(sessionFolderName, { create: true });
    const runs = await sessionDir.getDirectoryHandle('runs', { create: true });
    const run = await runs.getDirectoryHandle(manifest.source.run_id, { create: true });
    const maps = await run.getDirectoryHandle('maps', { create: true });
    const map = await maps.getDirectoryHandle(manifest.map_id, { create: true });
    const revision = await map.getDirectoryHandle(String(manifest.revision), { create: true });
    let existing;
    try { existing = await revision.getFileHandle('manifest.json'); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
    if (existing) {
      const old = await this.readPackage(revision);
      if (old.package_sha256 !== verified.package_sha256) throw new Error('Immutable map revision already exists with different content.');
      return { manifest: { ...manifest, package_sha256: verified.package_sha256 }, dirHandle: revision };
    }
    await write(run, 'run.json', JSON.stringify({ schema_version: 1, operating_mode: 'mapping', ...manifest.source, completed_at: manifest.created_at, state: 'artifact_received' }, null, 2));
    for (const desc of manifest.files) {
      await write(revision, desc.name, files[desc.name]);
      const saved = await (await revision.getFileHandle(desc.name)).getFile();
      if (saved.size !== desc.size || await computeSha256(await saved.arrayBuffer()) !== desc.sha256) throw new Error(`Stored file verification failed: ${desc.name}`);
    }
    // Completion marker LAST. Incomplete directories remain recoverable but are
    // never listed as ready. Existing complete revisions are never overwritten.
    await write(revision, 'manifest.json', JSON.stringify(manifest, null, 2));
    return { manifest: { ...manifest, package_sha256: verified.package_sha256 }, dirHandle: revision };
  }
  async saveMapArtifact({ sessionFolderName, rootHandle, runId, mapId, revision = 1, name, source, grid, yamlContent, pgmBytes }) {
    if (!validId(runId) || !source) throw new Error('A verified source run is required.');
    const files = { 'map.yaml': new TextEncoder().encode(yamlContent), 'map.pgm': pgmBytes };
    const manifest = { schema_version: 1, map_id: mapId, revision, name, environment: 'indoor', created_at: new Date().toISOString(), source: { ...source, run_id: runId }, grid, status: 'complete', files: [] };
    for (const [filename, bytes] of Object.entries(files)) manifest.files.push({ name: filename, size: bytes.length, sha256: await computeSha256(bytes) });
    return this.savePackage({ manifest, files, sessionFolderName, rootHandle });
  }
  async listMaps(rootHandle = null) {
    const maps = [], issues = [];
    if (!this.isSupported) return { status: 'unsupported', maps, error: 'Persistent folder storage requires a supported browser.' };
    try {
      const root = rootHandle || await this.getRootFolder();
      if (!root) return { status: 'needs-folder', maps };
      if (!await this.checkPermission(root, 'read')) return { status: 'needs-permission', maps };
      const optionalDirectory = async (parent, name) => {
        try { return await parent.getDirectoryHandle(name); }
        catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
      };
      for await (const session of root.values()) {
        if (session.kind !== 'directory') continue;
        const runs = await optionalDirectory(session, 'runs');
        if (!runs) continue;
        for await (const run of runs.values()) {
          if (run.kind !== 'directory') continue;
          const entries = await optionalDirectory(run, 'maps');
          if (!entries) continue;
          for await (const map of entries.values()) {
            if (map.kind !== 'directory') continue;
            for await (const revision of map.values()) {
              if (revision.kind !== 'directory') continue;
              try {
                const result = await this.readPackage(revision);
                if (result.manifest.map_id !== map.name || String(result.manifest.revision) !== revision.name || result.manifest.source.run_id !== run.name) throw new Error('Folder identity mismatch');
                maps.push({ ...result.manifest, package_sha256: result.package_sha256, status: 'ready', dirHandle: revision, sessionFolder: session.name });
              } catch (error) { issues.push({ path: `${session.name}/${run.name}/${map.name}/${revision.name}`, error: error.message }); }
            }
          }
        }
      }
      maps.sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return { status: maps.length ? 'ready' : issues.length ? 'corrupt' : 'empty', maps, issues };
    } catch (error) { return { status: 'error', maps: [], error: error.message }; }
  }
}
export default new MapStorageService();
