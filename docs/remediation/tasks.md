# Tasks — Hybrid AMR Dashboard Remediation

**Date:** 2026-08-06
**Source:** [`spec.md`](spec.md) requirements, [`plan.md`](plan.md) technical approach

Check items off as they land. Each task lists its requirement ID and the primary file(s) touched. Tasks are grouped and ordered per `plan.md`'s sequencing — within a phase, do them top to bottom.

**Execution order changed 2026-08-07: Phase U (front-end UI/UX) runs first** — see `plan.md`.

> **STATUS 2026-08-11 — the front-end checklist is closed.** Phase 0 (REQ-01…05),
> Phase U (REQ-16…21 + cleanup), Phase 1 (REQ-06…11), and Phase 2 (REQ-12…15) are
> done, plus the deferred UI items F4 and F5. The last two open items were closed
> on 2026-08-11: **bounded auto-reconnect with backoff** (REQ-20 follow-up) and
> REQ-02's outstanding manual e-stop check (now covered by an automated test).
> `npm run lint` is clean, `npm test` is **36/36 green**, and `npm run build` succeeds.
>
> What remains is **not front-end work**: one line item still marked `[~]` is a
> click-through that needs a GPS-publishing robot, and the rest is the explicitly
> out-of-scope ROS-side node work at the bottom of this file. See
> `PROJECT_CONTEXT.md` §8 for the full backend gap list — most of the dashboard's
> command surface (`/robot_mode`, `/emergency_stop`, `/mission_state_cmd`,
> `/mission_goal`, Nav2) still has no counterpart on the robot.

---

## Phase U — Front-end UI/UX, seamlessness, usability, light mode *(active, do first)*

> **Phase U is complete + browser-verified (2026-08-10).** REQ-16…REQ-21 and the cleanup
> backlog are done. A follow-on **feature layer** was then added on operator request and is
> also done: an **adaptable drag/resize panel layout** (`react-grid-layout`, via the Header
> settings gear → "Edit layout", persisted in `useLayout.js`), a **framer-motion motion layer**
> (fallback/highlight animation, view crossfade, settings/edit transitions; all under
> `MotionConfig reducedMotion="user"`), and a **standardized active-view highlight** (inset ring
> + glowing top bar + LIVE-IN-MAIN badge). Full write-up: [`../dashboard-ui-guide.md`](../dashboard-ui-guide.md).

### REQ-18 — Light-mode / theming foundation ✅
- [x] `tailwind.config.js` — rewrite `deck`/`signal`/`ink` colors as `rgb(var(--token) / <alpha-value>)`; keep the same token names so existing classes and `/opacity` modifiers keep working
- [x] `index.css` — define dark channel set on `:root` (current values) and light channel set on `:root[data-theme="light"]`; convert `.panel`, `body`/`html` bg, scrollbar, `.data-label`, `.data-value`, `.no-data`, `.leaflet-container` to variables
- [x] Design the light palette (inverted `deck` surfaces, contrast-adjusted `signal` accents, dark-on-light `ink` ramp)
- [x] Create `src/hooks/useTheme.js` (localStorage `amr-theme`, OS `prefers-color-scheme` fallback, sets `data-theme` on `<html>`, returns `{theme, toggle}`; no-flash init via module-load apply)
- [x] Add a sun/moon toggle button to `Header.jsx` (focusable, `aria-pressed`)
- [x] Theme the JS-drawn canvases (LidarView, SlamView, useUrdfViewer) via `themeColor`/`themeHex` so no dark patches remain in light mode (THREE r89 needs hex, hence `themeHex`)
- [x] Browser verify (fresh Vite on :5174): utilities compile to `rgb(var(--…))`; dark↔light fully invert (app bg, text, panels, inputs, signal colors); h1 contrast 17.2 dark / 14.3 light; no console errors. **Screenshots pending** — the Browser pane must be displayed to composite frames.
- [n/a] ⚠️ *Operational note, not a work item:* a running dev server must be **restarted** to pick up `tailwind.config.js` — Vite caches the Tailwind/PostCSS pipeline, so a config change is not HMR'd.

### REQ-16 — Seamlessness ✅
- [x] Create `src/components/ui/SignalChip.jsx` + `SignalDot.jsx` + `signalTones.js` (single tone→color map)
- [x] Refactor `Header.jsx` connection status + `StatusPanel.jsx` connection row to the shared signal components/tones
- [x] Unify `CommandFeedback.jsx` onto the shared tones (SENDING=info, SENT_UNCONFIRMED=warn, FAILED=critical, with a SignalDot)
- [x] Reserve fixed row/hero heights (`Row` = `h-8`, `Hero` = `min-h-[3.75rem]`) so value ↔ NO DATA ↔ stale transitions cause zero sibling reflow
- [x] Theme-change (0.25s color crossfade) + view-switch (`.view-fade`) transitions, gated behind `prefers-reduced-motion`
- [n/a] Header MODE chip intentionally kept as a *category* color (violet=INDOOR / cyan=OUTDOOR), not a status tone — it's a mode indicator, not a live/warn/critical state. Already themed via tokens.

### REQ-17 — Extreme usability ✅
- [x] `useRosTopic` already exposed `stale`/`lastReceivedAt` (dependency was NOT actually blocking); added `src/utils/freshness.js` (`classifyFreshness` → LIVE / STALE+age / NO_DATA) + `src/hooks/useNow.js` ticker
- [x] Thread `stale`/`lastReceivedAt`/`hasEverData` + last-known values through `useOdometry`/`useGps` (stale values surfaced dimmed, not dropped)
- [x] Apply freshness to `StatusPanel` (per-row `FreshnessBadge` dot) + `LIVE · /scan` and `LIVE · /map` corner chips on the LiDAR/SLAM sensor views
- [x] `StatusPanel.jsx` — Mode/Speed/Link promoted to hero readouts; heading/distance/lat/long demoted to secondary rows
- [x] `ControlPanel.jsx` — visible e-stop confirm countdown (shrinking bar via `animate-estop-countdown`) replacing the invisible 3 s timeout
- [x] Global theme-aware `:focus-visible` ring in `index.css`
- [x] Extract `src/components/ui/PanelHeader.jsx` and apply to Status / Mission / Control panels
- [x] Verified: freshness classifier branches (LIVE / STALE 8s / NO_DATA) confirmed; StatusPanel renders NO DATA correctly while link is closed, no reflow. Live/stale visual states require a data-publishing backend to see in motion.

### REQ-19 — Affordance honesty (disabled & non-interactive explained) ✅
- [x] Add per-control `title` + `aria-disabled`/`aria-describedby` reasons to `ControlPanel`'s 5 action buttons + e-stop (disabled button wrapped in a `title`-bearing span with `pointer-events-none` so the hover reason surfaces despite the native `disabled` state; `aria-describedby` → the panel's `#control-disabled-reason`)
- [x] `MissionPlanner` SEND GOAL — computes a *specific* disabled reason (goal name / latitude / longitude / disconnected), shown as `title` + inline `#send-goal-reason` hint
- [x] `MissionPlanner` USE COORDINATES — visible `coordError` feedback ("Enter a valid latitude and longitude first") instead of silent `return` on `NaN`
- [x] `PreviewPanel` — added `interactive={false}` variant (renders `<div>`, no hover/active affordance, visible "not a selectable view" hint); used for the URDF card in `App.jsx`, `onClick={()=>{}}` dropped
- [x] Clickable `PreviewPanel`s — `title="Click to show in main view"`
- [x] Browser-verified (:5174): every disabled control exposes the reason via wrapper title + `aria-describedby`; USE COORDINATES shows the invalid-input status live; URDF card renders as a static div (not a button) with the hint

### REQ-20 — Connection-aware fallbacks + reconnect ✅
- [x] Created `src/components/DataFallback.jsx` (OFFLINE / CONNECTING / NO SIGNAL / STALE·age from `useRosConnection().status` + `hasEverData` + `lastReceivedAt`; explicit `label`/`tone` override for non-ROS sources); `NoDataBadge` kept as the presentational leaf
- [x] Swapped the bare `NO DATA` overlays in `LidarView`/`SlamView`/`GpsMapView`/`CameraView`/`UrdfWidget` to `DataFallback`
- [x] Added a **RECONNECT** button in `Header.jsx` (shown on `error`/`closed`/`disconnected`), wired to `useRosConnection().reconnect()` via `App.jsx`
- [x] Rewrote `CameraView` fallback in React state — removed `getElementById`/`classList`, dropped the duplicate `id="camera-no-data"` (state-driven per instance now), auto-recovers via a retry timer + cache-busted remount when the stream returns
- [x] Browser-verified (:5174, rosbridge down): Header reads **LINK CLOSED** + RECONNECT; GPS/LiDAR views + previews read **OFFLINE · topic**; camera reads **NO CAMERA STREAM**; URDF reads **NO MESH SERVER CONFIGURED**
- [x] **Bounded auto-reconnect with backoff** (2026-08-11) — `RosConnectionService` now retries a
  dropped link on its own: 1s → 2 → 4 → 8 → 16 → 30s (capped), ±15% jitter, **6 attempts** then it
  stops and sets `retry.exhausted`. Bounded on purpose — a dashboard left open against a powered-down
  robot must not hammer the network forever, and a chip that says "retrying" indefinitely teaches the
  operator nothing. Manual RECONNECT resets the budget.
  - Made **visible**, not silent: header shows `AUTO-RETRY 3/6 · 4s` (counting down) then
    `AUTO-RETRY GAVE UP (6)`; `DataFallback` gained a **RETRYING** state so panels distinguish
    "being handled" from "genuinely down"; new catalog entry **`LINK_RETRYING`** with
    `diagnoseView({ retrying })` so the badge and the dialog never disagree.
  - Added a **connection `epoch`** to the service. `useRosTopic`, `useTF` and `useUrdfViewer` capture
    `rosService.ros`/a cached `ROSLIB.Topic` in a mount-time effect and now key that effect on the
    epoch. Without it a successful reconnect would restore the header to LINKED while every panel
    stayed silent — the exact "looks fine but isn't" failure the spec forbids. `useUrdfViewer`'s
    cleanup now also removes the viewer's `<canvas>`, since that effect can re-run.
  - Handlers check ROSLIB.Ros instance identity, so a superseded socket's late `close`/`error`
    cannot knock the live connection offline or start a competing retry.
  - Verified live (dev server pointed at a refused port): observed attempts 1→6 with the backoff
    doubling as specified (4th=9s, 5th=18s incl. jitter), the countdown ticking, panels reading
    `RETRYING`, the `LINK_RETRYING` dialog raised on selecting an empty view mid-retry, exhaustion
    flipping the chip to `AUTO-RETRY GAVE UP (6)` and panels to `OFFLINE`, and RECONNECT restarting
    the budget. Covered by 7 tests in [`RosConnectionService.test.js`](../../amr-dashboard/src/services/RosConnectionService.test.js).

### REQ-21 — Sensor-view freshness parity ✅
- [x] Threaded `stale`/`lastReceivedAt`/`hasEverData` through `useLaserScan`, `useOccupancyGrid`, `useTF` (mirrors the `useOdometry`/`useGps` change)
- [x] Replaced the `hasData`-only "LIVE" chips in `LidarView`/`SlamView` with `classifyFreshness` + `FreshnessBadge` (LIVE badge shows when live; a quiet topic now falls through to `DataFallback`'s STALE·age / OFFLINE state instead of a frozen "LIVE")

### Cleanup backlog (audit-surfaced) ✅
- [x] Theme-token hardcoded colors: `MissionPlanner`'s USE COORDINATES button → `signal-amber` token; `GpsMapView`'s injected marker/route hex extracted to named `MAP_*` constants + a `robotIcon()` builder, documented as *intentional* fixed map-overlay colours (they sit on theme-independent OSM tiles, so they deliberately do not follow light/dark)
- [x] Reformatted `MissionPlanner.jsx` (consistent indentation on `handleUseCoordinates` + the `onChange` handlers)
- [x] `RosConnectionService` — corrected the misleading `getTopicList()` "auto-detect camera" comment (moot since REQ-08); implemented REQ-15 error-payload logging in the `ros.on('error', …)` handler
- [x] Documented `RobotCommandService.returnHome()`'s `pose: null` as a backend-integration gap (with F1/F2), not a dashboard fix

---

## Phase 0 — must-fix before any real deployment

### REQ-03 — Error boundary + defensive guards
- [x] Create `src/components/ErrorBoundary.jsx` (class component, `componentDidCatch`, styled fallback matching `NoDataBadge` visual language)
- [x] Wrap main view, `StatusPanel`, `MissionPlanner`, `ControlPanel`, and each right-rail `PreviewPanel` child in `App.jsx` with individual `ErrorBoundary` instances (not one boundary around everything)
- [x] Guard `useLaserScan.js` — check `Array.isArray(ranges)` before `.forEach`
- [x] Guard `useOccupancyGrid.js` — validate `data.info` and `data.data` shape before returning `hasData: true`
- [x] Guard `SlamView.jsx`'s pixel loop against non-array/malformed `grid.data` (closed at the `useOccupancyGrid` hook boundary — `SlamView` already no-ops on `!grid.hasData`, which the hook fix now correctly gates on shape too)
- [x] Manual test: live-verified in browser — an intentionally-broken `MissionPlanner` (transient mid-edit state) was caught by its `ErrorBoundary`, logged, and every other panel including `ControlPanel` stayed fully functional. Confirms the boundary placement works as intended.

### REQ-02 — Connection-gated commands + visible failures
- [x] Expose a synchronous `status` read on `RosConnectionService` (already a plain public property — no change needed)
- [x] Add `dispatch()` helper in `RobotCommandService.js` wrapping all publish calls in try/catch + connection-status check
- [x] Thread `connectionStatus` down to `ControlPanel` and `MissionPlanner` from `App.jsx`
- [x] `ControlPanel.jsx` — disable all buttons when disconnected; `dispatch`/`handleEstop` catch and display errors via `CommandFeedback`
- [x] `MissionPlanner.jsx` — same pattern for `handleSendGoal`
- [x] Manual test: disconnect rosbridge, click e-stop, confirm a visible error appears — **closed 2026-08-11 by automated test** rather than a live click. The original blocker stands (the dev server was attached to a live backend of unknown identity, so the e-stop was deliberately never clicked). Instead, `ControlPanel.test.jsx` now covers the *dangerous* variant in an isolated environment: the link drops **between render and publish**, so the button is still enabled and the operator believes the robot was commanded to stop. Asserts both the inline `EMERGENCY STOP failed — disconnected` feedback and the escalated `COMMAND_DISCONNECTED` dialog naming the physical-e-stop fallback. (The already-disconnected case — buttons disabled with a visible reason — was already covered.)

### REQ-01 — Three-state command feedback
- [x] Create `src/components/CommandFeedback.jsx` (presentational: `SENDING` / `SENT_UNCONFIRMED` / `FAILED` states — `CONFIRMED` intentionally unreachable until a robot-side ack exists, per spec.md's cross-cutting note)
- [x] Wire into `ControlPanel.jsx` (replaces the old `lastAction` timestamp line)
- [x] Wire into `MissionPlanner.jsx` (replaces the old `lastSent` line)
- [x] Confirm copy never implies robot-side success — `SENT_UNCONFIRMED` label reads "sent — unconfirmed (no robot ack)"

### REQ-04 — URDF mesh path
- [x] Add `VITE_MESH_SERVER_URL` to `amr-dashboard/.env.example` with explanatory comment
- [x] `useUrdfViewer.js` — replaced the `rosbridgeUrl.replace(/^ws/, 'http')` derivation with `VITE_MESH_SERVER_URL`; added a `'no-mesh-server'` status branch when unset
- [x] `UrdfWidget.jsx` — distinct message for `'no-mesh-server'` and for `'error'` (fixes F21's error/loading text collision)
- [x] Remove the stale `loader: ROS3D.COLLADA_LOADER_2` line
- [x] Manual test: live-verified — widget now shows "NO MESH SERVER CONFIGURED" instead of silently reporting `status: 'ready'`. Also independently confirmed via `node_modules/ros3d` source that `window.THREE` is never read by ros3d's ESM build (mesh loaders are bound to ros3d's own internal, self-bundled `THREE` object) — the F10/REQ-11 dead-code finding holds.

### REQ-05 — Trust boundary documentation
- [x] Add "Security model" section to `amr-dashboard/README.md` stating rosbridge has no auth and the dashboard assumes a trusted network

---

## Phase 1 — should-fix before scaling to multiple robots / operators *(complete 2026-08-10)*

### REQ-06 — Mission Planner map race ✅
- [x] `GpsMapView.jsx` — `setMapApi` now guarded with `if (!compact)` so only the main map publishes into `MissionContext`
- [~] Manual test: with GPS as main view, "USE COORDINATES" targets the **main** map — code-verified (the compact preview no longer overwrites `mapApi`); live click-through needs a running GPS backend

### REQ-07 — Time-aware odometry jump rejection ✅
- [x] `useOdometry.js` — replaced the fixed `delta < 2` cutoff with a velocity-based threshold (`MAX_SPEED_MPS * dt + slack`) computed from `data.header.stamp` deltas, with a fixed fallback when no timestamp is present
- [x] Added `lastRejectedJumpAt` return value (set to a `Date` when a jump is rejected)
- [x] `StatusPanel.jsx` — renders a "resync detected HH:MM:SS" note (aria-live polite) when a jump was rejected
- [x] Unit test: `src/hooks/useOdometry.test.js` covers accumulate-plausible / reject-and-flag-impossible

### REQ-08 — Camera pipeline honesty ✅
- [x] Deleted `src/hooks/useCameraFeed.js` (dead — `CameraView` streams a hardcoded `web_video_server` MJPEG URL)
- [x] Updated `amr-dashboard/README.md`'s camera row + notes to describe the actual `VITE_WEB_VIDEO_URL` behavior (auto-detect claims removed; added a Camera note)

### REQ-11 — Dead code removal ✅
- [x] Removed `three` from `amr-dashboard/package.json` dependencies (URDF widget still builds/renders — `ros3d`'s ESM build bundles its own THREE)
- [x] Removed the `import('three')` + `window.THREE` lines from `useUrdfViewer.js`
- [x] Deleted `src/components/GpsPreviewMap.jsx` (confirmed unused)
- [x] ~~Remove `react-grid-layout`~~ — **NO LONGER DEAD (reversed 2026-08-10):** `react-grid-layout` now backs the operator-editable dashboard layout (drag/resize panels via the Header settings gear → "Edit layout", persisted in `useLayout.js`). Keep it. `framer-motion` was also added for the fallback-highlight motion + view/menu transitions.
- [x] Lockfile regenerated after removals (see REQ-10)

### REQ-10 — Lockfile + audit triage ✅
- [x] Ran `npm install` — `amr-dashboard/package-lock.json` regenerated (commit it)
- [x] Ran `npm audit` (+ non-breaking `npm audit fix`: 10 → 7 findings); output captured
- [x] Wrote [`npm-audit-triage.md`](npm-audit-triage.md) — each remaining finding dispositioned (dev/test-only tooling accepted; `three`/`ros3d` accepted under the REQ-05 trusted-network model; `--force` deliberately not applied as it downgrades `ros3d`)

### REQ-09 — Test infrastructure ✅
- [x] Added `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` to devDependencies
- [x] Configured `vite.config.js` `test` block + `src/test/setup.js` + `"test": "vitest run"` (and `test:watch`) npm scripts
- [x] Test: `useRosTopic` staleness + unsubscribe behavior (`src/hooks/useRosTopic.test.js`, mocked connection service)
- [x] Test: `RobotCommandService.emergencyStop()` publish payload + disconnected-state error path (`src/services/RobotCommandService.test.js`)
- [x] Test: `ControlPanel`'s two-click confirm/timeout state machine + disabled-reason (`src/components/ControlPanel.test.jsx`)
- [x] Test: `useOdometry`'s jump-rejection logic (`src/hooks/useOdometry.test.js`)
- [x] `npm test` passes headless — **9 tests across 4 files, all green**

---

## Phase 2 — nice-to-have polish *(complete 2026-08-10)*

- [x] REQ-12: `aria-live="polite"` on `Header.jsx` connection-status span (wraps the `SignalChip` in a `role="status"` + `aria-label` container so link-state changes are announced)
- [x] REQ-12: `aria-live="assertive"` on `ControlPanel.jsx`'s e-stop button container
- [x] REQ-13: added `.prettierrc` + `.prettierignore` + `.eslintrc.cjs` + `.eslintignore`, ran `prettier --write .` (all `src` reformatted), added `"lint"`/`"format"`/`"format:check"` npm scripts. `npm run lint` passes clean (exit 0)
- [x] REQ-14: added a scaling/split-trigger comment above `MissionProvider` in `MissionContext.jsx`
- [x] REQ-15: `RosConnectionService.js` already logs the real error payload in the `ros.on('error', …)` handler (`console.error(..., err)`) — verified in code

---

## Explicitly deferred / opportunistic (not blocking any phase)

- [x] F4 — reworded `LidarView.jsx`'s "SAFETY ZONE BREACH"/"SAFETY ZONE CLEAR" to "OBJECT IN ZONE"/"ZONE CLEAR" + a "monitor" qualifier and a "display-only — the robot does not stop on this" tooltip, so the badge no longer implies an enforced safety-stop function
- [x] F5 — resolved by removing `App.jsx`'s forced `setMainView('auto')` on mode change. A pinned view now **survives** a mode change (the audit concern); an unpinned view still follows `mode` reactively via `resolvedView`. This makes behavior match the stated intent ("reflects the robot's mode unless the operator explicitly pinned a preview"). Fully exercisable once `/robot_mode` publishes and flips indoor↔outdoor.

### Browser UX pass (2026-08-10, live app on :5185)

Hands-on inspection of the running app (computed styles / a11y tree; the pane was
non-displayed so screenshots + grid positioning couldn't be composited). Two real,
verified issues found and fixed:

- [x] **Low-contrast secondary labels** — `--ink-low` was ~3.2–3.6:1 on panels (below
  WCAG AA 4.5:1 for the small uppercase labels: panel/preview titles, StatusPanel
  rows, units). This directly undercut the at-a-glance goal. Lightened dark
  `--ink-low` 93/108/132 → **130/146/170** (now 5.9–6.1:1, verified live) and darkened
  light `--ink-low` 100/116/139 → **90/105/128** (now ~4.9–5.3:1), both still dimmer
  than `--ink-mid`. ([`index.css`](../../amr-dashboard/src/index.css))
- [x] **Mission Planner inputs had no associated `<label>`** — accessible names came
  only from `placeholder`, so both lat/long fields announced as "0.000000" to screen
  readers. Added `htmlFor`/`id` pairs so Goal Name / Latitude / Longitude each label
  their input (verified in the a11y tree). ([`MissionPlanner.jsx`](../../amr-dashboard/src/components/MissionPlanner.jsx))

Also confirmed healthy during the pass: no sub-24px hit targets, no horizontal
overflow, global `:focus-visible` ring present, theme toggle flips + persists
(`amr-theme`), and all icon-only controls carry `aria-label`/`title`. Visual layout
polish (spacing/alignment) could not be assessed headless — needs a displayed browser.

- [x] **BUG — panel drag/resize completely non-functional** (reported from a real
  browser). react-draggable's internal `log()` reads `process.env.DRAGGABLE_DEBUG` on
  every drag/resize start; with no `process` global in the browser it threw
  `ReferenceError: process is not defined`, aborting the gesture — so no panel could be
  moved, swapped, or resized in Layout Edit Mode (dev **and** production). react-resizable
  drives its handle through react-draggable too, so both paths failed from the one cause.
  Fixed with `define: { 'process.env.DRAGGABLE_DEBUG': 'false' }` in
  [`vite.config.js`](../../amr-dashboard/vite.config.js). Verified live after a dev-server
  restart: drag repositions (`main` 0,0→3,11), resize changes size (9×8→8×6), and Reset
  restores the default. The prior "feature complete" claim had only been checked in the
  frozen headless preview, which hid the bug — see the corrected caveat in
  [`../dashboard-ui-guide.md`](../dashboard-ui-guide.md#4-design-decisions--gotchas).

- [x] **BUG — rearranged panels overlapped, vanished, and left holes** (follow-on, reported
  with a screenshot once dragging worked). `DashboardGrid` used `compactType={null}` +
  `preventCollision={false}` — the one combination that lets two panels occupy the *same*
  cells. Dropping a panel onto another stacked them (the covered panel silently disappeared
  — the missing DEPTH CAMERA in the report) and dragging one away left an un-fillable gap.
  Switched to **`compactType="vertical"`** so a drop displaces its neighbours and the grid
  settles upward. The shipped default is already fully packed, so it renders identically —
  which is exactly why this went unnoticed until panels were actually moved.
  ([`DashboardGrid.jsx`](../../amr-dashboard/src/components/DashboardGrid.jsx))
- [x] **Criss-crossed text in Layout Edit Mode** — the drag overlay's scrim was only 55%
  opaque, so each panel's own content ("NO SIGNAL", input labels, button rows) showed
  through and collided with the overlay's own label + hint, rendering edit mode as a pile
  of overlapping words. Scrim raised to 95% + a 3px backdrop blur, label/hint truncate
  within the panel. Verified live: `rgba(14,19,28,0.95)`, `blur(3px)`, all 8 handles clean.
  ([`PanelFrame.jsx`](../../amr-dashboard/src/components/ui/PanelFrame.jsx))
- [x] **Empty views now explain themselves (dialogs)** — selecting a preview with nothing to
  draw used to silently swap in a blank panel, leaving the operator to guess between "sensor
  dead", "link down", and "mis-click". Added an **error catalog** (12 states) plus an
  accessible `Dialog` primitive; selecting an unavailable view now switches *and* raises a
  dialog naming the specific cause and the fix, with **RECONNECT** inline for link faults.
  A **failed command** also escalates to a dialog (an unnoticed failed e-stop being the worst
  case), naming the physical-e-stop fallback. New: [`errors/catalog.js`](../../amr-dashboard/src/errors/catalog.js),
  [`ui/Dialog.jsx`](../../amr-dashboard/src/components/ui/Dialog.jsx),
  [`ErrorDialog.jsx`](../../amr-dashboard/src/components/ErrorDialog.jsx).
- [x] **Error reference page** — settings gear → HELP → *Error reference* opens the catalogue
  of all 12 states grouped by Connection / Telemetry / Commands / System, each with a
  *VIEW DIALOG* preview so the fault vocabulary can be learned before an incident. Generated
  from the catalog, so it cannot drift from what the UI actually raises.
  ([`ErrorReference.jsx`](../../amr-dashboard/src/components/ErrorReference.jsx))
  Verified live: dialog opens on an unavailable view and correctly reports **NO PUBLISHER ON
  TOPIC** (not OFFLINE) while the link is healthy, with causes + remedies + `/scan`; modal,
  focus trapped, Esc closes; reference lists 4 categories / 12 states and nested previews work.
  Covered by 14 new tests ([`catalog.test.js`](../../amr-dashboard/src/errors/catalog.test.js),
  [`Dialog.test.jsx`](../../amr-dashboard/src/components/ui/Dialog.test.jsx)) — suite now 27/27.
- [x] **Layout persistence hardened** — `useLayout.reconcile()` now `sanitize()`s every stored
  entry: non-finite `x/y/w/h` fall back to the shipped value (a plain `+v` coercion would have
  turned `null` into `0` and collapsed a panel to its minimum) and `x`/`w` are clamped into the
  12-column grid. An already-corrupted `amr-layout-v1` therefore self-heals on reload instead
  of stranding an operator with an off-grid or invisible panel. Verified live by injecting a
  broken layout (overlap + off-grid + NaN + orphan gap) and reloading: 8/8 panels recovered,
  0 overlaps, 0 off-grid. Regression-tested in
  [`useLayout.test.js`](../../amr-dashboard/src/hooks/useLayout.test.js) (4 tests).

## Out of scope for this checklist (backend/ROS-side work — see `plan.md`'s "Out-of-band" section)

- New ROS package/node(s) for `/emergency_stop`, `/mission_state_cmd` execution, `/mission_goal` (`amr_msgs/MissionGoal`), and Nav2 bringup or an equivalent navigation mechanism. Track as a separate project, not a dashboard task.
