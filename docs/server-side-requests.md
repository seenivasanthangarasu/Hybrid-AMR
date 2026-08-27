# Requests for the robot-side / server-side repo

**Date:** 2026-08-20
**Origin:** the operator dashboard repo (`amr-dashboard/`, this workspace's `ros2_ws/`), while implementing
two new dashboard features (MCAP/camera data recording and Nav2 threshold tuning — both now shipped and
merged; see `PROJECT_CONTEXT.md` §6.3–6.5). The concrete, ready-to-run version of the asks below is
[`robot-repo-tasks.md`](robot-repo-tasks.md) — read that one first if you're about to actually execute
this; this file is the original context brief it was derived from.
**Audience:** whoever (human or agent) works in the **separate robot-side ROS 2 workspace/repo** — the one
that runs on the robot itself, referred to below as "the robot repo." That repo is not part of this one and
was never tracked here; this file exists so it can be handed over with full context and acted on without
reading the dashboard repo first.

If you are the agent picking this up: everything you need to understand *why* is below. You do not need to
open the dashboard repo. Start with "What to do," below — the "Background" section is reference for *why*
each ask exists, read it if something is unclear.

---

## tl;dr — two concrete asks, one explicit non-ask

1. **Deploy Nav2 on the robot** (it is not deployed anywhere today) so its costmap/controller nodes expose
   standard ROS 2 parameter services, reachable through the existing `rosbridge_server` link, for a small
   curated set of parameters the dashboard wants to let an operator tune.
2. **Enable CORS on `web_video_server`** (or front it with something that adds the header) so the
   dashboard's browser-side code can capture still frames from the camera stream, not just display it.
3. **Non-ask, for clarity:** the dashboard's new MCAP recording/backup feature needs **nothing** from you —
   it records client-side, in the operator's browser, over the connections that already exist. Don't do any
   work for it; it's listed here only so you don't have to guess.

---

## Background — what you're plugged into

This robot ("gogo") runs ROS 2 Jazzy. A supervisor node (`hybrid_manager`, package `hybrid_navigation`)
switches between GPS-outdoor and SLAM-indoor mode. The operator dashboard is a browser app (React) that
talks to the robot **only** over `rosbridge_server` (WebSocket, port 9090, JSON protocol, `roslibjs` on the
client) and, for camera video, over `web_video_server` (MJPEG, port 8080). Neither service currently has any
authentication — the dashboard's own README documents this as an accepted trust boundary ("only run this on
a physically isolated, trusted robot network"), so nothing below should be read as introducing a new
security exposure beyond what already exists; where it changes the exposure meaningfully, that's called out.

The dashboard repo currently has **no working Nav2 integration** — this is a pre-existing, already-known
gap (not something newly discovered by this request): `nav2_msgs/action/NavigateToPose` and
`FollowGPSWaypoints` goals are published by the dashboard, but no `nav2_bringup`, costmap, planner, or
controller exists in the robot workspace to receive them, and separately, the JS ROS client library the
dashboard uses speaks the wrong action protocol version for ROS 2 actions regardless. Both of those are
**out of scope for this request** — flagged here only so you have the full picture; the dashboard team is
not asking you to fix goal-sending in this request, only to expose Nav2 *parameters* for tuning (ask #1
below can be satisfied even before the action-protocol issue is fixed).

---

## Ask #1 — Deploy Nav2 with standard node names + tunable parameters

### Why
The dashboard is adding an operator-facing panel to adjust a small set of Nav2 thresholds live (inflation
radius, obstacle range, velocity limits, goal tolerances) without SSH-ing into the robot or editing YAML.
It will call the standard `rcl_interfaces/srv/GetParameters` and `rcl_interfaces/srv/SetParameters` services
against Nav2's own nodes, through rosbridge, exactly as `ros2 param get/set` would from a terminal — it does
not need or want a bespoke API.

### What to do
1. Bring up a standard Nav2 stack (`nav2_bringup` or equivalent) on the robot, using the **standard node
   names** so the dashboard's service calls resolve without extra configuration:
   - `controller_server`
   - `local_costmap/local_costmap`
   - `global_costmap/global_costmap`
2. Make sure the following parameters are declared as normal (mutable, non-read-only) parameters on those
   nodes — i.e. whatever's in your Nav2 params YAML for these should not be marked read-only, and Nav2's
   dynamic-parameter callbacks should accept runtime changes to them:
   - `local_costmap.inflation_layer.inflation_radius`
   - `local_costmap.obstacle_layer.scan.obstacle_max_range` (adjust the exact key to whatever your costmap
     plugin config actually names this obstacle-range parameter — the dashboard's curated list assumes the
     common default plugin names; tell the dashboard team if yours differ so they can update their list)
   - `controller_server.FollowPath.max_vel_x`
   - `controller_server.FollowPath.min_vel_x`
   - `controller_server.FollowPath.max_vel_theta`
   - `controller_server.general_goal_checker.xy_goal_tolerance`
   - `controller_server.general_goal_checker.yaw_goal_tolerance`
   (Substitute your actual controller plugin name for `FollowPath`/`general_goal_checker` if you've named
   them differently in `nav2_params.yaml` — again, tell the dashboard team the real names.)
3. Confirm these services are reachable over the existing rosbridge link — no rosbridge config change
   should be needed (it exposes all services by default), but verify with something like:
   ```bash
   ros2 service call /controller_server/get_parameters rcl_interfaces/srv/GetParameters \
     "{names: ['FollowPath.max_vel_x']}"
   ```
   and confirm the equivalent call succeeds over rosbridge (e.g. via `roslibjs` or `rosbridge_suite`'s test
   client) before handing back.
4. **Security note, worth a deliberate decision rather than an oversight:** because rosbridge has no auth,
   exposing raw `SetParameters` on Nav2's nodes means *any* device that can reach port 9090 can change
   safety-relevant thresholds (velocity limits, goal tolerances) — not just the dashboard. This is
   consistent with the already-accepted trust model (the dashboard already publishes raw `/cmd_vel` and
   `/emergency_stop` with the same exposure), but it's a large enough blast radius that you may want to
   consider a thin validating layer (a small node that whitelists parameter names/ranges before forwarding
   to Nav2, rather than exposing Nav2's full parameter surface) instead of wiring the dashboard straight to
   Nav2's own services. Either is acceptable; pick based on your own risk tolerance for this deployment —
   just document which one you did, since the dashboard's error-handling assumes a service *may* simply not
   exist yet (see "Until this exists" below) and doesn't need to be told a gatekeeper is running.

### Until this exists
The dashboard's threshold panel is being built to call these services and, on any failure (service not
found, no response, disconnected), show an explicit "no Nav2 parameter server responding" state — it will
not claim success it can't confirm. So there is no hard blocking dependency in either direction: the
dashboard panel can ship and sit in that honest "unavailable" state until this lands, and this can land
before or after the dashboard panel does.

---

## Ask #2 — Enable CORS on `web_video_server` (or a fronting proxy)

### Why
The dashboard is adding client-side periodic camera-snapshot capture: it draws a frame from the existing
live MJPEG `<img>` stream onto a `<canvas>` and exports it as a JPEG to save locally. Browsers block reading
pixel data (`canvas.toBlob()` / `getImageData()`) from a cross-origin image unless the server's response
includes a permissive `Access-Control-Allow-Origin` header — this is a browser security rule, not something
fixable from the client side. The dashboard (typically `http://<host>:5173` in dev, whatever origin it's
served from in production) and `web_video_server` (`http://<host>:8080`) are different origins, so today
this fails with a `SecurityError` on every capture attempt (display-only viewing is unaffected — only pixel
extraction is blocked).

### What to do
One of:
- **Preferred, simplest:** if your `web_video_server` build/version supports a CORS config flag or launch
  parameter, enable it to send `Access-Control-Allow-Origin: *` (or scoped to the dashboard's actual
  origin(s), if you'd rather not use a wildcard) on its `/stream` (and any snapshot) responses.
- **If `web_video_server` itself can't be configured for this:** front it with a small reverse proxy
  (nginx, Caddy, etc.) on the robot that adds the header, and have the dashboard's
  `VITE_WEB_VIDEO_URL` point at the proxy instead. This can be entirely robot-side infra — no dashboard
  code changes needed on your side of it, just tell the dashboard team the new URL/port if it changes.
- **If there's an existing single-frame/snapshot endpoint** on `web_video_server` (some builds expose one
  separately from the continuous `/stream`), mention it — the dashboard would rather `fetch()` a single
  JPEG per capture than grab a frame out of the continuous stream, if that's available and also CORS-enabled.

### Acceptance check
From a browser console on the dashboard's origin:
```js
fetch('http://<robot-host>:8080/stream?topic=/camera/camera/color/image_raw', { mode: 'cors' })
  .then(r => console.log([...r.headers.entries()]))
```
should show an `access-control-allow-origin` response header. (A full round-trip canvas-capture test is in
the dashboard repo's own task list and will be run from there once this lands.)

### Until this exists
Same honesty principle as ask #1: the dashboard feature-detects the tainted-canvas failure on first capture
attempt and shows an explicit "camera server does not allow snapshot capture yet" message instead of
silently producing zero images while claiming to be recording. So this, too, can land in either order.

---

## Explicit non-ask — MCAP recording needs nothing from you

For context (in case it looks related and someone assumes otherwise): the dashboard's new "Data & Backups"
page records selected ROS topics into `.mcap` files **entirely in the operator's browser**, using the File
System Access API to write to a folder on the operator's own machine, over the rosbridge connection that
already exists today. There is no new topic, no new service, no new robot-side recording process, and
nothing to deploy or configure on the robot for this part of the work. If you see `.mcap` mentioned
elsewhere and start looking for a `ros2 bag record` config to add — stop, it isn't needed.

---

## When you're done

Please report back (to whoever owns the dashboard repo) with:
- Which option you took for ask #1's security note (raw Nav2 services vs. a validating gatekeeper), and if
  a gatekeeper, its service name(s)/contract so the dashboard's `Nav2ParameterService` can be pointed at it
  instead of Nav2's raw services.
- The real parameter names, if any of the ones listed in ask #1 differ from what's actually in your
  `nav2_params.yaml` (plugin names vary by configuration).
- Which option you took for ask #2 (native CORS config vs. proxy vs. snapshot endpoint), and the URL to use
  if it changed from `web_video_server`'s current `:8080`.
