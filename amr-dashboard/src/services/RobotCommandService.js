import ROSLIB from 'roslib';
import rosService from './RosConnectionService.js';
import bridge from './WorkspaceBridge.js';

const ERROR_MESSAGES = {
  DISCONNECTED: 'Not connected to ROSBridge', EMPTY_ROUTE: 'No waypoints to send',
  INVALID_COORDINATES: 'Coordinates must be finite numbers within bounds',
};
export class CommandError extends Error {
  constructor(code, cause) { super(ERROR_MESSAGES[code] || cause?.message || 'Failed to publish command'); this.code = code; this.cause = cause; }
}
function finite(value) { return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)); }
function dispatch(fn) {
  if (rosService.status !== 'connected') throw new CommandError('DISCONNECTED');
  try { fn(); return { state: 'SENT_UNCONFIRMED' }; }
  catch (error) { throw new CommandError('PUBLISH_FAILED', error); }
}
function requireLink() { if (rosService.status !== 'connected') throw new CommandError('DISCONNECTED'); }
function navigate(environment, args) {
  requireLink();
  bridge.navigationReady(environment);
  bridge.assertIdle();
  const goalId = crypto.randomUUID();
  const listeners = new Map();
  const goal = { on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return goal; }, off(event, fn) { listeners.get(event)?.delete(fn); } };
  const emit = (event, data) => listeners.get(event)?.forEach(fn => fn(data));
  bridge.localOperation = goalId;
  const unsubscribe = bridge.subscribe(state => {
    if (!state) { emit('result', { status: 'unknown', error: 'Connection/readiness lost. Reconcile the operation.' }); unsubscribe(); return; }
    const current = state.goal;
    if (current?.goal_id !== goalId || current.client_id !== bridge.clientId) return;
    if (['succeeded', 'failed', 'canceled'].includes(current.status)) {
      bridge.localOperation = null; emit('result', current); unsubscribe();
    } else if (['accepted', 'executing'].includes(current.status)) emit('feedback', current);
  });
  const selected = bridge.selection.selectedMap;
  const argsWithIdentity = { ...args, goal_id: goalId, ...(environment === 'indoor' ? { map_id: selected.map_id, revision: selected.revision, package_sha256: selected.package_sha256, activation_id: bridge.selection.mapActivation.operationId } : {}) };
  bridge.request(`navigation.${environment}`, argsWithIdentity, { requestId: goalId }).then(result => {
    if (result?.goal_id !== goalId || result.status !== 'accepted') throw new Error('Goal acceptance not confirmed.');
    emit('feedback', result);
  }).catch(error => { emit('result', { status: 'unknown', error: error.message }); unsubscribe(); });
  return { state: 'SENT_UNCONFIRMED', goal };
}
async function mission(op) {
  requireLink();
  if (['operation.start', 'operation.resume', 'navigation.home'].includes(op)) bridge.navigationReady(bridge.selection?.effectiveEnvironment);
  const result = await bridge.request(op);
  if (result?.acknowledged !== true) throw new Error('Robot did not acknowledge the operation request.');
  return { state: 'SENT_UNCONFIRMED' }; // acknowledgement is not mission completion
}
export const RobotCommandService = {
  start: () => mission('operation.start'),
  pause: () => mission('operation.pause'),
  resume: () => mission('operation.resume'),
  stop: () => mission('operation.cancel'),
  returnHome: () => mission('navigation.home'),
  emergencyStop() {
    return dispatch(() => {
      rosService.getTopic({ name: '/emergency_stop', messageType: 'std_msgs/Bool' }).publish(new ROSLIB.Message({ data: true }));
      rosService.getTopic({ name: '/cmd_vel', messageType: 'geometry_msgs/Twist' }).publish(new ROSLIB.Message({ linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } }));
    });
  },
  clearEmergencyStop() {
    return dispatch(() => rosService.getTopic({ name: '/emergency_stop', messageType: 'std_msgs/Bool' }).publish(new ROSLIB.Message({ data: false })));
  },
  sendWaypoints(waypoints) {
    if (!waypoints?.length) throw new CommandError('EMPTY_ROUTE');
    if (waypoints.length > 256) throw new Error('Maximum 256 waypoints per route.');
    const coordinates = waypoints.map(wp => {
      if (!finite(wp.latitude) || !finite(wp.longitude) || Math.abs(Number(wp.latitude)) > 90 || Math.abs(Number(wp.longitude)) > 180) throw new CommandError('INVALID_COORDINATES');
      return { latitude: Number(wp.latitude), longitude: Number(wp.longitude) };
    });
    return navigate('outdoor', { waypoints: coordinates, arrival_heading: 'server_policy' });
  },
  sendGoal({ latitude, longitude }) { return this.sendWaypoints([{ latitude, longitude }]); },
  sendIndoorGoal({ x, y, yaw, frameId = 'map' }) {
    if (![x,y,yaw].every(finite) || frameId !== 'map') throw new CommandError('INVALID_COORDINATES');
    return navigate('indoor', { x: Number(x), y: Number(y), yaw: Number(yaw), frame_id: frameId });
  },
  async setInitialPose({ x, y, yaw, frameId = 'map' }) {
    if (![x,y,yaw].every(finite) || frameId !== 'map') throw new CommandError('INVALID_COORDINATES');
    requireLink(); bridge.assertMode('indoor', 'navigation');
    const map = bridge.selection?.selectedMap, activation = bridge.selection?.mapActivation;
    if (!map || activation?.status !== 'awaiting_localization') throw new Error('Activate a map before setting an initial pose.');
    const result = await bridge.request('map.initial_pose', { operation_id: activation.operationId, map_id: map.map_id, revision: map.revision, package_sha256: map.package_sha256, x: Number(x), y: Number(y), yaw: Number(yaw), frame_id: frameId });
    if (result?.acknowledged !== true) throw new Error('Initial pose was not acknowledged.');
    return { state: 'SENT_UNCONFIRMED' }; // never implies localization convergence
  },
};
export default RobotCommandService;
