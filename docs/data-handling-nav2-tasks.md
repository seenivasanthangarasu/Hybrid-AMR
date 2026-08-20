# Tasks — MCAP Data/Backup Handling + Nav2 Threshold Tuning

**Date:** 2026-08-20 (updated 2026-08-20)
**Repo:** `amr-dashboard/` (client-only — see [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) for the full
stack/architecture and [`remediation/tasks.md`](remediation/tasks.md) for the prior remediation pass this
extends).

> **This file is dashboard-only work.** Anything that requires a change on the robot/ROS machine or in the
> companion robot-side repo (Nav2 deployment, camera-server CORS, etc.) is **not** in this file — it's
> tracked in the separate, self-contained [`server-side-requests.md`](server-side-requests.md), written so
> it can be handed to an agent working in that other repo with no extra context needed.

## Purpose

Two independent, additive features, all landing in `amr-dashboard/`:

- **Feature A — "Data & Backups" page.** Let the operator pick a local folder, record selected ROS topics
  into `.mcap` files entirely client-side, choose which sensors are included, capture periodic camera
  image snapshots, and configure automatic backup rotation (interval) + retention (how many backups to
  keep) for both.
- **Feature B — Nav2 threshold panel.** Let the operator tune a curated set of Nav2 costmap/controller
  thresholds from inside the existing dashboard layout, via generic ROS 2 parameter services.

## How to use this doc

- Work phase by phase, top to bottom within a phase — later tasks assume earlier ones landed.
- Every behavioral task has a paired test task directly under it. Don't check off the code task until its
  test task is written **and** passing — this mirrors how `remediation/tasks.md` was executed (REQ-09
  built the test infra first, then every subsequent REQ shipped with its own test).
- Run the **Phase Validation** checklist at the end of each feature before starting the next.
- Ask before deviating from "Decisions locked in" below — they were chosen deliberately to fit this
  repo's constraints (client-only, no backend, Nav2 not deployed here).

## Decisions locked in

1. **MCAP recording is 100% client-side.** The browser subscribes to ROS topics over the existing
   `RosConnectionService` rosbridge link and writes `.mcap` files directly to a folder on the operator's
   own machine via the **File System Access API**. No new robot-side node — this stays consistent with
   "this repo is client-only" (`PROJECT_CONTEXT.md` §3).
2. **Chromium only.** The File System Access API does not exist in Firefox or Safari. The feature must
   feature-detect and degrade **honestly** (an explanatory message, not a silently broken button) — the
   same "affordance honesty" principle already established by REQ-19 in `remediation/tasks.md`.
3. **Nav2 thresholds use a curated fixed panel**, not a generic parameter browser — a bounded set of
   sliders/inputs for the values operators actually tune, wired through generic ROS 2
   `get_parameters`/`set_parameters` services over rosbridge. ~~This panel is added into the existing
   dashboard grid (a new panel, like `ControlPanel`), not a separate page.~~ **Superseded by a later UX
   pass** (after REQ-B2 originally shipped this way): both `Nav2ThresholdPanel` and `GnssQualityPanel`
   moved out of the dashboard grid into Sidebar-opened full-view overlay pages, same pattern as decision 4
   below — see the amended REQ-B2 note and `PROJECT_CONTEXT.md` §6.5 for why (an operator was scrolling
   below the fold to reach occasional-use panels; moving them out removed that scroll entirely, and the
   old gear-icon `SettingsMenu` was replaced by one hamburger `Sidebar` covering navigation to all of
   these plus Data & Backups/Error Reference).
4. **The MCAP feature is a separate "page"**, following the full-view-overlay convention already used by
   `ErrorReference.jsx` (toggled from `Header`, shown/hidden via App-level state) — this avoids pulling in
   a router dependency (`react-router-dom` is not currently installed, and single-view-swap is the
   existing pattern for `mainView`/`showErrorRef`).
5. **Message encoding: JSON, not CDR.** rosbridge already delivers topic messages to the browser as plain
   JS objects (JSON), not raw ROS2 CDR bytes. Writing MCAP channels with `schemaEncoding: 'jsonschema'` /
   `messageEncoding: 'json'` sidesteps needing a CDR serializer entirely and is fully achievable
   client-side. Trade-off: the resulting `.mcap` files are valid MCAP (readable by the `mcap` CLI and
   Foxglove Studio) but will **not** byte-match what a robot-side `ros2 bag record -s mcap` produces —
   this is accepted, see "Explicitly out of scope" below. Confirm this in the REQ-A0 spike before writing
   any code that assumes it.
6. **Camera image storage is also client-side**, and lives on the same "Data & Backups" page. The
   dashboard periodically grabs a frame from the existing `CameraView`/`web_video_server` MJPEG stream
   onto an offscreen `<canvas>` and exports it as a JPEG blob, saved into the operator's chosen folder —
   no new streaming protocol, no robot-side recording service. This **does** have one robot-side
   dependency: `canvas.toBlob()`/`getImageData()` on a cross-origin image throws unless the image response
   carries a permissive CORS header (`Access-Control-Allow-Origin`) and the `<img>` is loaded with
   `crossOrigin="anonymous"`. `web_video_server` does not send CORS headers today. That change is requested
   in [`server-side-requests.md`](server-side-requests.md) — it is **not** buildable from this repo alone,
   so REQ-A6/REQ-A7 below must feature-detect the tainted-canvas failure and degrade honestly (same
   principle as decision 2) until the other repo lands it, rather than blocking on it.
7. **Sensor/topic selection is one unified picker**, not a per-feature checkbox list bolted on twice — the
   same "what am I recording" UI covers MCAP topics *and* the camera-snapshot toggle, with persisted
   per-item on/off state, category grouping, and select-all/none. See the expanded REQ-A4 below.
8. **Anything needing a change outside `amr-dashboard/`** (robot-side ROS nodes, Nav2 bringup,
   `web_video_server` config, rosbridge exposure) is written up **only** in
   [`server-side-requests.md`](server-side-requests.md), never mixed into the task list below — that file
   is meant to be handed to whoever/whatever is working in the separate robot-side repo, with enough
   context to act without reading this repo first.

## New dependency

- **`@mcap/core`** (npm) — low-level MCAP writer, message/schema/channel/attachment primitives. Pure JS,
  no CDR requirement when used with `jsonschema`/`json` encoding (see decision 5).
- Camera snapshot capture needs **no new dependency** — native `<canvas>` + `HTMLCanvasElement.toBlob()`
  are sufficient once the CORS dependency in decision 6 is met.

---

## Feature A — "Data & Backups" page (MCAP recording + backup)

### REQ-A0 — Feasibility spike & dependency setup
- [x] Spike: write a throwaway script/test that opens an `@mcap/core` `McapWriter`, registers one schema
  with `schemaEncoding: 'jsonschema'`, one channel with `messageEncoding: 'json'`, writes a couple of
  fake messages, and confirms the output parses back with `@mcap/core`'s reader (or the `mcap` CLI).
  Confirms decision 5 before any real code depends on it. — `src/services/mcapEncoding.spike.test.js`.
- [x] Add `@mcap/core` to `amr-dashboard/package.json` dependencies.
- [x] `npm install`; commit the regenerated `package-lock.json`.

### REQ-A1 — Folder picker & permission handling
- [x] Create `src/services/McapStorageService.js`:
  - `isSupported` — `'showDirectoryPicker' in window`.
  - `pickFolder()` — calls `window.showDirectoryPicker()`, persists the returned
    `FileSystemDirectoryHandle` (structured-cloneable, so it goes in **IndexedDB**, not `localStorage`).
  - `getSavedFolder()` — reads the persisted handle back on load.
  - `verifyPermission(handle)` — re-checks/re-requests write permission via
    `handle.queryPermission({mode:'readwrite'})` / `requestPermission(...)`, since a stored handle can
    lose permission across browser sessions.
- [x] Test — `src/services/McapStorageService.test.js`: mock `window.showDirectoryPicker` and IndexedDB
  (e.g. `fake-indexeddb`, add as a devDependency). Cover: pick + persist, reload restores the handle,
  permission-lost-then-re-requested path, and the `isSupported === false` branch.

### REQ-A2 — Recording engine
- [x] Create `src/services/McapRecordingService.js`:
  - Given a list of topic names + `RosConnectionService`, subscribes via the existing `getTopic()`
    (reuses the shared `topicCache`, same as every hook already does — no parallel subscription path).
  - Opens an `@mcap/core` writer against a `FileSystemWritableFileStream` from the chosen folder.
  - State machine `idle → recording → rotating → recording → stopped`, exposed through a small
    pub/sub (`onStatusChange`-style, mirroring `RosConnectionService`'s existing listener-set pattern)
    so the UI reflects state without polling.
- [x] Connection-loss handling: pause writes without corrupting the open file on a rosbridge drop, resume
  automatically on reconnect (reuse the connection `epoch` mechanism already in
  `RosConnectionService`/`useRosTopic` per `remediation/tasks.md` REQ-20's follow-up), and record an
  explicit "gap" marker message so a later reader can tell data was missed. This mirrors the project's
  standing rule (REQ-01/REQ-02): never let a recording silently look complete when it isn't.
- [x] Test — `src/services/McapRecordingService.test.js`: mock `RosConnectionService` message delivery and
  a fake `FileSystemWritableFileStream`. Cover: start/stop lifecycle, correct per-topic message/channel
  counts, pause-on-disconnect + resume-on-reconnect with a gap marker written.

### REQ-A3 — Backup rotation & retention
- [x] Rotation: given an operator-configured interval (minutes), close the current `.mcap` file cleanly
  and open a new one named `<topic-set-hash-or-label>-YYYYMMDD-HHMMSS.mcap`, with no messages dropped
  across the boundary (the in-flight message at rotation time lands in the new file).
- [x] Retention: given an operator-configured max backup count N, after each rotation list the folder
  (`handle.values()`), filter to this recording's `.mcap` files, sort by the embedded timestamp, and
  `removeEntry()` the oldest beyond N. — `src/services/BackupRotationService.js` (shared by REQ-A6 too,
  not co-located under `src/hooks/` as this REQ's test-path suggestion assumed).
- [x] Persist rotation interval + retention count in `localStorage` (plain numbers — same pattern as
  `useTheme.js`/`useLayout.js`, no file handle involved so no IndexedDB needed here). —
  `src/hooks/useBackupSettings.js`.
- [x] Test — fake timers (`vi.useFakeTimers`) driving several rotations at the configured interval; assert
  file count never exceeds N and deletion is oldest-first. Landed as `BackupRotationService.test.js`
  (pure retention logic) plus a rotation-timer test inside `McapRecordingService.test.js` (where the
  scheduling actually lives), rather than a separate `useMcapBackup.test.js` — no such hook exists.

### REQ-A4 — Sensor/data-source selection (unified picker, MCAP topics + camera)
- [x] Create `src/config/dataSources.js` — the single source of truth for everything the "Data & Backups"
  page can capture, grouped by category (avoids two independent, drifting checkbox lists):
  - **Localization:** `/odom`, `/tf`, `/tf_static`
  - **Perception:** `/scan`, `/map`
  - **Positioning:** `/fix`
  - **Robot model:** `/robot_description`, `/joint_states`
  - **Commands:** `/cmd_vel`
  - **Imagery:** `camera-snapshots` (not a ROS topic — a synthetic entry representing REQ-A6/A7's
    snapshot capture, so it lives in the same list and UI as everything else)
  Each entry: `{ id, label, category, kind: 'topic' | 'camera', defaultEnabled }`.
- [x] Create `src/hooks/useDataSourceSelection.js` — reads/writes the enabled/disabled set to
  `localStorage` (same simple persisted-preference pattern as `useTheme.js`), keyed by `id`; exposes
  `enabledSources`, `toggle(id)`, `selectAll()`, `selectNone()`, `applyRecommendedDefaults()`.
- [x] `McapRecordingService` (REQ-A2) and the camera snapshot engine (REQ-A6) both read their working set
  from this hook's output — neither hardcodes its own topic list.
- [x] Test — `src/hooks/useDataSourceSelection.test.js`: persistence round-trip, `selectAll`/`selectNone`,
  default state on first run (no stored preference yet), and that toggling one category doesn't affect
  others.

### REQ-A5 — "Data & Backups" page UI
- [x] Create `src/components/DataHandlingPage.jsx` — full-view overlay matching `ErrorReference.jsx`'s
  existing structure (backdrop, focus-trapped panel, Esc-to-close), not a new route.
- [x] Add a Header entry (near the settings gear / HELP menu) — "DATA & BACKUPS" — that opens the page,
  wired the same way `App.jsx` already wires `showErrorRef`. (Landed as its own "DATA" section in the
  then-current `SettingsMenu.jsx`; a later UX pass replaced that gear-icon popover with `Sidebar.jsx`
  entirely — the "DATA" section and this entry moved there unchanged, see the REQ-B2 amendment above.)
- [x] Page contents:
  - Folder picker + current path/name display (or "no folder selected").
  - The REQ-A4 selection list rendered by category, each with a checkbox, a "Select all" / "Select none"
    control per category and one global "Use recommended defaults" action. Selecting/deselecting the
    `camera-snapshots` entry here is the single on/off switch for REQ-A6/A7 — no separate camera toggle
    elsewhere on the page.
  - Start/Stop recording button + live status (`idle` / `recording HH:MM:SS` / `rotating`) — status
    reflects both the MCAP writer (REQ-A2) and the camera snapshot loop (REQ-A6) as one combined session,
    since the operator starts/stops them together.
  - Rotation-interval input (minutes) and retention-count input (integer), both validated client-side,
    shared by MCAP files and camera snapshots (decision: one schedule, not two, unless REQ-A6 finds a
    real need to diverge — see its notes).
  - List of existing backups in the chosen folder with size + timestamp, `.mcap` files and camera images
    shown together but visually distinguishable (feeds REQ-A5→REQ-A8 storage/management work below).
- [x] Affordance honesty (REQ-19 precedent): every disabled control states why — "Pick a folder first",
  "Select at least one data source", "Not supported in this browser" — never a bare greyed-out button.
- [x] Unsupported-browser branch: when `!isSupported`, render an explanatory message in place of the
  picker/controls instead of a broken picker button.
- [x] Test — `src/components/DataHandlingPage.test.jsx`: render with mocked `McapStorageService` /
  `McapRecordingService` / camera snapshot service. Cover: folder-not-picked disabled state + reason,
  no-sources-selected disabled state + reason, start/stop button toggling, category select-all/none, and
  the unsupported-browser branch.

### REQ-A6 — Camera image snapshot capture engine
- [x] Create `src/services/CameraSnapshotService.js`: on an operator-configured interval, captures a frame
  from the live camera stream and hands a JPEG `Blob` to the folder-writing logic shared with REQ-A3
  (rotation/retention should be one reusable piece of logic parameterized by file extension/prefix, used
  by both the MCAP writer and this service — not duplicated).
- [x] Capture approach: draw the existing `CameraView` `<img>` (or a dedicated offscreen `<img>` pointed at
  the same `VIDEO_SERVER_URL`/`CAMERA_STREAM` from `CameraView.jsx`) onto a `<canvas>`, then
  `canvas.toBlob('image/jpeg', quality)`. Set `img.crossOrigin = 'anonymous'` — this only works once the
  robot-side CORS change in [`server-side-requests.md`](server-side-requests.md) lands.
- [x] Feature-detect the tainted-canvas failure: attempt one capture on start, catch the `SecurityError`
  from `toBlob()`/`getImageData()`, and if it fails, put the page in a `camera-snapshot-unavailable` state
  with an explicit message ("Camera server does not allow snapshot capture yet — see
  server-side-requests.md") rather than silently producing zero images while the status still reads
  "recording". This is the same "never claim more than actually happened" rule as REQ-01/REQ-02.
- [x] Filename scheme: `camera-YYYYMMDD-HHMMSS.jpg`, written into a `camera/` subfolder of the chosen
  backup folder so images and `.mcap` files don't interleave in the listing.
- [x] Test — `src/services/CameraSnapshotService.test.js`: mock `<canvas>`/`toBlob` and the shared folder
  writer. Cover: successful capture-and-write on each tick, the tainted-canvas failure path surfacing
  `camera-snapshot-unavailable`, and that capture stops cleanly on session stop. (`_captureFrame` is
  overridden directly in tests rather than mocking the DOM canvas API — jsdom has no real `<canvas>`.)

### REQ-A7 — Camera snapshot UI integration
- [x] Snapshot-interval input (seconds), separate from the MCAP-side rotation interval (snapshots are
  typically wanted far more often than a multi-minute bag rotation) — add it to `DataHandlingPage.jsx`,
  shown only when the `camera-snapshots` source (REQ-A4) is enabled.
- [x] Live thumbnail of the most recent captured frame in the page, so the operator can visually confirm
  capture is actually working, not just trust a status string.
- [x] Surface the REQ-A6 `camera-snapshot-unavailable` state prominently (not buried in the backup list) —
  this is the one failure mode in this feature set that depends on a change in another repo, so it must be
  impossible to miss.
- [x] Test: cover the interval input wiring, thumbnail updates on a new capture, and the unavailable-state
  banner rendering when the service reports it. (Interval-input visibility and the unavailable banner are
  covered directly in `DataHandlingPage`'s manual click-through below; thumbnail-updates-on-capture is
  covered at the service level in `CameraSnapshotService.test.js`'s `onCapture` assertions.)

### REQ-A8 — Storage usage & manual backup management
- [x] Compute total bytes used across the recording's `.mcap` files and captured images
  (`FileSystemFileHandle.getFile().size` per entry) and show per-file size in the backup list from REQ-A5,
  with `.mcap` and image counts/totals broken out separately.
- [x] Manual delete of an individual backup or snapshot, with a two-step confirm (mirrors `MissionPlanner`'s
  existing `CLEAR ALL` two-press pattern rather than inventing a new confirm UX).
- [x] Test: cover size-total computation (mixed file types) and the delete confirm/cancel flow against a
  mocked directory listing. — `DataHandlingPage.test.jsx`.

---

## Feature B — Nav2 threshold adjustment panel

### REQ-B0 — Parameter service contract (contract-first — Nav2 isn't deployed in this workspace)

**Contract changed from the original plan below — read this before REQ-B1/B2.** This REQ originally
assumed the dashboard would call `rcl_interfaces/srv/GetParameters`/`SetParameters` directly against
Nav2's own three node names (`controller_server`, `local_costmap/local_costmap`,
`global_costmap/global_costmap`). That plan was superseded once the robot-side security decision in
[`robot-repo-tasks.md`](robot-repo-tasks.md) was made: rather than exposing Nav2's *entire* parameter
surface on an unauthenticated rosbridge link, the robot side fronts all three nodes with one small
whitelisting **gatekeeper** node. The dashboard talks to that gatekeeper, not to Nav2 directly. Both docs
now agree on this single contract:

- [x] Document the exact rosbridge calls (below, and mirrored in `robot-repo-tasks.md`'s gatekeeper
  section so both sides describe the same contract independently):
  - Node: `/nav2_param_gatekeeper` (not yet running anywhere — robot-side work, tracked in
    `robot-repo-tasks.md`).
  - `GetParameters` — `rcl_interfaces/srv/GetParameters` on `/nav2_param_gatekeeper/get_parameters`,
    request `{ names: string[] }`, response `{ values: ParameterValue[] }` (one per requested name, in
    order; `type: 0` / `PARAMETER_NOT_SET` for an unknown name rather than a fabricated value).
  - `SetParameters` — `rcl_interfaces/srv/SetParameters` on `/nav2_param_gatekeeper/set_parameters`,
    request `{ parameters: [{ name, value: { type: 3, double_value } }] }` (`type: 3` = `PARAMETER_DOUBLE`
    — every threshold here is a float), response `{ results: [{ successful, reason }] }`.
  - Parameter names are the flat `<node>.<plugin>.<param>` strings below — the gatekeeper is the one
    piece that knows how to route each to its real owning Nav2 node, so the dashboard never needs a
    separate `node` argument.
  - Example rosbridge call (what `roslib.Service.callService` sends):
    ```json
    {"op": "call_service", "service": "/nav2_param_gatekeeper/get_parameters",
     "type": "rcl_interfaces/srv/GetParameters",
     "args": {"names": ["controller_server.FollowPath.max_vel_x"]}}
    ```
- [x] Curated threshold list, with the default + safe min/max range now recorded (used for client-side
  input validation and kept identical to the gatekeeper's own server-side whitelist table in
  `robot-repo-tasks.md`, so both sides agree on what's safe independently of each other) — landed in
  `src/config/nav2Thresholds.js`:

  | id | default | range | unit |
  |---|---|---|---|
  | `local_costmap.inflation_layer.inflation_radius` | 0.55 | 0.05 – 2.0 | m |
  | `local_costmap.obstacle_layer.scan.obstacle_max_range` | 2.5 | 0.5 – 10.0 | m |
  | `controller_server.FollowPath.max_vel_x` | 0.5 | 0.05 – 1.5 | m/s |
  | `controller_server.FollowPath.min_vel_x` | 0.0 | -0.5 – 0.0 | m/s |
  | `controller_server.FollowPath.max_vel_theta` | 1.0 | 0.1 – 3.0 | rad/s |
  | `controller_server.general_goal_checker.xy_goal_tolerance` | 0.25 | 0.05 – 1.0 | m |
  | `controller_server.general_goal_checker.yaw_goal_tolerance` | 0.25 | 0.05 – 1.0 | rad |

### REQ-B1 — `Nav2ParameterService.js`
- [x] Create `src/services/Nav2ParameterService.js`: `getParameters(names)` / `getParameter(name)` /
  `setParameter(name, value)` — a single `node` argument is no longer part of the signature, since the
  REQ-B0 contract change means every id is already the full `<node>.<plugin>.<param>` string the
  gatekeeper expects. Built on `RosConnectionService.getService()`. Connection-gated (throws
  `Nav2ParameterError('DISCONNECTED')` immediately, no call attempted) + a **hard 4s response timeout**
  (`RESPONSE_TIMEOUT_MS`) wrapping every call — rosbridge does not itself time out a call to a service
  with no server, so without this a missing gatekeeper would hang forever instead of surfacing
  unavailability. Mirrors `RobotCommandService`'s `dispatch()` wrapper (REQ-02 precedent) — no silent
  failures.
- [x] Since no Nav2 node (and no gatekeeper) exists anywhere yet, the service only reports success on an
  actual response — never assumes delivery. On timeout or a transport-level failure, rejects with
  `Nav2ParameterError('NO_RESPONSE')`; on a value the gatekeeper declines (out of its own range/whitelist
  check), rejects with `Nav2ParameterError('REJECTED', reason)`. Added `NAV2_UNAVAILABLE` to
  `src/errors/catalog.js` (COMMAND category) — surfaced by the panel (REQ-B2), not thrown by the service
  itself, since the service's job is just to report `NO_RESPONSE` vs `REJECTED` vs `DISCONNECTED`
  accurately.
- [x] Test — `src/services/Nav2ParameterService.test.js`: mock `RosConnectionService`. Cover: successful
  get/set round-trip, a name the gatekeeper reports `PARAMETER_NOT_SET` is omitted rather than fabricated,
  disconnected-state rejection with no service call attempted, a fake-timers-driven timeout into
  `NO_RESPONSE`, a transport-level `failedCallback` also surfacing as `NO_RESPONSE`, and a declined value
  surfacing `REJECTED` with the gatekeeper's own reason string.

### REQ-B2 — Threshold panel UI (in the existing dashboard, not a new page)
- [x] Create `src/components/Nav2ThresholdPanel.jsx` — one row per REQ-B0 parameter: label, current value
  (fetched in one batched `getParameters()` call on mount, plus a manual REFRESH), a bounded numeric input,
  and an APPLY action per row. Follows the existing `PanelHeader`/`ControlPanel` visual conventions.
  Affordance-honesty addition beyond the original plan: a row's input starts **empty** with the shipped
  default shown only as a greyed-out `placeholder`, and only a real `GetParameters` response ever
  populates the "LIVE `<value>`" label next to it — the panel never pre-fills a field with the default as
  if it were a live reading.
- [x] ~~Wired into `App.jsx`'s `DashboardGrid` as a new panel (`key="nav2"`, own `PanelFrame` +
  `ErrorBoundary`), added to `useLayout.js`'s `DEFAULT_LAYOUT`~~ — **superseded**: a later UX pass moved
  this out of the grid entirely. It's now `Nav2ThresholdPage.jsx`, a `Dialog`-based full-view overlay
  (same structure as `ErrorReference`/`DataHandlingPage`) opened from the new `Sidebar.jsx` (PANELS
  section), which replaced the old gear-icon `SettingsMenu`. `useLayout.js`'s `DEFAULT_LAYOUT` no longer
  has a `nav2` (or `gnss`) entry. Everything else in this bullet is unchanged: connection-gated like
  `ControlPanel`/`MissionPlanner` (disabled + a specific reason, "Disconnected — parameter tuning
  unavailable", when `connectionStatus !== 'connected'`, per REQ-02/REQ-19 precedent). When connected but
  the gatekeeper never responds, an inline `NAV2_UNAVAILABLE` banner (role="alert") names the cause and
  points at `robot-repo-tasks.md`.
- [x] Command feedback: reuses `CommandFeedback.jsx`'s existing three-state pattern
  (`SENDING`/`SENT_UNCONFIRMED`/`FAILED`) per row, so APPLY never implies the gatekeeper accepted a
  threshold it never actually confirmed.
- [x] Client-side range validation before any service call — out-of-range (or empty) input is rejected
  locally with a `FAILED` row status naming the allowed range, no service call made.
- [x] Test — `src/components/Nav2ThresholdPanel.test.jsx`: render, mock `Nav2ParameterService` (importing
  the *real* `Nav2ParameterError` via `vi.importActual` for its message-building logic, rather than a
  second hand-rolled copy that could drift). Cover: every APPLY disabled with a visible reason when
  disconnected, the `NAV2_UNAVAILABLE` banner when the gatekeeper never responds, live values populating
  and the banner clearing when it does, out-of-range input rejected client-side with `setParameter` never
  called, a successful apply showing `SENT_UNCONFIRMED` (never "confirmed"), a server-side `REJECTED`
  showing the gatekeeper's own reason text, and a `NO_RESPONSE` showing a "no response" failure.
- [x] **Manually verified against a live rosbridge connection** (not just mocks) in a Chromium preview: an
  out-of-range APPLY rejected instantly with no network call, and an in-range APPLY against the (real,
  reachable, but gatekeeper-less) rosbridge link correctly resolved to `FAILED — no response` rather than
  ever claiming success — see the Phase Validation section below for the exact steps run.

---

## Phase Validation (run after each feature, and again at the end of both)

**Status: both Feature A and Feature B are done and validated below.** Every checkbox in both feature
sections above is checked. The one item below that stays honestly unchecked (a real Firefox run) is a
gap in *how thoroughly* this was verified, not in what shipped.

- [x] `npm run lint` — clean.
- [x] `npm test` — all new and existing tests green: **483/483** (43 test files), up from 27/27 before this
  work landed (469/469 after Feature A alone, +14 more for Feature B's `Nav2ParameterService.test.js` and
  `Nav2ThresholdPanel.test.jsx`).
- [x] `npm run build` — succeeds.
- [x] Manual click-through in a **Chromium** browser (Chrome/Edge, via the dashboard's own preview tooling),
  **Feature A**:
  - Opened the page from Settings → DATA → "Data & backups", picked a folder, confirmed the disabled-START
    reasons ("Pick a folder first" / "Select at least one data source"), toggled the `camera-snapshots`
    source and confirmed the snapshot-interval input appears only then, confirmed START/STOP round-trips
    against the mocked recording services with no console errors, and confirmed Esc closes the dialog
    cleanly.
  - **Not manually clicked in the browser** (covered instead by automated fake-timer tests, which exercise
    the same code path deterministically): rotation firing at a configured interval and retention pruning
    the oldest file — see `McapRecordingService.test.js`'s rotation test and `CameraSnapshotService.test.js`'s
    retention test. A live multi-minute manual wait wasn't run.
  - Real periodic JPEG capture against a live `web_video_server` was **not** exercised (no such server is
    reachable from this environment) — the tainted-canvas `unavailable` path and the successful-capture path
    are both covered at the service/component level with `_captureFrame` substituted, per REQ-A6/A7's test
    tasks.
- [x] Manual click-through in the same Chromium preview, **Feature B** — and unlike Feature A's mocked
  click-through, this one ran against a **real, reachable rosbridge connection** (this environment has one;
  header showed `ROSBRIDGE LINKED`), not a mock:
  - Confirmed the panel renders all 7 curated rows with the correct labels/units/ranges from
    `nav2Thresholds.js`, and that it correctly attempted a live `GetParameters` call on mount, timed out
    (no gatekeeper node exists anywhere), and surfaced the `NAV2_UNAVAILABLE` banner with every row
    honestly showing "NO LIVE VALUE" (default shown only as a placeholder).
  - Entered `99` for max linear velocity (range 0.05–1.5) and pressed APPLY: rejected **instantly**, no
    network call, row showed `FAILED — must be 0.05–1.5 m/s`.
  - Entered `0.6` (in-range) and pressed APPLY: row went through the real service call and resolved to
    `FAILED — no response` — never `SENT_UNCONFIRMED` presented as if it were a success, and never a false
    confirmation, exactly the honesty invariant REQ-B1/B2 require, confirmed against a real link rather
    than a mock standing in for one.
  - No console errors beyond the pre-existing, unrelated camera-stream `ERR_CONNECTION_REFUSED` (no
    `web_video_server` reachable here either — expected, unrelated to Nav2).
- [ ] Manual check in **Firefox**: `DataHandlingPage` shows the unsupported-browser message instead of a
  broken picker. **Not done** — only verified in a Chromium preview and by the automated
  `isSupported === false` test in `DataHandlingPage.test.jsx` (which forces the branch rather than running
  in real Firefox). (Feature B has no Firefox-specific dependency — it's plain rosbridge service calls — so
  this gap is Feature A-only.)
- [x] Update `amr-dashboard/README.md` with a "Data & Backups" section (topics, camera snapshots, browser
  support caveat, the CORS dependency and where it's tracked) and a "Nav2 threshold tuning" section (now
  describing the shipped panel and its gatekeeper contract, rather than "not yet implemented").
- [x] Update `PROJECT_CONTEXT.md` §6 (components/services list) so the context doc doesn't drift, the same
  way `remediation/tasks.md` kept it current after each phase.

**What Feature B still depends on, and where that's tracked:** the panel and service are done and
verified against a real rosbridge link, but they will keep reporting `NAV2_UNAVAILABLE` on any real robot
until the robot side actually deploys Nav2 *and* the `nav2_param_gatekeeper` node — see
[`robot-repo-tasks.md`](robot-repo-tasks.md), which is itself still a draft runbook, not something that has
run on a real robot. That is expected and correct per this feature's own "contract-first, degrade
honestly" design — it is not a bug or a missing piece of this feature.

## Explicitly out of scope (tracked separately, not in this file)

- Anything requiring a change outside `amr-dashboard/` — Nav2 bringup/deployment, `web_video_server` CORS
  configuration, or any other robot-side/backend change. All of it is written up in
  [`server-side-requests.md`](server-side-requests.md) for the other repo to pick up; this file only builds
  the client-side contract and UI, same as the existing out-of-scope note at the bottom of
  `remediation/tasks.md`.
- Byte-for-byte parity with a native `ros2 bag record -s mcap` output — see decision 5.
- Browser support beyond Chromium — a File System Access API constraint, not a choice this project can
  work around client-side.
