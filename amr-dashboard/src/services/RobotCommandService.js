import ROSLIB from 'roslib';
import rosService from './RosConnectionService.js';

/**
 * RobotCommandService
 * ---------------------
 * Defines the publisher/service-call architecture for operator actions
 * (mission control buttons + mission planner "SEND GOAL"). This module
 * intentionally does NOT simulate robot behavior or fabricate state
 * changes — it only issues real ROS2 calls. Topic/service names follow
 * common Nav2 + AMR fleet conventions and should be adjusted to match
 * the target robot's actual interface definitions.
 *
 * No command topic here currently has a robot-side ack. Every dispatch
 * that doesn't throw resolves to SENT_UNCONFIRMED, never CONFIRMED —
 * callers must not present SENT_UNCONFIRMED as "the robot did it."
 * See docs/remediation/spec.md REQ-01/REQ-02.
 */

const ERROR_MESSAGES = {
  DISCONNECTED: 'Not connected to ROSBridge',
  EMPTY_ROUTE: 'No waypoints to send',
};

export class CommandError extends Error {
  constructor(code, cause) {
    super(ERROR_MESSAGES[code] ?? 'Failed to publish command');
    this.code = code; // 'DISCONNECTED' | 'PUBLISH_FAILED' | 'EMPTY_ROUTE'
    this.cause = cause;
  }
}

function dispatch(publishFn) {
  if (rosService.status !== 'connected') {
    throw new CommandError('DISCONNECTED');
  }
  try {
    publishFn();
    return { state: 'SENT_UNCONFIRMED' };
  } catch (err) {
    throw new CommandError('PUBLISH_FAILED', err);
  }
}

const missionStateTopic = () =>
  rosService.getTopic({ name: '/mission_state_cmd', messageType: 'std_msgs/String' });

const cmdVelTopic = () => rosService.getTopic({ name: '/cmd_vel', messageType: 'geometry_msgs/Twist' });

const emergencyStopTopic = () =>
  rosService.getTopic({ name: '/emergency_stop', messageType: 'std_msgs/Bool' });

function publishMissionState(state) {
  const msg = new ROSLIB.Message({ data: state });
  missionStateTopic().publish(msg);
}

export const RobotCommandService = {
  /** START a queued/paused mission */
  start() {
    return dispatch(() => publishMissionState('START'));
  },

  /** PAUSE current mission, robot holds position */
  pause() {
    return dispatch(() => publishMissionState('PAUSE'));
  },

  /** RESUME a previously paused mission */
  resume() {
    return dispatch(() => publishMissionState('RESUME'));
  },

  /** STOP current mission and cancel active navigation goal */
  stop() {
    return dispatch(() => {
      publishMissionState('STOP');
      const navActionClient = rosService.getActionClient({
        name: '/navigate_to_pose',
        actionType: 'nav2_msgs/action/NavigateToPose',
      });
      navActionClient.cancel?.();
    });
  },

  /**
   * Send the robot back to its configured home/dock pose via Nav2.
   *
   * BACKEND-INTEGRATION GAP (tracked with the F1/F2 ack dependency, not a
   * frontend bug): the goal is sent with `pose: null` because the actual home
   * pose is expected to be filled in by a robot-side "home" service that does
   * not exist yet. Until that lands, this is a silent no-op on the robot side.
   * The dashboard still honestly reports SENT_UNCONFIRMED (never CONFIRMED),
   * so it does not imply the robot acted — see docs/remediation/spec.md.
   */
  returnHome() {
    let goal;
    dispatch(() => {
      goal = new ROSLIB.Goal({
        actionClient: rosService.getActionClient({
          name: '/navigate_to_pose',
          actionType: 'nav2_msgs/action/NavigateToPose',
        }),
        goalMessage: { pose: { header: { frame_id: 'map' }, pose: null } },
      });
      goal.send();
    });
    return goal;
  },

  /**
   * EMERGENCY STOP — publishes std_msgs/Bool(true) on /emergency_stop and
   * zeroes /cmd_vel immediately. This is the only command path that
   * bypasses mission state and should be wired to the robot's hardware
   * e-stop interlock, not just software velocity zeroing.
   *
   * Throws CommandError if disconnected or the publish itself fails —
   * callers MUST surface this to the operator, never swallow it.
   */
  emergencyStop() {
    return dispatch(() => {
      emergencyStopTopic().publish(new ROSLIB.Message({ data: true }));
      cmdVelTopic().publish(
        new ROSLIB.Message({
          linear: { x: 0, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: 0 },
        }),
      );
    });
  },

  clearEmergencyStop() {
    return dispatch(() => {
      emergencyStopTopic().publish(new ROSLIB.Message({ data: false }));
    });
  },

  /**
   * Send a multi-waypoint route (Mission Planner "SEND ROUTE").
   *
   * Uses Nav2's FollowGPSWaypoints action rather than a bespoke message for
   * two reasons:
   *
   *  1. **Sequencing belongs on the robot.** The action server drives the
   *     route waypoint-by-waypoint. The alternative — the dashboard sending
   *     goal N+1 once it believes N was reached — would require a "reached"
   *     signal that does not exist, leaving the browser to guess arrival from
   *     GPS proximity. That guess is exactly the fabricated state this
   *     codebase forbids.
   *  2. **It takes GeoPoses directly.** `sendGoal` below has to punt on
   *     lat/lon → map-frame conversion; FollowGPSWaypoints consumes geographic
   *     coordinates natively, so no client-side datum assumptions are needed.
   *
   * BACKEND-INTEGRATION GAP (same class as returnHome, tracked with F1/F2):
   * `/follow_gps_waypoints` has no server in this workspace — Nav2 is not
   * deployed. The goal goes onto the wire and nothing consumes it, so the
   * result stays SENT_UNCONFIRMED.
   *
   * PROTOCOL GAP — read before wiring a real Nav2 stack: roslib 1.4.1's
   * ActionClient implements **ROS1 actionlib**, publishing on
   * `<name>/goal` with an actionlib_msgs-style wrapper. A ROS2 action server
   * exposes no such topic, so this will not reach Nav2 as-is regardless of
   * whether Nav2 is running. Whoever lands the robot side must switch this
   * (and returnHome/stop, which have the same defect today) to the rosbridge
   * ROS2 action op — `ros.callOnConnection({ op: 'send_action_goal',
   * action, action_type, args })` — or to a roslib build with ROS2 action
   * support. Kept on ActionClient here to match the file's existing
   * convention rather than introduce a second, equally unverifiable path.
   *
   * The returned `goal` is the ROSLIB handle. When a Nav2 stack does land,
   * per-waypoint status comes from wiring `goal.on('feedback')`
   * (`current_waypoint`) and `goal.on('result')` (`missed_waypoints`) to the
   * planner — that is the ONLY sanctioned source for advancing a waypoint past
   * SENT_UNCONFIRMED.
   */
  sendWaypoints(waypoints) {
    if (!waypoints?.length) throw new CommandError('EMPTY_ROUTE');

    let goal;
    const result = dispatch(() => {
      goal = new ROSLIB.Goal({
        actionClient: rosService.getActionClient({
          name: '/follow_gps_waypoints',
          actionType: 'nav2_msgs/action/FollowGPSWaypoints',
        }),
        goalMessage: {
          gps_poses: waypoints.map((wp) => ({
            position: {
              latitude: Number(wp.latitude),
              longitude: Number(wp.longitude),
              altitude: 0,
            },
            // Identity orientation: the operator picks a position on the map,
            // not a heading. Nav2 treats the final pose orientation as the
            // goal yaw; leaving it identity means "any heading on arrival"
            // rather than silently inventing one.
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          })),
        },
      });
      goal.send();
    });

    return { ...result, goal };
  },

  /**
   * Send a single navigation goal on the legacy `/mission_goal` contract.
   *
   * Retained alongside sendWaypoints because it is a different interface, not
   * a subset: it carries an operator-facing goal *name* that the Nav2 action
   * has no field for. lat/lon are UI inputs only — for an outdoor AMR these
   * would typically be converted to the local map frame via a robot-side
   * GPS-to-map transform service before being sent to Nav2; that conversion
   * service call is left as an explicit integration point rather than computed
   * client-side with assumptions.
   */
  sendGoal({ goalName, latitude, longitude }) {
    return dispatch(() => {
      const goalTopic = rosService.getTopic({
        name: '/mission_goal',
        messageType: 'amr_msgs/MissionGoal',
      });
      goalTopic.publish(
        new ROSLIB.Message({
          name: goalName,
          latitude: Number(latitude),
          longitude: Number(longitude),
        }),
      );
    });
  },
};

export default RobotCommandService;
