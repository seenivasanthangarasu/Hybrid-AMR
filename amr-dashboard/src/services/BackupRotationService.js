/**
 * BackupRotationService
 * -----------------------
 * Filename scheme + retention enforcement shared by McapRecordingService and
 * CameraSnapshotService (data-handling-nav2-tasks.md decision/REQ-A3: "one
 * reusable piece of logic parameterized by file extension/prefix, used by
 * both... not duplicated"). Neither service touches folder listing/deletion
 * on its own — they both go through here.
 */

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

/** `YYYYMMDD-HHMMSS`, lexicographically sortable == chronologically sortable. */
export function timestampSuffix(date = new Date()) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function backupFileName(prefix, extension, date = new Date()) {
  return `${prefix}-${timestampSuffix(date)}.${extension}`;
}

export function uniqueBackupFileName(prefix, extension) {
  return `${prefix}-${timestampSuffix()}-${crypto.randomUUID()}.${extension}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fileNamePattern(prefix, extension) {
  return new RegExp(`^${escapeRegExp(prefix)}-(\\d{8}-\\d{6})(?:-[a-f0-9-]{36})?\\.${escapeRegExp(extension)}$`);
}

/** All files in `dirHandle` matching this backup's naming scheme, oldest first. */
export async function listBackupFiles(dirHandle, { prefix, extension }) {
  const pattern = fileNamePattern(prefix, extension);
  const matches = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const m = pattern.exec(entry.name);
    if (m) matches.push({ name: entry.name, stamp: m[1], handle: entry });
  }
  matches.sort((a, b) => a.stamp.localeCompare(b.stamp));
  return matches;
}

/**
 * Deletes the oldest files beyond `retainCount` for this prefix/extension.
 * No-ops (rather than deleting everything) if retainCount is unset/invalid —
 * an operator who hasn't configured retention yet should not lose data.
 */
export async function enforceRetention(dirHandle, { prefix, extension, retainCount }) {
  if (!dirHandle || !Number.isFinite(retainCount) || retainCount <= 0) return { deleted: [] };

  const matches = await listBackupFiles(dirHandle, { prefix, extension });
  const excess = matches.length - retainCount;
  if (excess <= 0) return { deleted: [] };

  const toDelete = matches.slice(0, excess);
  for (const f of toDelete) {
    await dirHandle.removeEntry(f.name);
  }
  return { deleted: toDelete.map((f) => f.name) };
}
