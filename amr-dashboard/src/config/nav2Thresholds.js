/**
 * nav2Thresholds — the curated Nav2 parameter set the dashboard lets an
 * operator tune (data-handling-nav2-tasks.md REQ-B0), with the safe
 * min/max range used for client-side validation before any SetParameters
 * call is made.
 *
 * `id` is the full name passed to `Nav2ParameterService` — it's the same
 * `<node>.<plugin>.<param>` prefixed form the robot-side whitelisting
 * gatekeeper (docs/robot-repo-tasks.md) expects, since the dashboard talks
 * to that gatekeeper's single service pair rather than to each Nav2 node's
 * own raw parameter services directly (see that doc's security-decision
 * section for why). Defaults/ranges here are kept identical to the
 * gatekeeper's own server-side `ALLOWED_PARAMS` table so both sides agree
 * on what's safe, independently of each other.
 */
export const NAV2_THRESHOLDS = [
  {
    id: 'local_costmap.inflation_layer.inflation_radius',
    label: 'Inflation radius',
    unit: 'm',
    min: 0.05,
    max: 2.0,
    step: 0.05,
    default: 0.55,
  },
  {
    id: 'local_costmap.obstacle_layer.scan.obstacle_max_range',
    label: 'Obstacle max range',
    unit: 'm',
    min: 0.5,
    max: 10.0,
    step: 0.1,
    default: 2.5,
  },
  {
    id: 'controller_server.FollowPath.max_vel_x',
    label: 'Max linear velocity',
    unit: 'm/s',
    min: 0.05,
    max: 1.5,
    step: 0.05,
    default: 0.5,
  },
  {
    id: 'controller_server.FollowPath.min_vel_x',
    label: 'Min linear velocity',
    unit: 'm/s',
    min: -0.5,
    max: 0.0,
    step: 0.05,
    default: 0.0,
  },
  {
    id: 'controller_server.FollowPath.max_vel_theta',
    label: 'Max angular velocity',
    unit: 'rad/s',
    min: 0.1,
    max: 3.0,
    step: 0.1,
    default: 1.0,
  },
  {
    id: 'controller_server.general_goal_checker.xy_goal_tolerance',
    label: 'XY goal tolerance',
    unit: 'm',
    min: 0.05,
    max: 1.0,
    step: 0.05,
    default: 0.25,
  },
  {
    id: 'controller_server.general_goal_checker.yaw_goal_tolerance',
    label: 'Yaw goal tolerance',
    unit: 'rad',
    min: 0.05,
    max: 1.0,
    step: 0.05,
    default: 0.25,
  },
];

export function inRange(threshold, value) {
  return Number.isFinite(value) && value >= threshold.min && value <= threshold.max;
}
