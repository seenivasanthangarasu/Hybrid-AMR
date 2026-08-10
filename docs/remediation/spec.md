# Spec — Hybrid AMR Dashboard Remediation

**Date:** 2026-08-06
**Source:** [`AUDIT_REPORT.md`](AUDIT_REPORT.md) (37 findings, F1–F37)
**Companion docs:** [`plan.md`](plan.md) (technical approach), [`tasks.md`](tasks.md) (execution checklist)

## Purpose

Bring `amr-dashboard/` from "UI prototype for a control architecture that hasn't been built on the robot side yet" to a dashboard that is honest about what it can and cannot confirm, cannot be crashed by a single bad message, and cannot silently fail on the one control that matters most — emergency stop.

## Scope

- **In scope:** `amr-dashboard/` (all frontend code, hooks, services, components), plus the *frontend-visible contract* of the ROS-side ack/subscriber gaps (i.e. the dashboard must behave correctly whether or not those acks exist yet).
- **Out of scope for this spec:** writing new ROS 2 nodes/packages (Nav2 bringup, an `/emergency_stop` subscriber on the robot, a `/mission_state_cmd` executor). Those are backend work tracked as an explicit dependency below — this spec defines the *contract* the frontend expects from them and makes the frontend degrade honestly until they exist.

## Non-goals

- Full WCAG accessibility audit (only the safety-relevant `aria-live` gaps in scope).
- Migrating to TypeScript.
- Multi-robot support / Redux-Zustand-style state management (current Context API is adequate at this scale — see F24).
- Tablet/responsive layout (deployment target is a fixed operator workstation unless told otherwise).

## Cross-cutting dependency: robot-side acks

F1 and F2 cannot be *fully* closed by frontend work alone — there is no robot-side subscriber for `/emergency_stop`, `/mission_state_cmd`, or `/mission_goal`, and no Nav2 stack for `/navigate_to_pose`. This spec's requirements (REQ-01, REQ-02) define the **frontend contract**:
1. The frontend must never claim a command succeeded unless it received a message-level confirmation.
2. Until a real ack topic exists, the frontend must visibly and honestly label every command as *sent, not confirmed* — this is a legitimate, shippable frontend-only state that closes the "implies success" problem even before the robot side is built.
3. A follow-up backend task (new ROS node) is required to complete the loop; it is called out in `plan.md` as blocked/external and is **not** part of `tasks.md`'s frontend checklist.

---

## Requirements

> **Sequencing note (2026-08-07):** the **front-end UI/UX phase (Phase U) now runs first.** Rationale in [`plan.md`](plan.md) — the theming/token refactor (REQ-18) is a foundation the rest of the UI builds on, and it is lower-risk to land while the component tree is still small. Phase 0 safety items REQ-01…REQ-05 are already implemented (see [`tasks.md`](tasks.md)); the remaining Phase 1/2 work follows Phase U. Detailed UI design lives in [`ui-plan.md`](ui-plan.md) (workstreams UI-01…UI-09).

### Phase U — Front-end UI/UX, seamlessness & usability *(prioritized first)*

**REQ-16 — Seamlessness: the interface never jars, jumps, or contradicts itself** *(UI-01, UI-04, UI-06, UI-07)*
- One state vocabulary: a given tone (live/warn/critical/idle/stale) looks identical everywhere it appears — header, status panel, command feedback, previews. No per-component reinvention of the green/amber/red dot+label.
- No layout shift on state change: panels reserve space for their `NO DATA` / value / error states so numbers appearing or disappearing never reflow neighbours.
- View switches (main-view change, preview activation, theme change) transition smoothly rather than hard-cutting; all motion respects `prefers-reduced-motion`.
- Acceptance: switching main view, toggling theme, and losing/regaining a telemetry topic each produce a smooth visual change with **zero** layout jump in sibling panels; the same connection state renders with the same color+shape in every location it appears.

**REQ-17 — Extreme usability: every control is legible, reachable, and its state obvious** *(UI-02, UI-03, UI-05, UI-08)*
- Keyboard operability: every interactive element (buttons, inputs, preview cards) has a visible `focus-visible` state and a sensible tab order; the dashboard is fully operable without a mouse.
- Disabled controls state *why* they are disabled (e.g. "Disconnected — commands unavailable"), never a bare greyed-out button with no explanation.
- The e-stop two-click confirm window is **visibly** counting down (the current 3 s timeout in `ControlPanel.jsx` is invisible to the operator) so the operator knows how long they have to confirm.
- Telemetry has a clear glance hierarchy: the 2–3 most-watched values (Mode, Speed, Connection) read larger/heavier than secondary detail (lat/long precision), and every value distinguishes **LIVE vs STALE vs NO DATA** (freshness is a first-class visual property, not hidden).
- Hit targets are comfortable (no sub-24px tap/click targets on primary controls); consistent `PanelHeader` treatment so panels are scannable.
- Acceptance: a keyboard-only operator can select a main view, fill the Mission Planner, and trigger (then confirm) e-stop entirely via Tab/Enter with a visible focus indicator at each step; a value that has stopped updating visibly reads as STALE with its age rather than silently showing the last number as if live.

**REQ-18 — Light mode: a fully themed light appearance with a persisted toggle** *(UI-09)*
- The dashboard supports **dark (default) and light** themes driven by a single set of CSS custom properties; no component hardcodes a color that fails to invert.
- A theme toggle lives in the Header; the choice persists across reloads (localStorage) and initializes from the OS `prefers-color-scheme` on first visit.
- Both themes preserve safety legibility: signal colors (green/amber/red) remain unambiguous and meet a reasonable contrast bar against their theme's surfaces; the e-stop remains the most visually prominent control in either theme.
- Acceptance: toggling to light mode re-themes **every** panel, chart surface, map/leaflet background, form field, and scrollbar with no leftover dark patches and no unreadable low-contrast text; reloading the page preserves the last-chosen theme; a fresh visitor with an OS light preference lands in light mode.

**REQ-19 — Affordance honesty: disabled & non-interactive controls explain themselves** *(implemented)*
- Every disabled control surfaces *why* on hover (native `title` tooltip) **and** accessibly (`aria-disabled` + `aria-describedby`/visible reason), not just a single panel-level line: `ControlPanel`'s five action buttons + e-stop, and `MissionPlanner`'s SEND GOAL.
- SEND GOAL's reason is *specific* — which of {goal name, latitude, longitude} is missing/invalid, or "disconnected" — rather than a generically greyed button.
- USE COORDINATES gives visible feedback on invalid input instead of silently returning (it currently no-ops on `NaN`).
- Components that are **not** selectable views (the URDF robot-model card, `App.jsx` `active={false} onClick={()=>{}}`) must not be rendered as clickable preview `<button>`s — they read as static displays with a one-line "not a selectable view" hint, so nothing that does nothing on click looks clickable.
- Genuinely-clickable previews carry an affordance hint (`title="Click to show in main view"`).
- Acceptance: hovering any disabled control shows the reason; a keyboard/screen-reader user hears it; no element that is inert on click is structured/styled as a button.

**REQ-20 — Connection-aware fallback states + link recovery** *(implemented)*
- A single fallback treatment distinguishes the *cause* of absent data instead of today's undifferentiated `NO DATA — /topic`: **OFFLINE** (no ROS link), **CONNECTING** (link negotiating), **NO SIGNAL** (connected but the topic has no publisher / is silent), and **STALE** (was live, now overdue — see REQ-17).
- A **Reconnect** affordance appears when connection status is `error`/`closed`, so the operator can re-establish the link **without reloading the page** (`RosConnectionService.reconnect()` already exists but is not surfaced in the UI; there is also no auto-reconnect today).
- `CameraView`'s fallback is reimplemented with React state (no direct `getElementById`/`classList` DOM poking), fixes the **duplicate `id="camera-no-data"`** collision between the main and compact instances, and **recovers automatically** when the stream returns (today `onError` sets `display:none` permanently).
- Acceptance: rosbridge down → views read OFFLINE; rosbridge up but a topic silent → NO SIGNAL; killing then restarting the camera stream recovers without reload; the Reconnect control restores the link without a page refresh.

**REQ-21 — Sensor-view freshness parity** *(implemented)*
- `useLaserScan`, `useOccupancyGrid`, and `useTF` expose the same timing signals (`stale` / `lastReceivedAt` / `hasEverData`) already threaded through `useOdometry`/`useGps`, so the LiDAR/SLAM "LIVE" corner badges become true LIVE/STALE/NO-DATA states rather than the current `hasData`-only indicator.
- Acceptance: a LiDAR or SLAM view whose topic goes quiet shows STALE (with age), never a frozen "LIVE".

#### Cleanup backlog surfaced by the Phase-U audit *(note only; fold into REQ-11/REQ-13 or do opportunistically)*
- **Light-mode theming holes (hardcoded colors that don't invert):** `MissionPlanner`'s USE COORDINATES button uses Tailwind default `yellow-500/yellow-400` instead of the `signal-amber` token; `GpsMapView`'s injected marker/route HTML hardcodes `#3ddcff` / `#0e131c` / `#00b7ff`. These stay dark-styled in light mode. Move to theme tokens (or consciously accept them as fixed map-overlay constants).
- **Formatting:** `MissionPlanner.jsx` has inconsistent indentation (`handleUseCoordinates`, the `onChange` handlers) — folds into REQ-13's Prettier pass.
- **Dead / misleading code in `RosConnectionService`:** `getTopicList()` and its "auto-detect which camera topic is publishing" comment are dead & misleading since REQ-08 hardcoded the camera — remove or correct. (Also REQ-15: log the real error payload in the `ros.on('error', …)` handler.)
- **Latent integration gap:** `RobotCommandService.returnHome()` sends a Nav2 goal with `pose: null` — a silent no-op until a robot-side "home" service fills the pose. Not a frontend bug; flag alongside the F1/F2 backend dependency.

### Phase 0 — must-fix before any real deployment

**REQ-01 — Commands are never presented as confirmed without a message-level ack** *(F1)*
- All `RobotCommandService` methods that change robot state (`emergencyStop`, `start`, `pause`, `resume`, `stop`, `returnHome`, `sendGoal`) must result in the UI showing one of three explicit states: `SENDING`, `SENT — UNCONFIRMED` (no ack topic wired), or `CONFIRMED` (ack received). No UI copy may imply the robot acted unless state 3 is reached.
- Acceptance: with rosbridge connected but no robot-side subscriber, clicking any command button shows `SENT — UNCONFIRMED` (or equivalent), never a bare "Last: X — done"-style success implication.

**REQ-02 — Command failures are surfaced, never silent** *(F2, F7)*
- Every `RobotCommandService` call site is wrapped so that a thrown/rejected publish surfaces a visible, unmissable error state on screen (not just console).
- All command-issuing components (`ControlPanel`, `MissionPlanner`) disable their action buttons whenever `useRosConnection().status !== 'connected'`, with a visible reason ("Disconnected — commands unavailable").
- Acceptance: simulate a disconnected/closed `ros` connection and click e-stop — UI must show an explicit error, not just a pulse reverting silently.

**REQ-03 — A crash in one widget cannot blank the whole dashboard** *(F3, F26)*
- A top-level React error boundary wraps the app (or, more granularly, each major panel: main view, StatusPanel, MissionPlanner, ControlPanel, right-rail previews) so a render-time exception in one panel shows a local "PANEL CRASHED" state and leaves the rest of the UI (critically: `ControlPanel`/e-stop) functional.
- `useLaserScan`, `useOccupancyGrid`, and any hook that indexes into a ROS message array/field adds an existence/shape guard before use, so malformed messages degrade to `NO DATA` rather than throwing.
- Acceptance: publish a `/scan` message with `ranges` omitted — the LiDAR/SLAM views show `NO DATA` (or their own crashed-panel state), and the e-stop button remains clickable and functional.

**REQ-04 — URDF widget does not claim success while rendering nothing** *(F8, F9)*
- Mesh-loading path is no longer derived from `VITE_ROSBRIDGE_URL`; it comes from an explicit, separately-documented config value (or the widget clearly reports a degraded "no mesh server configured" state instead of `ready`).
- The `wss://` URL-mangling bug is fixed regardless of the above (no `httpss://` construction).
- Stale `ROS3D.COLLADA_LOADER_2` reference removed.
- Acceptance: with meshes unreachable, `UrdfWidget` shows an explicit "meshes unavailable" state rather than `status: 'ready'` with an empty scene.

**REQ-05 — Documented, deliberate trust boundary for the unauthenticated WebSocket** *(F32)*
- README (or a new `SECURITY.md`) explicitly states the assumption that rosbridge is only reachable on a physically-controlled/trusted network, and that this dashboard performs no authentication of its own.
- Acceptance: a reader of the repo can find this statement without asking; it is not implicit.

### Phase 1 — should-fix before scaling to multiple robots / operators

**REQ-06 — Mission Planner's "USE COORDINATES" always targets the main map** *(F13)*
- Only the non-compact `GpsMapView` instance publishes `mapApi` into `MissionContext`.
- Acceptance: with GPS as the active main view, clicking "USE COORDINATES" pans/zooms the large main map, not the right-rail preview.

**REQ-07 — Odometry distance tracking survives connection gaps without silent data loss** *(F6)*
- Jump-rejection uses a time-aware (velocity-based) threshold instead of a fixed 2m cutoff, and a rejected jump is surfaced in `StatusPanel` (e.g. "resync detected") rather than silently dropped.
- Acceptance: a simulated multi-second gap in `/odom` delivery followed by a real, larger-than-2m position delta is either correctly counted (if plausible at max robot speed) or explicitly flagged, never silently discarded with no trace.

**REQ-08 — Camera pipeline no longer claims data it can't render** *(F11, F12)*
- Either `useCameraFeed` correctly decodes/represents raw `sensor_msgs/Image` topics (making `hasData` truthful), or it is removed as dead code and the README's "auto-detected camera" claim is corrected to match `CameraView`'s actual hardcoded-URL behavior.
- Acceptance: `README.md`'s camera section accurately describes what `CameraView.jsx` does today; no hook in the codebase returns `hasData: true` without renderable content.

**REQ-09 — Minimum test coverage on safety-relevant logic** *(F27)*
- Test infrastructure (Vitest + React Testing Library) exists and covers, at minimum: `useRosTopic` staleness/unsubscribe behavior, `RobotCommandService.emergencyStop()` (publish payload + disconnected-state error handling per REQ-02), `ControlPanel`'s two-click confirm/timeout state machine, and `useOdometry`'s jump-rejection logic (post-REQ-07 fix).
- Acceptance: `npm test` exists and passes; the four areas above have at least one test each.

**REQ-10 — Reproducible dependency tree** *(F33)*
- `package-lock.json` is committed; `npm audit` is run against it and each finding is triaged (dev-only vs. shipped-runtime) with the result recorded.
- Acceptance: lockfile present in the repo; a short triage note exists (can live in this folder) recording what `npm audit` reported and the disposition of each item.

**REQ-11 — Dead code and dead dependencies removed** *(F10, F22, F23)*
- `three` npm dependency and the `window.THREE` shim in `useUrdfViewer.js` removed (after visual verification the URDF widget still renders).
- `GpsPreviewMap.jsx` removed (or wired in to replace the compact `GpsMapView` usage — pick one, don't keep both).
- `react-grid-layout` removed from `package.json`.
- Acceptance: `npm run build` succeeds; no unused imports/deps remain for these three items; URDF widget and GPS preview panel are visually verified unchanged.

### Phase 2 — nice-to-have polish

**REQ-12 — Safety-relevant state changes are screen-reader-announced** *(F18)*
- Connection status and e-stop confirm-state are `aria-live="assertive"` (or `polite` for connection status, `assertive` for e-stop).

**REQ-13 — Consistent formatting/lint** *(F25)*
- Prettier + ESLint configured; existing files reformatted; CI (or at minimum an npm script) enforces it going forward.

**REQ-14 — MissionContext scoped/memoized if it grows** *(F24)*
- No action required now; documented as a trigger condition ("split into separate contexts if a 4th piece of shared state is added") rather than a task to do immediately.

**REQ-15 — Structured connection error logging** *(F35)*
- `RosConnectionService`'s error handler logs the actual error payload, not just a status string.

---

## Explicitly not fixed by this spec (tracked, not actioned)

- **F4** (LidarView "SAFETY ZONE BREACH" wording) — copy change only, folded into REQ-03's panel-honesty pass but not a standalone requirement; low effort, do opportunistically.
- **F5** (mode-change resets view pin) — latent until `/robot_mode` is actually published robot-side; revisit when that backend work lands.
- **F14, F17, F19, F20, F21, F28, F29, F30, F31, F34, F36, F37** — Low/Info severity, acknowledged in the audit, no dedicated requirement; fold into relevant REQs opportunistically or leave as documented known-acceptable tradeoffs.
