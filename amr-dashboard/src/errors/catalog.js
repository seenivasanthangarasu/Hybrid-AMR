/**
 * Error catalog — one source of truth for every condition the dashboard can
 * explain to an operator.
 *
 * The dashboard's guiding rule (docs/remediation/spec.md) is that it must never
 * imply something is fine when it isn't. A bare "NO DATA" satisfies that only
 * halfway: it says *something* is wrong but not **what**, **why**, or **what to
 * do**. Every entry here carries those three, so an inline badge, a dialog, and
 * the reference page all describe a fault identically.
 *
 * Fields:
 *   code      stable id (used by dialogs, tests, and the reference page)
 *   title     short human headline
 *   category  LINK | TELEMETRY | COMMAND | SYSTEM  (groups the reference page)
 *   tone      signalTones key → drives colour everywhere it renders
 *   severity  operator-facing seriousness
 *   summary   one sentence: what is actually true right now
 *   causes    why this happens, most likely first
 *   remedies  concrete operator/engineer actions, in order
 *   blocking  true when the robot cannot be commanded in this state
 */

export const CATEGORIES = {
  LINK: 'Connection',
  TELEMETRY: 'Telemetry',
  COMMAND: 'Commands',
  SYSTEM: 'System',
};

export const ERRORS = {
  LINK_OFFLINE: {
    code: 'LINK_OFFLINE',
    title: 'No rosbridge link',
    category: 'LINK',
    tone: 'critical',
    severity: 'Critical',
    blocking: true,
    summary:
      'The dashboard is not connected to rosbridge, so no telemetry is arriving and no command can be sent.',
    causes: [
      'The rosbridge_server node is not running on the robot.',
      'VITE_ROSBRIDGE_URL points at the wrong host or port.',
      'The robot is powered down, or off the network / on a different subnet.',
      'A firewall is blocking the WebSocket port (default 9090).',
    ],
    remedies: [
      'Press RECONNECT in the header — it re-establishes the link without reloading.',
      'On the robot, start rosbridge: ros2 launch rosbridge_server rosbridge_websocket_launch.xml',
      'Confirm the URL in amr-dashboard/.env (VITE_ROSBRIDGE_URL) matches the robot.',
      'Verify the robot is reachable from this workstation (ping / same VLAN).',
    ],
  },

  LINK_CONNECTING: {
    code: 'LINK_CONNECTING',
    title: 'Link negotiating',
    category: 'LINK',
    tone: 'warn',
    severity: 'Info',
    blocking: true,
    summary: 'The WebSocket handshake to rosbridge is still in progress. Values shown are not live yet.',
    causes: [
      'The page was just opened or RECONNECT was just pressed.',
      'The robot is slow to answer, or the network is congested.',
    ],
    remedies: [
      'Wait a few seconds — this resolves itself on a healthy network.',
      'If it never reaches LINKED, treat it as “No rosbridge link” and check that rosbridge is running.',
    ],
  },

  TOPIC_NO_SIGNAL: {
    code: 'TOPIC_NO_SIGNAL',
    title: 'No publisher on topic',
    category: 'TELEMETRY',
    tone: 'idle',
    severity: 'Warning',
    blocking: false,
    summary:
      'The rosbridge link is healthy, but nothing has ever published on this topic — so this view has no data to draw.',
    causes: [
      'The sensor driver for this topic is not running on the robot.',
      'The topic is published under a different name than the dashboard subscribes to.',
      'The sensor is powered but faulty, or its cable is disconnected.',
    ],
    remedies: [
      'On the robot, check the topic is live: ros2 topic hz <topic>',
      'List what is actually advertised: ros2 topic list',
      'Start the matching sensor driver / bringup launch file.',
      'If the name differs, update the topic in the relevant hook under src/hooks/.',
    ],
  },

  DATA_STALE: {
    code: 'DATA_STALE',
    title: 'Telemetry is stale',
    category: 'TELEMETRY',
    tone: 'stale',
    severity: 'Warning',
    blocking: false,
    summary:
      'This value did arrive earlier but has not updated within its freshness window. The number on screen is the last known reading, not a live one.',
    causes: [
      'The publisher stopped, crashed, or is blocked.',
      'The publish rate dropped below the expected rate.',
      'Network congestion is delaying messages over the WebSocket.',
    ],
    remedies: [
      'Treat the displayed value as historical — do not act on it as current.',
      'Check the publisher is still alive: ros2 topic hz <topic>',
      'Inspect the robot node’s logs for errors around the time it went quiet.',
    ],
  },

  POSE_UNAVAILABLE: {
    code: 'POSE_UNAVAILABLE',
    title: 'Robot pose unavailable',
    category: 'TELEMETRY',
    tone: 'warn',
    severity: 'Warning',
    blocking: false,
    summary:
      'A map is being drawn, but no map → base_link transform is arriving, so the robot marker cannot be placed.',
    causes: [
      'No localization node (AMCL / SLAM) is running.',
      'The TF tree is broken or the frame names differ from map / base_link.',
      'Localization has not yet converged after startup.',
    ],
    remedies: [
      'Start localization or SLAM on the robot.',
      'Inspect the tree: ros2 run tf2_tools view_frames',
      'Confirm the fixed frame and robot frame names match the dashboard’s useTF call.',
    ],
  },

  CAMERA_STREAM_DOWN: {
    code: 'CAMERA_STREAM_DOWN',
    title: 'No camera stream',
    category: 'TELEMETRY',
    tone: 'idle',
    severity: 'Warning',
    blocking: false,
    summary:
      'The MJPEG stream from web_video_server could not be loaded. The camera panel retries automatically and recovers on its own when the stream returns.',
    causes: [
      'web_video_server is not running on the robot.',
      'VITE_WEB_VIDEO_URL points at the wrong host or port (default :8080).',
      'The camera driver is not publishing the configured image topic.',
    ],
    remedies: [
      'On the robot: ros2 run web_video_server web_video_server',
      'Open the stream URL directly in a browser tab to confirm it serves video.',
      'Check the camera topic is publishing: ros2 topic hz /camera/camera/color/image_raw',
      'Note: the camera does NOT use rosbridge — a healthy LINKED chip says nothing about it.',
    ],
  },

  MESH_SERVER_MISSING: {
    code: 'MESH_SERVER_MISSING',
    title: 'No mesh server configured',
    category: 'SYSTEM',
    tone: 'warn',
    severity: 'Info',
    blocking: false,
    summary:
      'VITE_MESH_SERVER_URL is unset, so the URDF widget has no source for robot mesh geometry and renders an empty scene rather than claiming success.',
    causes: [
      'VITE_MESH_SERVER_URL is not set in amr-dashboard/.env.',
      'No static file server is exposing the robot’s mesh (STL/DAE) files.',
    ],
    remedies: [
      'Serve the mesh package over HTTP, then set VITE_MESH_SERVER_URL to that root.',
      'Restart the dev server after editing .env — Vite reads env at startup.',
      'This is expected on a workstation with no mesh server; it does not affect driving the robot.',
    ],
  },

  COMMAND_DISCONNECTED: {
    code: 'COMMAND_DISCONNECTED',
    title: 'Command blocked — no link',
    category: 'COMMAND',
    tone: 'critical',
    severity: 'Critical',
    blocking: true,
    summary: 'The command was not sent because there is no rosbridge connection. Nothing reached the robot.',
    causes: ['The rosbridge link dropped before the command was issued.'],
    remedies: [
      'Press RECONNECT and wait for ROSBRIDGE LINKED before retrying.',
      'If the robot must stop and the link cannot be restored, use the physical emergency stop.',
    ],
  },

  COMMAND_PUBLISH_FAILED: {
    code: 'COMMAND_PUBLISH_FAILED',
    title: 'Command failed to publish',
    category: 'COMMAND',
    tone: 'critical',
    severity: 'Critical',
    blocking: false,
    summary:
      'The link was up but publishing the message threw an error. Assume the robot did NOT receive the command.',
    causes: [
      'The message type does not match what the robot expects.',
      'rosbridge rejected the publish (unknown type, malformed payload).',
      'The link dropped mid-publish.',
    ],
    remedies: [
      'Re-issue the command and watch the feedback line under the buttons.',
      'Check the browser console for the underlying error payload.',
      'Verify the topic’s message type matches the robot’s interface definition.',
      'If the robot must stop, use the physical emergency stop.',
    ],
  },

  COMMAND_UNCONFIRMED: {
    code: 'COMMAND_UNCONFIRMED',
    title: 'Sent — not confirmed',
    category: 'COMMAND',
    tone: 'warn',
    severity: 'Info',
    blocking: false,
    summary:
      'The message was published successfully, but no robot-side acknowledgement topic exists yet — so the dashboard cannot confirm the robot acted on it.',
    causes: ['No robot-side subscriber/ack exists for this command topic (a known backend gap).'],
    remedies: [
      'Confirm the effect through telemetry (speed, pose, mission state) rather than the button.',
      'This is expected until the robot-side command executor and ack topic are implemented.',
    ],
  },

  INVALID_COORDINATES: {
    code: 'INVALID_COORDINATES',
    title: 'Invalid coordinates',
    category: 'COMMAND',
    tone: 'warn',
    severity: 'Warning',
    blocking: false,
    summary: 'The latitude/longitude entered could not be parsed as numbers, so no action was taken.',
    causes: [
      'A field is empty or contains non-numeric characters.',
      'A decimal comma was used instead of a decimal point.',
    ],
    remedies: [
      'Enter decimal degrees using a point, e.g. 11.1271 / 78.6569.',
      'Or click the main map to drop a destination and fill both fields automatically.',
    ],
  },

  PANEL_CRASHED: {
    code: 'PANEL_CRASHED',
    title: 'Panel crashed',
    category: 'SYSTEM',
    tone: 'critical',
    severity: 'Critical',
    blocking: false,
    summary:
      'A widget threw while rendering and was isolated by its error boundary. Every other panel — including the control panel and emergency stop — keeps working.',
    causes: [
      'A malformed or unexpected ROS message reached the widget.',
      'A rendering bug in that specific panel.',
    ],
    remedies: [
      'Other panels are unaffected — the emergency stop remains usable.',
      'Reload the page to remount the crashed panel.',
      'Check the browser console for the captured stack trace and report it.',
    ],
  },
};

export const ERROR_LIST = Object.values(ERRORS);

/** Look up an entry by code; returns null for unknown codes. */
export function getError(code) {
  return ERRORS[code] ?? null;
}

/** Group the catalog for the reference page: [{ key, label, errors[] }]. */
export function errorsByCategory() {
  return Object.entries(CATEGORIES).map(([key, label]) => ({
    key,
    label,
    errors: ERROR_LIST.filter((e) => e.category === key),
  }));
}

/**
 * Decide which catalog entry explains why a view has nothing to show.
 * Mirrors DataFallback's precedence so the badge and the dialog never disagree:
 * link state first, then never-seen vs went-quiet.
 */
export function diagnoseView({ connectionStatus, hasEverData, isCamera = false }) {
  if (isCamera) return ERRORS.CAMERA_STREAM_DOWN;
  if (connectionStatus === 'connecting') return ERRORS.LINK_CONNECTING;
  if (connectionStatus !== 'connected') return ERRORS.LINK_OFFLINE;
  if (!hasEverData) return ERRORS.TOPIC_NO_SIGNAL;
  return ERRORS.DATA_STALE;
}
