/**
 * dataSources — single source of truth for everything the "Data & Backups"
 * page can capture, grouped by category. MCAP topics and the camera-snapshot
 * toggle live in the same list (data-handling-nav2-tasks.md REQ-A4) so there
 * is one picker, not two independently-drifting checkbox lists.
 *
 * `kind: 'topic'` entries are recorded into the MCAP file by
 * McapRecordingService via `messageType` below. `kind: 'camera'` is the
 * single synthetic entry (not a ROS topic) representing periodic camera
 * snapshot capture (REQ-A6/A7).
 */
export const dataSources = [
  { id: '/odom', label: 'Odometry', category: 'Localization', kind: 'topic', messageType: 'nav_msgs/Odometry', defaultEnabled: true },
  { id: '/tf', label: 'TF', category: 'Localization', kind: 'topic', messageType: 'tf2_msgs/TFMessage', defaultEnabled: true },
  { id: '/tf_static', label: 'TF (static)', category: 'Localization', kind: 'topic', messageType: 'tf2_msgs/TFMessage', defaultEnabled: true },

  { id: '/scan', label: 'Laser scan', category: 'Perception', kind: 'topic', messageType: 'sensor_msgs/LaserScan', defaultEnabled: true },
  { id: '/map', label: 'Occupancy map', category: 'Perception', kind: 'topic', messageType: 'nav_msgs/OccupancyGrid', defaultEnabled: false },

  { id: '/hiwonder/gps/fix', label: 'GNSS fix', category: 'Positioning', kind: 'topic', messageType: 'sensor_msgs/NavSatFix', defaultEnabled: true },

  { id: '/hiwonder/imu/data_raw', label: 'IMU (accel / gyro / orientation)', category: 'Sensors', kind: 'topic', messageType: 'sensor_msgs/Imu', defaultEnabled: true },
  { id: '/hiwonder/imu/mag', label: 'IMU magnetometer', category: 'Sensors', kind: 'topic', messageType: 'sensor_msgs/MagneticField', defaultEnabled: true },

  { id: '/robot_description', label: 'Robot description (URDF)', category: 'Robot model', kind: 'topic', messageType: 'std_msgs/String', defaultEnabled: false },
  { id: '/joint_states', label: 'Joint states', category: 'Robot model', kind: 'topic', messageType: 'sensor_msgs/JointState', defaultEnabled: false },

  { id: '/cmd_vel', label: 'Velocity command', category: 'Commands', kind: 'topic', messageType: 'geometry_msgs/Twist', defaultEnabled: true },

  { id: 'camera-snapshots', label: 'Camera snapshots', category: 'Imagery', kind: 'camera', defaultEnabled: false },
];

export const CATEGORY_ORDER = [
  'Localization',
  'Perception',
  'Positioning',
  'Sensors',
  'Robot model',
  'Commands',
  'Imagery',
];

export function dataSourcesByCategory() {
  return CATEGORY_ORDER.map((category) => ({
    category,
    sources: dataSources.filter((s) => s.category === category),
  })).filter((g) => g.sources.length > 0);
}

export function getDataSource(id) {
  return dataSources.find((s) => s.id === id) ?? null;
}
