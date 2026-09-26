import { serializeMapYaml, serializeP5Pgm, computeSha256 } from '../utils/mapPackage.js';
import { packageHash } from '../utils/mapManifest.js';

export class MemoryDirectory {
  constructor(name = 'root') { this.name = name; this.kind = 'directory'; this.entries = new Map(); this.permission = 'granted'; }
  async queryPermission() { return this.permission; }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.entries.has(name) && create) this.entries.set(name, new MemoryDirectory(name));
    if (!this.entries.has(name)) throw new DOMException('Not found', 'NotFoundError');
    return this.entries.get(name);
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.entries.has(name) && create) {
      const entry = { name, kind: 'file', bytes: new Uint8Array() };
      entry.getFile = async () => ({ size: entry.bytes.length, text: async () => new TextDecoder().decode(entry.bytes), arrayBuffer: async () => entry.bytes.slice().buffer });
      entry.createWritable = async () => {
        let pending;
        return { write: async bytes => { pending = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes); }, close: async () => { entry.bytes = pending; }, abort: async () => {} };
      };
      this.entries.set(name, entry);
    }
    if (!this.entries.has(name)) throw new DOMException('Not found', 'NotFoundError');
    return this.entries.get(name);
  }
  async removeEntry(name) { this.entries.delete(name); }
  async *values() { yield* this.entries.values(); }
}
export async function mapFixture(width = 4, height = 4) {
  const grid = { width, height, resolution: 0.05, frame_id: 'map', origin: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } };
  const files = { 'map.yaml': new Uint8Array(new TextEncoder().encode(serializeMapYaml({}))), 'map.pgm': serializeP5Pgm(width, height, new Int8Array(width*height)) };
  const manifest = { schema_version: 1, map_id: 'map-1', revision: 1, name: 'Test map', environment: 'indoor', created_at: '2026-09-25T10:00:00.000Z', source: { robot_id: 'robot-1', session_id: 'session-1', run_id: 'run-1' }, grid, status: 'complete', files: [] };
  for (const [name, bytes] of Object.entries(files)) manifest.files.push({ name, size: bytes.length, sha256: await computeSha256(bytes) });
  return { manifest, files, package_sha256: await packageHash(manifest) };
}
export function storageAdapter(root = new MemoryDirectory()) {
  return { isSupported: true, getSavedFolder: async () => root, verifyPermission: async () => true };
}
