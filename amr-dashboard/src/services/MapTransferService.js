import bridge, { CHUNK_BYTES } from './WorkspaceBridge.js';
import { validateManifest, validatePackage, packageHash } from '../utils/mapManifest.js';

export function encodeChunk(bytes) { return btoa(String.fromCharCode(...bytes)); }
export function decodeChunk(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(CHUNK_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid artifact chunk');
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}
export class MapTransferService {
  constructor(client = bridge) { this.bridge = client; }
  async download(manifest, { signal, onProgress } = {}) {
    validateManifest(manifest);
    const hash = await packageHash(manifest);
    const files = {};
    for (const desc of manifest.files) {
      const bytes = new Uint8Array(desc.size);
      for (let offset = 0; offset < desc.size; offset += CHUNK_BYTES) {
        const length = Math.min(CHUNK_BYTES, desc.size - offset);
        const reply = await this.bridge.request('artifact.read', {
          map_id: manifest.map_id, revision: manifest.revision, package_sha256: hash,
          source: manifest.source, file: desc.name, offset, length,
        }, { signal });
        if (reply?.offset !== offset || reply.file !== desc.name || reply.package_sha256 !== hash) throw new Error('Artifact response identity mismatch');
        const chunk = decodeChunk(reply.data);
        if (chunk.length !== length) throw new Error('Truncated artifact chunk');
        bytes.set(chunk, offset);
        onProgress?.({ file: desc.name, received: offset + length, total: desc.size });
      }
      files[desc.name] = bytes;
    }
    return validatePackage(manifest, files);
  }
  async upload(pkg, operationId, { signal } = {}) {
    const checked = await validatePackage(pkg.manifest, pkg.files);
    const identity = { operation_id: operationId, map_id: pkg.manifest.map_id, revision: pkg.manifest.revision, package_sha256: checked.package_sha256 };
    const begin = await this.bridge.request('artifact.begin', { ...identity, manifest: pkg.manifest }, { signal });
    if (begin?.package_sha256 !== identity.package_sha256) throw new Error('Upload acknowledgement mismatch');
    if (begin.verified !== true) {
      for (const desc of pkg.manifest.files) {
        const bytes = pkg.files[desc.name];
        for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
          const chunk = bytes.slice(offset, offset + CHUNK_BYTES);
          const ack = await this.bridge.request('artifact.write', { ...identity, file: desc.name, offset, data: encodeChunk(chunk) }, { signal });
          if (ack?.next_offset !== offset + chunk.length || ack.file !== desc.name || ack.package_sha256 !== identity.package_sha256) throw new Error('Chunk acknowledgement mismatch');
        }
      }
    }
    const committed = await this.bridge.request('artifact.commit', identity, { signal });
    if (committed?.verified !== true || committed.package_sha256 !== identity.package_sha256) throw new Error('Server did not verify the staged map');
    return identity;
  }
}
export default new MapTransferService();
