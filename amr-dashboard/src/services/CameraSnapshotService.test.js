import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CameraSnapshotService } from './CameraSnapshotService.js';

function fakeSubDirHandle() {
  const files = new Map(); // name -> Blob
  return {
    files,
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name)) {
        if (!create) throw new Error(`no such file: ${name}`);
        files.set(name, null);
      }
      return {
        async createWritable() {
          return {
            async write(blob) {
              files.set(name, blob);
            },
            async close() {},
          };
        },
      };
    },
    async *values() {
      for (const name of files.keys()) yield { kind: 'file', name };
    },
    async removeEntry(name) {
      files.delete(name);
    },
  };
}

function fakeDirHandle() {
  const camera = fakeSubDirHandle();
  return {
    camera,
    async getDirectoryHandle(name) {
      if (name !== 'camera') throw new Error(`unexpected subfolder: ${name}`);
      return camera;
    },
  };
}

// URL.createObjectURL/revokeObjectURL don't exist in jsdom.
beforeEach(() => {
  let n = 0;
  global.URL.createObjectURL = vi.fn(() => `blob:fake-${n++}`);
  global.URL.revokeObjectURL = vi.fn();
});

describe('CameraSnapshotService', () => {
  let service;

  beforeEach(() => {
    service = new CameraSnapshotService();
  });

  it('captures successfully on start and writes into a camera/ subfolder', async () => {
    const dir = fakeDirHandle();
    const blob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
    service._captureFrame = vi.fn().mockResolvedValue(blob);

    const captures = [];
    service.onCapture((url) => captures.push(url));

    await service.start({ dirHandle: dir, streamUrl: 'http://robot:8080/stream', intervalSec: 30 });

    expect(service.status).toBe('capturing');
    expect(dir.camera.files.size).toBe(1);
    expect(captures).toHaveLength(1);
    service.stop();
  });

  it('goes to "unavailable" on the tainted-canvas SecurityError and does not start an interval', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      service._captureFrame = vi.fn().mockRejectedValue(new DOMException('tainted', 'SecurityError'));

      await service.start({ dirHandle: dir, streamUrl: 'http://robot:8080/stream', intervalSec: 30 });

      expect(service.status).toBe('unavailable');
      expect(dir.camera.files.size).toBe(0);

      // Confirm no capture loop was scheduled — advancing time triggers nothing further.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(service._captureFrame).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('captures repeatedly on the configured interval', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      const blob = new Blob(['x'], { type: 'image/jpeg' });
      service._captureFrame = vi.fn().mockResolvedValue(blob);

      await service.start({ dirHandle: dir, streamUrl: 'http://robot:8080/stream', intervalSec: 10 });
      expect(service._captureFrame).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(service._captureFrame).toHaveBeenCalledTimes(3);

      service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a transient (non-security) capture failure is reported but does not stop the session', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      const errors = [];
      service.onError((err) => errors.push(err));
      service._captureFrame = vi
        .fn()
        .mockResolvedValueOnce(new Blob(['ok'], { type: 'image/jpeg' }))
        .mockRejectedValueOnce(new Error('stream momentarily down'))
        .mockResolvedValueOnce(new Blob(['ok-again'], { type: 'image/jpeg' }));

      await service.start({ dirHandle: dir, streamUrl: 'http://robot:8080/stream', intervalSec: 5 });
      expect(service.status).toBe('capturing');

      await vi.advanceTimersByTimeAsync(5_000); // the failing attempt
      expect(service.status).toBe('capturing'); // still capturing, not unavailable
      expect(errors).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(5_000); // recovers
      expect(dir.camera.files.size).toBe(2); // the two successful writes

      service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces retention across repeated captures', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      service._captureFrame = vi.fn().mockImplementation(() => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })));

      await service.start({ dirHandle: dir, streamUrl: 'http://robot:8080/stream', intervalSec: 1, retainCount: 2 });
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- deliberately sequential ticks
        await vi.advanceTimersByTimeAsync(1000);
      }

      expect(dir.camera.files.size).toBeLessThanOrEqual(2);
      service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() clears the interval and revokes the last object URL cleanly', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      service._captureFrame = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
      await service.start({ dirHandle: dir, streamUrl: 'http://robot:8080/stream', intervalSec: 5 });

      service.stop();
      expect(service.status).toBe('stopped');
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();

      const callsBeforeAdvance = service._captureFrame.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(service._captureFrame.mock.calls.length).toBe(callsBeforeAdvance); // no further ticks
    } finally {
      vi.useRealTimers();
    }
  });
  it('discards an in-flight frame when the session stops', async () => {
    const dir = fakeDirHandle();
    let finish;
    service._captureFrame = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const starting = service.start({ dirHandle: dir, streamUrl: 'http://robot/stream', intervalSec: 5 });
    await Promise.resolve(); await Promise.resolve();
    service.stop();
    finish(new Blob(['old-session-image']));
    await starting;
    expect(dir.camera.files.size).toBe(0);
    expect(service.status).toBe('stopped');
    expect(service._intervalId).toBeNull();
  });

  it('never overwrites a capture when restarted within the same second', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      service._captureFrame = vi.fn().mockResolvedValue(new Blob(['image']));
      await service.start({ dirHandle: dir, streamUrl: 'http://robot/stream', intervalSec: 5 });
      service.stop();
      await service.start({ dirHandle: dir, streamUrl: 'http://robot/stream', intervalSec: 5 });
      service.stop();
      expect(dir.camera.files.size).toBe(2);
    } finally { vi.useRealTimers(); }
  });

});
