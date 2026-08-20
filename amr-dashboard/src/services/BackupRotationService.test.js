import { describe, it, expect } from 'vitest';
import { backupFileName, listBackupFiles, enforceRetention } from './BackupRotationService.js';

function fakeDir(names) {
  const files = new Map(names.map((n) => [n, { kind: 'file', name: n }]));
  return {
    async *values() {
      for (const f of files.values()) yield f;
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw new Error(`no such entry: ${name}`);
    },
    _files: files,
  };
}

describe('backupFileName', () => {
  it('formats prefix-YYYYMMDD-HHMMSS.extension', () => {
    const date = new Date(2026, 7, 20, 9, 5, 3); // 2026-08-20 09:05:03 local
    expect(backupFileName('mission', 'mcap', date)).toBe('mission-20260820-090503.mcap');
    expect(backupFileName('camera', 'jpg', date)).toBe('camera-20260820-090503.jpg');
  });
});

describe('listBackupFiles', () => {
  it('returns only files matching the prefix/extension, oldest first', async () => {
    const dir = fakeDir([
      'mission-20260820-090503.mcap',
      'mission-20260819-120000.mcap',
      'camera-20260820-090503.jpg', // different prefix — excluded
      'mission-20260820-090503.jpg', // right prefix, wrong extension — excluded
      'not-a-backup.txt',
    ]);
    const files = await listBackupFiles(dir, { prefix: 'mission', extension: 'mcap' });
    expect(files.map((f) => f.name)).toEqual([
      'mission-20260819-120000.mcap',
      'mission-20260820-090503.mcap',
    ]);
  });
});

describe('enforceRetention', () => {
  it('deletes the oldest files beyond retainCount', async () => {
    const dir = fakeDir([
      'mission-20260817-000000.mcap',
      'mission-20260818-000000.mcap',
      'mission-20260819-000000.mcap',
      'mission-20260820-000000.mcap',
    ]);
    const { deleted } = await enforceRetention(dir, { prefix: 'mission', extension: 'mcap', retainCount: 2 });
    expect(deleted).toEqual(['mission-20260817-000000.mcap', 'mission-20260818-000000.mcap']);
    expect([...dir._files.keys()]).toEqual(['mission-20260819-000000.mcap', 'mission-20260820-000000.mcap']);
  });

  it('does nothing when under the retention count', async () => {
    const dir = fakeDir(['mission-20260820-000000.mcap']);
    const { deleted } = await enforceRetention(dir, { prefix: 'mission', extension: 'mcap', retainCount: 5 });
    expect(deleted).toEqual([]);
    expect(dir._files.size).toBe(1);
  });

  it('does nothing when retainCount is unset/invalid, rather than deleting everything', async () => {
    const dir = fakeDir(['mission-20260820-000000.mcap']);
    await enforceRetention(dir, { prefix: 'mission', extension: 'mcap', retainCount: undefined });
    await enforceRetention(dir, { prefix: 'mission', extension: 'mcap', retainCount: 0 });
    await enforceRetention(dir, { prefix: 'mission', extension: 'mcap', retainCount: NaN });
    expect(dir._files.size).toBe(1);
  });

  it('keeps camera and mcap backups independent when sharing a folder', async () => {
    const dir = fakeDir([
      'camera-20260818-000000.jpg',
      'camera-20260819-000000.jpg',
      'camera-20260820-000000.jpg',
      'mission-20260820-000000.mcap',
    ]);
    await enforceRetention(dir, { prefix: 'camera', extension: 'jpg', retainCount: 1 });
    expect([...dir._files.keys()]).toEqual(['camera-20260820-000000.jpg', 'mission-20260820-000000.mcap']);
  });
});
