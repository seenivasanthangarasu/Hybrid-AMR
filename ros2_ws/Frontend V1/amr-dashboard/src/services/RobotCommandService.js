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
 */

const missionStateTopic = () =>
  rosService.getTopic({ name: '/mission_state_cmd', messageType: 'std_msgs/String' });

const cmdVelTopic = () =>
  rosService.getTopic({ name: '/cmd_vel', messageType: 'geometry_msgs/Twist' });

const emergencyStopTopic = () =>
  rosService.getTopic({ name: '/emergency_stop', messageType: 'std_msgs/Bool' });

function publishMissionState(state) {
  const msg = new ROSLIB.Message({ data: state });
  missionStateTopic().publish(msg);
}

export const RobotCommandService = {
  /** START a queued/paused mission */
  start() {
    publishMissionState('START');
  },

  /** PAUSE current mission, robot holds position */
  pause() {
    publishMissionState('PAUSE');
  },

  /** RESUME a previously paused mission */
  resume() {
    publishMissionState('RESUME');
  },

  /** STOP current mission and cancel active navigation goal */
  stop() {
    publishMissionState('STOP');
    const navActionClient = rosService.getActionClient({
      name: '/navigate_to_pose',
      actionType: 'nav2_msgs/action/NavigateToPose',
    });
    navActionClient.cancel?.();
  },

  /** Send the robot back to its configured home/dock pose via Nav2 */
  returnHome() {
    const goal = new ROSLIB.Goal({
      actionClient: rosService.getActionClient({
        name: '/navigate_to_pose',
        actionType: 'nav2_msgs/action/NavigateToPose',
      }),
      goalMessage: { pose: { header: { frame_id: 'map' }, pose: null } }, // pose injected by robot-side "home" service in practice
    });
    goal.send();
    return goal;
  },

  /**
   * EMERGENCY STOP — publishes std_msgs/Bool(true) on /emergency_stop and
   * zeroes /cmd_vel immediately. This is the only command path that
   * bypasses mission state and should be wired to the robot's hardware
   * e-stop interlock, not just software velocity zeroing.
   */
  emergencyStop() {
    emergencyStopTopic().publish(new ROSLIB.Message({ data: true }));
    cmdVelTopic().publish(
      new ROSLIB.Message({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      })
    );
  },

  clearEmergencyStop() {
    emergencyStopTopic().publish(new ROSLIB.Message({ data: false }));
  },

  /**
   * Send a navigation goal (Mission Planner "SEND GOAL").
   * lat/lon are UI inputs only — for an outdoor AMR these would
   * typically be converted to the local map frame via a robot-side
   * GPS-to-map transform service before being sent to Nav2; that
   * conversion service call is left as an explicit integration point
   * rather than computed client-side with assumptions.
   */
  sendGoal({ goalName, latitude, longitude }) {
    const goalTopic = rosService.getTopic({
      name: '/mission_goal',
      messageType: 'amr_msgs/MissionGoal',
    });
    goalTopic.publish(
      new ROSLIB.Message({
        name: goalName,
        latitude: Number(latitude),
        longitude: Number(longitude),
      })
    );
  },
};

export default RobotCommandService;
