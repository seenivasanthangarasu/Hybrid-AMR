# Tasks for the robot-side ROS 2 repo — Nav2 bringup + camera CORS

**Date:** 2026-08-20
**Written from:** `amr-dashboard`'s repo (this one), in response to
[`server-side-requests.md`](server-side-requests.md).
**Why this file exists:** this checkout is **not** the robot-side ROS 2 workspace — that workspace was
removed from this repo on 2026-08-19 (`28bb4dd`, "Remove robot-side ROS2 workspace; repo is now
frontend-only") and now lives on the robot itself, in its own separate repo this session has no access
to. `server-side-requests.md` asked for that work to be *done*; this file is the next best thing —
a concrete, copy-pasteable task list, pre-checked against everything this repo still remembers about the
robot's actual layout (`PROJECT_CONTEXT.md` §4–5, captured before the workspace was deleted), so whoever
picks up the real robot repo can execute it with minimal re-derivation.

Nothing in this file has been run or verified against a live robot — treat every command/config below as a
draft to check against the real `rock_bringup` package, not a confirmed-working artifact.

---

## What this repo still knows about the robot layout

From `PROJECT_CONTEXT.md` (captured before the robot workspace was deleted from this repo):

- ROS 2 **Jazzy**, Ubuntu 24.04, workspace at `/home/ubuntu/ros2_ws`, sourced via
  `/opt/ros/jazzy/setup.bash && /home/ubuntu/ros2_ws/install/setup.bash`.
- `rock_bringup` (ament_python) is the newest/production bringup package. Its
  `launch/navigation.launch.py` currently starts, in order: `robot_state_publisher`, `ydlidar_ros2_driver`,
  `esp32_odom/odom_node`, `slam_toolbox/localization_launch.py` (localizing against a pre-built map,
  `mode: localization`), then `rviz2`. **It does not start Nav2 today** — that's the gap this file fills.
- TF frames already in use: `map` (slam_toolbox) → `odom` (esp32_odom) → `base_link`
  (robot_state_publisher) → `laser_frame`/sensor links. `scan_topic: /scan`. These are exactly the frame
  names Nav2 needs (`odom_frame: odom`, `base_frame: base_link`, `global_frame: map`) — no renaming
  required.
- `slam_toolbox` in localization mode already publishes `/map` (`nav_msgs/OccupancyGrid`) — Nav2's global
  costmap static layer can subscribe to that directly, no separate `map_server` needed.
- Camera: `/camera/camera/color/image_raw` (`sensor_msgs/Image`) → `web_video_server` on `:8080`.
- `hybrid_manager` (package `hybrid_navigation`) manages processes via raw `subprocess.Popen` (no launch
  composition, no lifecycle nodes) with a table of named handles (`gps_proc`, `urdf_proc`, `lidar_proc`,
  `odom_proc`, `slam_proc`, `rviz_proc`). If Nav2 is added to that table rather than to `rock_bringup`'s
  launch file, follow that same pattern — but the launch-file route below is simpler and is what
  `nav2_bringup` is designed for, so it's the recommended path.

**Action for whoever runs this in the real repo:** confirm `rock_bringup`'s current
`launch/navigation.launch.py` and `config/mapper_localization.yaml` still match the above before applying
anything — this snapshot is from before the workspace left this repo and may have drifted.

---

## Security decision (Ask #1, made now rather than left open)

**Chosen: a small whitelisting gatekeeper node, not raw Nav2 `SetParameters`.**

The doc flagged this as a deliberate choice, not a default. Reasoning:

- Raw `SetParameters` on `controller_server`/`local_costmap`/`global_costmap` doesn't expose *just* the 7
  curated thresholds — it exposes those nodes' **entire** parameter surface (recovery behaviors, plugin
  chains, every costmap layer's config, etc.) to any device that can reach port 9090, unauthenticated. The
  dashboard only ever wants to touch 7 specific values.
- Unlike `/cmd_vel`/`/emergency_stop` (the doc's precedent for "already-accepted exposure"), a bad
  `SetParameters` call is **persistent**, not transient — a stray or malformed call that lands on the wrong
  parameter name changes robot behavior until someone notices and fixes it, not until the next correct
  command arrives.
- A gatekeeper lets the robot enforce the same min/max ranges `data-handling-nav2-tasks.md` REQ-B0 already
  wants the dashboard to validate client-side, server-side too — defense in depth against a buggy or
  compromised browser client, not just a malicious one.
- The cost is genuinely small: one ~120-line `rclpy` node, no new message types (reuses
  `rcl_interfaces/srv/GetParameters`/`SetParameters`), no new dependency.

**Trade-off / consequence, already resolved on the dashboard side:** the dashboard's
`src/services/Nav2ParameterService.js` and `src/components/Nav2ThresholdPanel.jsx` (built after this
security decision, per `data-handling-nav2-tasks.md` REQ-B0/B1/B2 as currently written) already target
the gatekeeper contract below directly — `/nav2_param_gatekeeper/get_parameters` /
`/nav2_param_gatekeeper/set_parameters`, with every parameter id already in the prefixed
`<node>.<plugin>.<param>` form the gatekeeper expects. There is nothing left to repoint; the client side
was built to this contract from the start, not to Nav2's raw per-node services. What's still missing is
purely robot-side: **the gatekeeper node itself does not exist yet anywhere**, which is why the dashboard
panel currently shows `NAV2_UNAVAILABLE` — that is correct, honest behavior until §"Gatekeeper node" below
is actually deployed, not a defect in either side.

**Gatekeeper contract, confirmed on the dashboard side (both docs now describe the same thing
independently — check `data-handling-nav2-tasks.md` REQ-B0 if these two ever appear to disagree, since
that would mean one of them drifted):**

- Node name: `nav2_param_gatekeeper`
- Services (same types as raw Nav2, so `Nav2ParameterService`'s call shape barely changes):
  - `/nav2_param_gatekeeper/get_parameters` (`rcl_interfaces/srv/GetParameters`)
  - `/nav2_param_gatekeeper/set_parameters` (`rcl_interfaces/srv/SetParameters`)
- Parameter names passed through it are **prefixed with their owning node** so one flat service can front
  three different nodes, e.g. `controller_server.FollowPath.max_vel_x`,
  `local_costmap.inflation_layer.inflation_radius` — see the whitelist table below, these prefixes are
  exactly what `data-handling-nav2-tasks.md` REQ-B0's curated list already uses.
- Anything not on the whitelist, or outside its configured min/max, is rejected with a `SetParametersResult`
  where `successful: false` and a `reason` string — the dashboard's existing `SENT_UNCONFIRMED`/`FAILED`
  handling (REQ-B1/B2) already treats any non-success result as a failure, so no new client-side branch is
  needed for this.

---

## Ask #1 — Nav2 bringup

### 1. Corrected/confirmed parameter list

No `nav2_params.yaml` has ever existed in this repo (checked `git log --all` — confirmed, matches the
brief's own "Nav2 is not deployed anywhere" framing), so there is nothing to diff the doc's assumed plugin
names against. The names below are **Nav2's own stock defaults** (from `nav2_bringup`'s reference
`nav2_params.yaml`), which is what the doc assumed too — so no correction, but this is unverified against
whatever actually gets deployed and must be confirmed once real Nav2 config exists on the robot:

| Dashboard's assumed name | Status |
|---|---|
| `local_costmap.inflation_layer.inflation_radius` | Nav2 default plugin name — unchanged |
| `local_costmap.obstacle_layer.scan.obstacle_max_range` | Nav2 default (`obstacle_layer` plugin, `scan` source) — unchanged |
| `controller_server.FollowPath.max_vel_x` / `min_vel_x` / `max_vel_theta` | `FollowPath` is Nav2's default `dwb_core`/regulated-pure-pursuit controller plugin id — unchanged |
| `controller_server.general_goal_checker.xy_goal_tolerance` / `yaw_goal_tolerance` | Nav2 default goal-checker plugin id — unchanged |

**If the real deployment renames any plugin** (e.g. switches `FollowPath` to a different controller
plugin id), update the whitelist table in the gatekeeper node (`ALLOWED_PARAMS` below) and tell the
dashboard team — same instruction the original doc gave, just relayed here since it couldn't be checked
in this repo.

### 2. `nav2_params.yaml` (new — `rock_bringup/config/nav2_params.yaml`)

Minimal standard Nav2 stack wired to the robot's existing frames (`map`/`odom`/`base_link`, `/scan`,
`/map` from `slam_toolbox`). Trimmed to what's needed for the controller + costmaps ask; extend with
`planner_server`/`bt_navigator`/`behavior_server`/`waypoint_follower`/`velocity_smoother` sections from
`nav2_bringup`'s own reference config if full autonomous navigation (not just parameter tuning) is wanted
— out of scope here per the original doc's Background section (goal-sending is a separate, already-known
gap).

```yaml
controller_server:
  ros__parameters:
    controller_frequency: 20.0
    min_x_velocity_threshold: 0.001
    min_theta_velocity_threshold: 0.001
    progress_checker_plugin: "progress_checker"
    goal_checker_plugins: ["general_goal_checker"]
    controller_plugins: ["FollowPath"]

    progress_checker:
      plugin: "nav2_controller::SimpleProgressChecker"
      required_movement_radius: 0.5
      movement_time_allowance: 10.0

    general_goal_checker:
      plugin: "nav2_controller::SimpleGoalChecker"
      xy_goal_tolerance: 0.25       # mutable — dashboard-tunable
      yaw_goal_tolerance: 0.25      # mutable — dashboard-tunable
      stateful: true

    FollowPath:
      plugin: "dwb_core::DWBLocalPlanner"
      max_vel_x: 0.5                # mutable — dashboard-tunable
      min_vel_x: 0.0                # mutable — dashboard-tunable
      max_vel_theta: 1.0            # mutable — dashboard-tunable
      min_speed_theta: 0.0
      acc_lim_x: 2.5
      decel_lim_x: -2.5
      acc_lim_theta: 3.2
      decel_lim_theta: -3.2
      # None of the above are declared read_only — Nav2's DWB/goal-checker plugins already accept
      # runtime SetParameters on these via their own dynamic-parameter callbacks; no extra code needed.

local_costmap:
  local_costmap:
    ros__parameters:
      update_frequency: 5.0
      publish_frequency: 2.0
      global_frame: odom
      robot_base_frame: base_link
      rolling_window: true
      width: 3
      height: 3
      resolution: 0.05
      plugins: ["obstacle_layer", "inflation_layer"]
      obstacle_layer:
        plugin: "nav2_costmap_2d::ObstacleLayer"
        enabled: true
        observation_sources: scan
        scan:
          topic: /scan
          max_obstacle_height: 2.0
          obstacle_max_range: 2.5     # mutable — dashboard-tunable
          clearing: true
          marking: true
          data_type: "LaserScan"
      inflation_layer:
        plugin: "nav2_costmap_2d::InflationLayer"
        cost_scaling_factor: 3.0
        inflation_radius: 0.55        # mutable — dashboard-tunable

global_costmap:
  global_costmap:
    ros__parameters:
      update_frequency: 1.0
      publish_frequency: 1.0
      global_frame: map
      robot_base_frame: base_link
      resolution: 0.05
      track_unknown_space: true
      plugins: ["static_layer", "inflation_layer"]
      static_layer:
        plugin: "nav2_costmap_2d::StaticLayer"
        map_subscribe_transient_local: true   # subscribes to slam_toolbox's existing /map
      inflation_layer:
        plugin: "nav2_costmap_2d::InflationLayer"
        cost_scaling_factor: 3.0
        inflation_radius: 0.55
```

### 3. Launch wiring (extend `rock_bringup/launch/navigation.launch.py`)

Add an include of `nav2_bringup`'s own `navigation_launch.py` (don't hand-roll node definitions — reuse
Nav2's own lifecycle-managed launch, which already autostarts/activates `controller_server` and both
costmaps and gives them the exact standard node names the dashboard needs) pointed at the new params file:

```python
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.substitutions import FindPackageShare
from launch.substitutions import PathJoinSubstitution

nav2_bringup_launch = IncludeLaunchDescription(
    PythonLaunchDescriptionSource(
        PathJoinSubstitution([FindPackageShare('nav2_bringup'), 'launch', 'navigation_launch.py'])
    ),
    launch_arguments={
        'params_file': '/home/ubuntu/ros2_ws/src/rock_bringup/config/nav2_params.yaml',
        'use_sim_time': 'false',
        'autostart': 'true',
    }.items(),
)
```

Append `nav2_bringup_launch` to the existing `LaunchDescription([...])` list, after the
`slam_toolbox` include (Nav2's costmaps need `/map` and TF already flowing).

**Dependency:** add `nav2_bringup` (and transitively `nav2_controller`, `nav2_costmap_2d`, `dwb_core`,
etc. — all installed as part of the `ros-jazzy-navigation2` apt package) to `rock_bringup/package.xml`'s
`<exec_depend>` list if not already present, and confirm `sudo apt install ros-jazzy-navigation2` has been
run on the robot.

### 4. Gatekeeper node (new package — `nav2_param_gatekeeper`, ament_python)

`src/nav2_param_gatekeeper/nav2_param_gatekeeper/gatekeeper_node.py`:

```python
import rclpy
from rclpy.node import Node
from rcl_interfaces.srv import GetParameters, SetParameters
from rcl_interfaces.msg import Parameter, ParameterValue, ParameterType, SetParametersResult

# node_name -> { short_param_name: (real_node_name, min, max) }
ALLOWED_PARAMS = {
    'local_costmap.inflation_layer.inflation_radius': ('/local_costmap/local_costmap', 0.05, 2.0),
    'local_costmap.obstacle_layer.scan.obstacle_max_range': ('/local_costmap/local_costmap', 0.5, 10.0),
    'controller_server.FollowPath.max_vel_x': ('/controller_server', 0.05, 1.5),
    'controller_server.FollowPath.min_vel_x': ('/controller_server', -0.5, 0.0),
    'controller_server.FollowPath.max_vel_theta': ('/controller_server', 0.1, 3.0),
    'controller_server.general_goal_checker.xy_goal_tolerance': ('/controller_server', 0.05, 1.0),
    'controller_server.general_goal_checker.yaw_goal_tolerance': ('/controller_server', 0.05, 1.0),
}


class Nav2ParamGatekeeper(Node):
    def __init__(self):
        super().__init__('nav2_param_gatekeeper')
        self._get_clients = {}
        self._set_clients = {}
        for whitelisted, (real_node, _, _) in ALLOWED_PARAMS.items():
            if real_node not in self._get_clients:
                self._get_clients[real_node] = self.create_client(
                    GetParameters, f'{real_node}/get_parameters')
                self._set_clients[real_node] = self.create_client(
                    SetParameters, f'{real_node}/set_parameters')
        self.create_service(GetParameters, '~/get_parameters', self._handle_get)
        self.create_service(SetParameters, '~/set_parameters', self._handle_set)

    def _real_param_name(self, whitelisted_name):
        # e.g. 'controller_server.FollowPath.max_vel_x' -> 'FollowPath.max_vel_x' on /controller_server
        return whitelisted_name.split('.', 1)[1]

    def _handle_get(self, request, response):
        # Forward only whitelisted names; group by target node so one request each.
        by_node = {}
        for name in request.names:
            if name not in ALLOWED_PARAMS:
                continue
            real_node, _, _ = ALLOWED_PARAMS[name]
            by_node.setdefault(real_node, []).append(name)

        results = {}
        for real_node, names in by_node.items():
            client = self._get_clients[real_node]
            if not client.wait_for_service(timeout_sec=2.0):
                continue
            req = GetParameters.Request(names=[self._real_param_name(n) for n in names])
            future = client.call(req)
            for n, val in zip(names, future.values):
                results[n] = val

        response.values = [results.get(n, ParameterValue(type=ParameterType.PARAMETER_NOT_SET))
                            for n in request.names]
        return response

    def _handle_set(self, request, response):
        results = []
        for param in request.parameters:
            name = param.name
            if name not in ALLOWED_PARAMS:
                results.append(SetParametersResult(
                    successful=False, reason=f'"{name}" is not whitelisted'))
                continue

            real_node, lo, hi = ALLOWED_PARAMS[name]
            val = param.value.double_value if param.value.type == ParameterType.PARAMETER_DOUBLE \
                else param.value.integer_value
            if not (lo <= val <= hi):
                results.append(SetParametersResult(
                    successful=False, reason=f'"{name}"={val} outside allowed range [{lo}, {hi}]'))
                continue

            client = self._set_clients[real_node]
            if not client.wait_for_service(timeout_sec=2.0):
                results.append(SetParametersResult(
                    successful=False, reason=f'{real_node} unreachable'))
                continue

            real_param = Parameter(name=self._real_param_name(name), value=param.value)
            req = SetParameters.Request(parameters=[real_param])
            future = client.call(req)
            results.append(future.results[0] if future.results
                            else SetParametersResult(successful=False, reason='no response'))

        response.results = results
        return response


def main():
    rclpy.init()
    rclpy.spin(Nav2ParamGatekeeper())
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

Standard `package.xml` (ament_python, depends on `rclpy`, `rcl_interfaces`) and `setup.py` entry point
`gatekeeper_node = nav2_param_gatekeeper.gatekeeper_node:main`, launched alongside Nav2
(`ros2 run nav2_param_gatekeeper gatekeeper_node`, or add to `rock_bringup`'s launch file / the
`hybrid_manager` process table as a new `nav2_gatekeeper_proc` handle).

### 5. Verification

Direct-to-Nav2 (sanity check that Nav2 itself is up and mutable — run this regardless of which option
ships, since the gatekeeper depends on the underlying Nav2 services responding):

```bash
ros2 service call /controller_server/get_parameters rcl_interfaces/srv/GetParameters \
  "{names: ['FollowPath.max_vel_x']}"

ros2 service call /controller_server/set_parameters rcl_interfaces/srv/SetParameters \
  "{parameters: [{name: 'FollowPath.max_vel_x', value: {type: 3, double_value: 0.6}}]}"
# type: 3 == PARAMETER_DOUBLE; expect successful: true in the response
```

Through the gatekeeper (what the dashboard will actually call):

```bash
ros2 service call /nav2_param_gatekeeper/get_parameters rcl_interfaces/srv/GetParameters \
  "{names: ['controller_server.FollowPath.max_vel_x']}"

ros2 service call /nav2_param_gatekeeper/set_parameters rcl_interfaces/srv/SetParameters \
  "{parameters: [{name: 'controller_server.FollowPath.max_vel_x', value: {type: 3, double_value: 0.6}}]}"

# Reject path — confirm the whitelist actually rejects:
ros2 service call /nav2_param_gatekeeper/set_parameters rcl_interfaces/srv/SetParameters \
  "{parameters: [{name: 'controller_server.some_unlisted_param', value: {type: 3, double_value: 1.0}}]}"
# expect successful: false, reason mentioning "not whitelisted"
```

Over rosbridge (confirms reachability through the same link the dashboard uses — no rosbridge config
change needed, it exposes all services by default):

```bash
# rosbridge_suite ships a websocket test client; equivalent to what roslibjs's Service.callService() sends
ros2 run rosbridge_server rosbridge_websocket &
python3 -c "
import websocket, json
ws = websocket.create_connection('ws://localhost:9090')
ws.send(json.dumps({
    'op': 'call_service',
    'service': '/nav2_param_gatekeeper/get_parameters',
    'type': 'rcl_interfaces/srv/GetParameters',
    'args': {'names': ['controller_server.FollowPath.max_vel_x']}
}))
print(ws.recv())
"
```

Don't mark this done until both the direct call and the rosbridge call return successfully.

---

## Ask #2 — CORS on the camera stream

`web_video_server` (as shipped in `ros-jazzy-image-view`/binary apt packages, which is almost certainly
what's installed here — this repo has no evidence of a from-source build) has **no built-in CORS
configuration flag** in the released versions. So the doc's "preferred, simplest" option isn't available
here; going straight to the reverse-proxy fallback.

**No existing snapshot endpoint** is evidenced anywhere in this repo's captured interface contract either
(`PROJECT_CONTEXT.md` §5.1 only lists the continuous `/stream` consumption via `CameraView.jsx`) — so that
third option is also not applicable, unless the person running this on the real robot finds one that
wasn't documented here.

### Reverse proxy (nginx) — `/etc/nginx/sites-available/camera-cors`

```nginx
server {
    listen 8081;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_buffering off;          # required for MJPEG multipart streaming — buffering breaks live video
        proxy_http_version 1.1;

        add_header 'Access-Control-Allow-Origin' '*' always;
        # Scope to the dashboard's actual origin(s) instead of '*' once those are known/fixed,
        # e.g. 'http://<dashboard-host>:5173' for dev and the production origin for deployed builds.
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/camera-cors /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Camera stays reachable on `:8080` directly (unchanged, still no CORS there — display-only `<img>` usage is
unaffected); the CORS-enabled proxy is the new port `:8081`. **Report back to the dashboard team:** point
`VITE_WEB_VIDEO_URL` at `http://<robot-host>:8081` instead of `:8080`.

### Acceptance check (run from the dashboard's own origin, browser console)

```js
fetch('http://<robot-host>:8081/stream?topic=/camera/camera/color/image_raw', { mode: 'cors' })
  .then(r => console.log([...r.headers.entries()]))
// expect an 'access-control-allow-origin' entry in the printed headers
```

---

## When you're done (relayed from `server-side-requests.md`, to report back to the dashboard team)

- **Ask #1 security option:** gatekeeper node, not raw Nav2 services (see rationale above). Service
  contract: `/nav2_param_gatekeeper/get_parameters` and `/nav2_param_gatekeeper/set_parameters` (same
  `rcl_interfaces` types), parameter names prefixed with their owning node
  (`controller_server.FollowPath.max_vel_x`, etc.). **The dashboard side of this is already built** —
  `src/services/Nav2ParameterService.js` / `src/components/Nav2ThresholdPanel.jsx` in `amr-dashboard/`
  target this exact contract (see `data-handling-nav2-tasks.md` REQ-B0/B1/B2) — only the gatekeeper node
  itself remains to be deployed on the robot.
- **Parameter names:** unchanged from the dashboard's curated list — Nav2's stock defaults match, since
  Nav2 was never deployed here to have diverged. Re-confirm once real Nav2 config exists on the robot,
  since this was verified against documentation of the intended setup, not a running stack.
- **Ask #2 option:** nginx reverse proxy (native CORS flag not available in the installed
  `web_video_server`, no existing snapshot endpoint found). New camera URL:
  `http://<robot-host>:8081` (was `:8080`) — update `VITE_WEB_VIDEO_URL`.

**Caveat covering this entire file:** none of the above has been executed or tested against a live robot —
this session had no access to the actual robot-side repo (it was removed from this checkout on
2026-08-19). Everything here is a draft built from this repo's last known snapshot of the robot's layout;
verify each piece against the real `rock_bringup` package and a running `web_video_server` before
reporting the checklist above as actually done.
