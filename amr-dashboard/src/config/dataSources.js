/**
 * dataSources — single source of truth for everything the "Data & Backups"
 * page can capture, grouped by category. MCAP topics and the camera-snapshot
 * toggle live in the same list so there is one unified picker.
 *
 * `kind: 'topic'` entries are recorded into the MCAP file by
 * McapRecordingService via `messageType` below. `kind: 'camera'` is the
 * synthetic entry representing periodic camera snapshot capture.
 */
export const dataSources = [
  // Localization
  { id: '/odom', label: 'Odometry', category: 'Localization', kind: 'topic', messageType: 'nav_msgs/Odometry', defaultEnabled: true },
  { id: '/tf', label: 'TF (dynamic)', category: 'Localization', kind: 'topic', messageType: 'tf2_msgs/TFMessage', defaultEnabled: true },
  { id: '/tf_static', label: 'TF (static)', category: 'Localization', kind: 'topic', messageType: 'tf2_msgs/TFMessage', defaultEnabled: true },

  // Perception & Vision
  { id: '/scan', label: 'LiDAR Laser Scan (12.0 Hz)', category: 'Perception', kind: 'topic', messageType: 'sensor_msgs/LaserScan', defaultEnabled: true },
  { id: '/map', label: 'Occupancy Grid Map', category: 'Perception', kind: 'topic', messageType: 'nav_msgs/OccupancyGrid', defaultEnabled: false },
  { id: '/camera/color/image_raw', label: 'Logitech C270 HD Video (RGB8)', category: 'Perception', kind: 'topic', messageType: 'sensor_msgs/Image', defaultEnabled: false },

  // Positioning
  { id: '/hiwonder/gps/fix', label: 'GNSS NavSat Fix', category: 'Positioning', kind: 'topic', messageType: 'sensor_msgs/NavSatFix', defaultEnabled: true },
  { id: '/hiwonder/gps/nmea', label: 'GNSS Raw NMEA String', category: 'Positioning', kind: 'topic', messageType: 'std_msgs/String', defaultEnabled: false },

  // Sensors & IMU
  { id: '/hiwonder/imu/data_raw', label: 'IMU (Accel / Gyro / Orientation)', category: 'Sensors', kind: 'topic', messageType: 'sensor_msgs/Imu', defaultEnabled: true },
  { id: '/hiwonder/imu/mag', label: 'IMU Magnetometer Field', category: 'Sensors', kind: 'topic', messageType: 'sensor_msgs/MagneticField', defaultEnabled: true },

  // System & Power
  { id: '/battery_state', label: 'Battery State & Voltage', category: 'System', kind: 'topic', messageType: 'sensor_msgs/BatteryState', defaultEnabled: true },
  { id: '/amr/session', label: 'Session Heartbeat & Info', category: 'System', kind: 'topic', messageType: 'std_msgs/String', defaultEnabled: true },

  // Robot model
  { id: '/robot_description', label: 'Robot Description (URDF)', category: 'Robot model', kind: 'topic', messageType: 'std_msgs/String', defaultEnabled: false },
  { id: '/joint_states', label: 'Joint States', category: 'Robot model', kind: 'topic', messageType: 'sensor_msgs/JointState', defaultEnabled: false },

  // Commands & Radio
  { id: '/cmd_vel', label: 'Velocity Command (Twist)', category: 'Commands', kind: 'topic', messageType: 'geometry_msgs/Twist', defaultEnabled: true },
  { id: '/radio/cmd_vel', label: 'Radio Velocity Command', category: 'Commands', kind: 'topic', messageType: 'geometry_msgs/Twist', defaultEnabled: false },
  { id: '/radio/channels', label: 'Radio RC Channels (DS-600 Joy)', category: 'Commands', kind: 'topic', messageType: 'sensor_msgs/Joy', defaultEnabled: true },
  { id: '/radio/status', label: 'Radio Link Status', category: 'Commands', kind: 'topic', messageType: 'std_msgs/String', defaultEnabled: true },

  // Imagery & Snapshots
  { id: 'camera-snapshots', label: 'Periodic Camera Snapshots (JPEG)', category: 'Imagery', kind: 'camera', defaultEnabled: false },
];

export const CATEGORY_ORDER = [
  'Localization',
  'Perception',
  'Positioning',
  'Sensors',
  'System',
  'Commands',
  'Robot model',
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
