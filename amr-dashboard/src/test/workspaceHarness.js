import { WorkspaceBridge, TOPICS } from '../services/WorkspaceBridge.js';
export function harness() {
  const callbacks = new Map(), requests = [];
  const ros = { status: 'connected', onStatusChange: fn => { ros.changed = fn; return () => {}; }, getTopic: ({ name }) => ({
    subscribe: fn => { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(fn); },
    unsubscribe: fn => callbacks.get(name)?.delete(fn),
    publish: message => { const request = JSON.parse(message.data); requests.push(request); server.onRequest?.(request); },
  }) };
  const session = { confirmed: true, getState: () => ({ status: 'ready', session: { robot_id: 'robot-1', session_id: 'session-1', state: 'active' } }), subscribe: () => () => {} };
  const bridge = new WorkspaceBridge({ ros, session });
  const server = {
    bridge, ros, session, requests,
    send: (topic, data) => callbacks.get(topic)?.forEach(fn => fn({ data: JSON.stringify(data) })),
    reply: (request, result, extra = {}) => server.send(TOPICS.response, { ...request, ok: true, result, ...extra }),
    heartbeat(extra = {}) {
      server.send(TOPICS.state, { schema_version: 1, robot_id: 'robot-1', session_id: 'session-1', sequence: ++server.sequence, capabilities: ['mapping.start', 'mapping.finish', 'mapping.cancel', 'mapping.recover', 'artifact.read', 'artifact.received', 'artifact.begin', 'artifact.write', 'artifact.commit', 'map.activate', 'navigation.indoor', 'operation.reconcile'], operation: { state: 'idle' }, environment: 'indoor', ...extra });
    },
    sequence: 0,
  };
  bridge.start(); server.heartbeat();
  return server;
}
