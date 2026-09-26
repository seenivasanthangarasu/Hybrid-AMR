import { WorkspaceBridge, TOPICS, HEARTBEAT_MS } from './WorkspaceBridge.js';
import { harness } from '../test/workspaceHarness.js';

describe('WorkspaceBridge strict correlation and lifecycle', () => {
  let server;
  beforeEach(() => { server = harness(); });
  afterEach(() => { server.bridge.stop(); vi.useRealTimers(); });
  it('subscribes before sending and accepts immediate correlated responses', async () => {
    server.onRequest = request => server.reply(request, { value: 42 });
    expect(await server.bridge.request('mapping.start')).toEqual({ value: 42 });
  });
  it('ignores missing or wrong session/request/client identity', async () => {
    const pending = server.bridge.request('mapping.start');
    const request = server.requests[0];
    let done = false; pending.then(() => { done = true; });
    server.reply(request, {}, { client_id: 'other' });
    server.reply(request, {}, { session_id: 'old-session' });
    server.reply(request, {}, { request_id: undefined });
    await Promise.resolve(); expect(done).toBe(false);
    server.reply(request, { state: 'running' });
    expect(await pending).toEqual({ state: 'running' });
  });
  it('rejects pending requests on disconnect, retains uncertain operation lock', async () => {
    server.bridge.localOperation = 'pending-op';
    const pending = server.bridge.request('mapping.start');
    server.ros.changed('disconnected');
    await expect(pending).rejects.toThrow(/connection/);
    expect(() => server.bridge.assertIdle()).toThrow(/unknown/);
  });
  it('expires readiness on heartbeat loss and refuses duplicate state sequences', () => {
    vi.useFakeTimers(); server.heartbeat();
    const sequence = server.sequence;
    server.heartbeat({ sequence });
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(server.bridge.state).toBeNull();
    expect(() => server.bridge.assertAvailable('mapping.start')).toThrow(/unavailable/);
  });
  it('does not unlock on unrelated idle heartbeat', () => {
    server.bridge.localOperation = 'run-request';
    server.heartbeat(); expect(() => server.bridge.assertIdle()).toThrow();
    server.heartbeat({ reconciled_request_ids: ['run-request'] });
    expect(() => server.bridge.assertIdle()).not.toThrow();
  });
  it('requires advertised capability, confirmed session and valid configured mode', async () => {
    await expect(server.bridge.request('invented')).rejects.toThrow(/does not support/);
    server.bridge.setSelection({ effectiveEnvironment: 'outdoor', operatingMode: 'mapping' });
    expect(() => server.bridge.assertMode('indoor', 'mapping')).toThrow();
    server.session.confirmed = false;
    await expect(server.bridge.request('mapping.start')).rejects.toThrow(/confirmed/);
    expect(WorkspaceBridge).toBeDefined(); expect(TOPICS.request).toBe('/amr/workspace/request');
  });
});
