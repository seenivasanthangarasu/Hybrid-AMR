import { computeSha256, parseMapYaml, parseP5Pgm } from './mapPackage.js';
import { getYawFromQuaternion } from './mapGeometry.js';
export const MAX_PACKAGE_BYTES = 17000000;
export const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function validateManifest(m) {
  if (m?.schema_version !== 1) throw new Error('Unsupported schema version');
  if (!validId(m.map_id) || !Number.isInteger(m.revision) || m.revision < 1) throw new Error('Invalid map identity');
  if (m.status !== 'complete') throw new Error('Map package status is not complete');
  if (m.environment !== 'indoor' || !validId(m.source?.robot_id) || !validId(m.source?.session_id) || !validId(m.source?.run_id) || !Number.isFinite(Date.parse(m.created_at))) throw new Error('Invalid source identity or creation time');
  const g = m.grid;
  if (!Number.isFinite(g?.resolution) || g.resolution <= 0) throw new Error('Invalid resolution');
  if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width <= 0 || g.height <= 0 || g.width * g.height > 16000000) throw new Error('Invalid dimensions');
  const p = g.origin?.position, q = g.origin?.orientation;
  if (!p || !q || ![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite) || Math.abs(q.x) > 1e-6 || Math.abs(q.y) > 1e-6 || Math.abs(q.z*q.z + q.w*q.w - 1) > 1e-5 || g.frame_id !== 'map') throw new Error('Invalid planar map origin/frame');
  if (!Array.isArray(m.files)) throw new Error('Missing inventory');
  for (const f of m.files) {
    if (!['map.yaml', 'map.pgm'].includes(f.name)) throw new Error('Unsafe filename or unsupported package format');
    if (!Number.isSafeInteger(f.size) || f.size <= 0 || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Invalid file size/checksum');
  }
  if (m.files.length !== 2 || new Set(m.files.map(f => f.name)).size !== 2 || m.files.reduce((n,f) => n+f.size,0) > MAX_PACKAGE_BYTES || m.files.find(f=>f.name==='map.yaml').size > 16384) throw new Error('Incomplete or oversized map inventory');
  return true;
}
export async function packageHash(manifest) {
  validateManifest(manifest);
  // Defined wire identity, independent of JSON property order.
  return computeSha256(JSON.stringify([manifest.map_id, manifest.revision, ...[...manifest.files].sort((a,b)=>a.name.localeCompare(b.name)).map(f=>[f.name,f.size,f.sha256])]));
}
const isUint8Array = (b) =>
  b instanceof Uint8Array ||
  (ArrayBuffer.isView(b) && (b.constructor?.name === 'Uint8Array' || Object.prototype.toString.call(b) === '[object Uint8Array]'));

export async function validatePackage(manifest, files) {
  validateManifest(manifest);
  for (const desc of manifest.files) {
    const bytes = files[desc.name];
    if (!isUint8Array(bytes) || bytes.length !== desc.size || await computeSha256(bytes) !== desc.sha256) throw new Error(`Integrity check failed: ${desc.name}`);
  }
  const yaml = parseMapYaml(new TextDecoder().decode(files['map.yaml']));
  const image = parseP5Pgm(files['map.pgm'], yaml);
  const g = manifest.grid;
  if (image.width !== g.width || image.height !== g.height || yaml.resolution !== g.resolution ||
    Math.abs(yaml.origin[0]-g.origin.position.x)>1e-6 || Math.abs(yaml.origin[1]-g.origin.position.y)>1e-6 ||
    Math.abs(Math.sin((yaml.origin[2]-getYawFromQuaternion(g.origin.orientation))/2))>1e-6) throw new Error('Map metadata does not match image/YAML');
  return { manifest, files, yaml, ...image, resolution: g.resolution, origin: g.origin, package_sha256: await packageHash(manifest) };
}
