import { describe, it, expect, vi, afterEach } from 'vitest';
import { AmrSessionService, parseSession, sessionFolderName } from './AmrSessionService.js';

const session = { schema_version: 1, robot_id: 'amr-1', session_id: 'boot-1', started_at: '2026-09-25T10:00:00.000Z', state: 'active' };
const msg = (s = session) => ({ data: JSON.stringify(s) });
function setup() {
  const dirs = new Map();
  const root = {
    queryPermission: vi.fn().mockResolvedValue('granted'),
    getDirectoryHandle: vi.fn(async (name) => {
      if (!dirs.has(name)) dirs.set(name, { getFileHandle: vi.fn(async () => ({ createWritable: async () => ({ write: vi.fn(), close: vi.fn() }) })) });
      return dirs.get(name);
    }),
  };
  let onStatus, onMessage;
  const ros = { status: 'connected', epoch: 1,
    onStatusChange: (cb) => { onStatus = cb; cb('connected'); return () => {}; },
    getTopic: () => ({ subscribe: (cb) => { onMessage = cb; }, unsubscribe: vi.fn() }),
  };
  const recorder = { start: vi.fn().mockResolvedValue(), stop: vi.fn().mockResolvedValue() };
  const camera = { start: vi.fn().mockResolvedValue(), stop: vi.fn() };
  const service = new AmrSessionService({ ros, recorder, camera, storage: { getSavedFolder: async () => root } });
  service.start();
  return { service, root, dirs, recorder, camera, ros, send: (s) => onMessage(msg(s)), connection: (s) => { ros.status = s; onStatus(s); } };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('AMR session ownership and storage', () => {
  it('rejects traversal and invalid timestamps', () => {
    expect(() => parseSession(JSON.stringify({ ...session, session_id: '../escape' }))).toThrow();
    expect(() => parseSession(JSON.stringify({ ...session, started_at: '2026-02-30T10:00:00.000Z' }))).toThrow();
    expect(sessionFolderName(session)).toBe('2026-09-25T10-00-00.000Z__amr-1__boot-1');
  });
  it('blocks recording before confirmation and puts both writers in the session directory', async () => {
    vi.useFakeTimers(); const x = setup();
    await expect(x.service.startCapture({ recording: {} })).rejects.toThrow();
    x.send(session); await x.service.queue;
    expect(x.service.state.status).toBe('ready');
    await x.service.startCapture({ recording: { sources: [] }, snapshots: {} });
    const dir = x.dirs.get(sessionFolderName(session));
    expect(x.recorder.start).toHaveBeenCalledWith(expect.objectContaining({ dirHandle: dir }));
    expect(x.camera.start).toHaveBeenCalledWith(expect.objectContaining({ dirHandle: dir }));
  });
  it('reuses a folder on heartbeat/reconnect and separates the next boot', async () => {
    vi.useFakeTimers(); const x = setup(); x.send(session); await x.service.queue;
    x.send(session); await x.service.queue;
    expect(x.root.getDirectoryHandle).toHaveBeenCalledTimes(1);
    x.connection('closed'); x.ros.epoch++; x.connection('connected');
    await expect(x.service.startCapture({ recording: {} })).rejects.toThrow();
    x.send(session); await x.service.queue; expect(x.dirs.size).toBe(1);
    x.send({ ...session, session_id: 'boot-2' }); await x.service.queue;
    expect(x.dirs.size).toBe(2); expect(x.camera.stop).toHaveBeenCalled();
  });
  it('stops on heartbeat timeout and cannot revive a stale session by choosing a folder', async () => {
    vi.useFakeTimers(); const x = setup(); x.send(session); await x.service.queue;
    await vi.advanceTimersByTimeAsync(10001);
    expect(x.service.state.status).toBe('stale');
    await x.service.setRoot(x.root);
    await expect(x.service.startCapture({ snapshots: {} })).rejects.toThrow();
  });
  it('requires folder permission and never falls back to the root', async () => {
    vi.useFakeTimers(); const x = setup(); x.root.queryPermission.mockResolvedValue('prompt');
    x.send(session); await x.service.queue;
    expect(x.service.state.status).toBe('needs-permission'); expect(x.dirs.size).toBe(0);
    await expect(x.service.startCapture({ snapshots: {} })).rejects.toThrow();
  });
  it('ends a session and rejects changed start times', async () => {
    vi.useFakeTimers(); const x = setup(); x.send(session); await x.service.queue;
    x.send({ ...session, started_at: '2026-09-25T11:00:00.000Z' });
    expect(x.service.state.status).toBe('error');
    x.send({ ...session, state: 'ended' }); await x.service.queue;
    await expect(x.service.startCapture({ snapshots: {} })).rejects.toThrow();
  });
  it('does not activate an obsolete directory after a session transition', async () => {
    vi.useFakeTimers(); const x = setup(); let release;
    x.root.queryPermission.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    x.send(session);
    for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
    x.send({ ...session, session_id: 'boot-2' }); release('granted'); await x.service.queue;
    expect(x.service.state.session.session_id).toBe('boot-2');
    expect(x.service.dir).toBe(x.dirs.get(sessionFolderName({ ...session, session_id: 'boot-2' })));
  });
});
