# Plan — Hybrid AMR Dashboard Remediation

**Date:** 2026-08-06
**Source:** [`spec.md`](spec.md) (REQ-01 … REQ-15)
**Execution checklist:** [`tasks.md`](tasks.md)

## Sequencing

**Flow changed 2026-08-07 — front-end first.** The order is now:

0. **Phase U (front-end UI/UX)** — REQ-18 (theming/light-mode foundation) → REQ-16 (seamlessness) → REQ-17 (extreme usability). This runs *first* now. REQ-18's token refactor is the foundation the shared signal system (REQ-16) and freshness/usability work (REQ-17) both build on, so it must land before them. It is also lower-risk to restructure theming while the component tree is still small. Phase 0's safety items (REQ-01…REQ-05) are already implemented and verified by code review (see `tasks.md`), so moving UI ahead of the *remaining* Phase 1/2 work does not delay any unshipped safety fix.
1. Then the previously-planned Phase 0 order (kept for reference / any reopened item), Phase 1, Phase 2 below.

Original Phase 0 rationale (still valid for those items): REQ-03 (error boundary) is a safety net every other change should be developed under, and REQ-02 (connection-gated commands) is a prerequisite for REQ-01 (ack-state UI) making sense:

1. **REQ-03** — error boundary + hook-level guards first. Everything after this is developed with a safety net in place.
2. **REQ-02** — connection gating + error surfacing on command dispatch.
3. **REQ-01** — three-state command feedback (`SENDING` / `SENT — UNCONFIRMED` / `CONFIRMED`), built on top of REQ-02's error path.
4. **REQ-04** — URDF mesh path fix (independent, can slot in anywhere).
5. **REQ-05** — trust-boundary documentation (no code, do last in Phase 0 as a wrap-up).

Phase 1 items are independent of each other and of Phase 0 except REQ-09 (tests), which should be written *after* REQ-02/REQ-07 land so the tests assert the corrected behavior, not the buggy original. Order: REQ-06, REQ-13→ (deferred to Phase 2, listed there), REQ-07, REQ-08, REQ-11, REQ-10, then REQ-09 last (it exercises everything above).

Phase 2 items have no ordering constraints; do opportunistically.

---

## REQ-18 — Light mode / theming foundation *(do first)*

The blocker to light mode today is that colors are baked as fixed hex in [`tailwind.config.js`](../../amr-dashboard/tailwind.config.js) and in [`index.css`](../../amr-dashboard/src/index.css) (`.panel` gradient, `body`/`html` background, scrollbar, `.data-label`, `.no-data`). Approach:

1. **Channel-ize the tokens.** Rewrite each Tailwind color as `rgb(var(--token) / <alpha-value>)` and define the actual RGB *channels* (`--deck-950: 10 14 20;` etc.) in CSS. This is mandatory, not cosmetic: the components lean heavily on opacity modifiers (`bg-signal-green/15`, `ring-signal-cyan/40`, `bg-deck-950/80`), which only keep working if the variable holds space-separated channels consumable by `<alpha-value>`.
2. **Two theme blocks in `index.css`.** `:root` holds the dark channel set (current values, so dark is unchanged). `:root[data-theme="light"]` overrides them with a light set. Convert `.panel` (gradient → variable surface), body/html bg, scrollbar track/thumb, `.data-label`, `.data-value`, `.no-data` to reference the same variables.
3. **`useTheme` hook** (`src/hooks/useTheme.js`): initial value = `localStorage['amr-theme']` ?? (`matchMedia('(prefers-color-scheme: light)')` ? 'light' : 'dark'); writes `data-theme` onto `document.documentElement`; persists on change; returns `{ theme, toggle }`. Set the attribute in a pre-hydration inline snippet or a `useLayoutEffect` to avoid a flash.
4. **Toggle control** in `Header.jsx` (sun/moon icon button), keyboard-focusable, `aria-pressed`.
5. **Light palette design:** invert the `deck` surface ramp (near-white → light grey), keep `signal` accents but nudge for contrast on light (e.g. amber/green darkened enough to read on white), map `ink` text ramp to dark-on-light. Leaflet map background var flips too so the map frame doesn't stay black.

**Verification is browser-based** (light mode is inherently visual): run the dev server, toggle both themes, screenshot each, confirm no dark patches / unreadable text. Do **not** click command buttons — the dev server may be pointed at a live backend (see `tasks.md` REQ-02 note).

## REQ-16 — Seamlessness

- **Shared signal system:** new `src/components/ui/SignalChip.jsx` + `SignalDot.jsx` — one tone→color map (`live/warn/critical/idle/stale`). Refactor `Header.jsx` `STATUS_STYLES`, the MODE chip, `StatusPanel`'s connection row, and `CommandFeedback.jsx` to consume them. Kills four divergent implementations of the same concept.
- **No layout shift:** `StatusPanel` rows and sensor panels reserve min-height for their value/NO-DATA/error states so appearance/disappearance never reflows siblings. `NoDataBadge` and value rows share a fixed row height.
- **Transitions:** add a short `transition-colors`/opacity on theme change (a global `transition` on `--`-driven properties, gated by `@media (prefers-reduced-motion: no-preference)`), a fade/slide when `resolvedView` changes in `App.jsx`, and consistent hover transitions on `PreviewPanel`.

## REQ-17 — Extreme usability

- **Freshness (`useFreshness`):** wrap topic hooks (or read the `lastUpdated` that REQ-09's `useRosTopic` staleness work exposes — reuse it, do not add a parallel timer; resolve this dependency before building) to classify each value LIVE / STALE (age > per-topic threshold, show dimmed + `Ns` age tag) / NO DATA. Apply in `StatusPanel` rows and as a corner badge on main/preview sensor views.
- **Telemetry hierarchy:** promote Mode / Speed / Connection to larger "hero" readouts in `StatusPanel`; demote lat/long to secondary. Keep tabular-nums alignment.
- **e-stop countdown:** in `ControlPanel.jsx`, replace the invisible `setTimeout(…, 3000)` with a visible shrinking bar / ring driven by the confirm state, so the operator sees the window closing.
- **Keyboard + focus:** global `:focus-visible` ring style (theme-aware) in `index.css`; ensure `PreviewPanel` (already a `<button>`), form fields, and command buttons all show it; verify tab order top-to-bottom, left-to-right.
- **Consistent `PanelHeader`:** extract the repeated `<h3 class="font-display text-[11px]…">` into `src/components/ui/PanelHeader.jsx` for uniform panel titling and optional right-slot (e.g. freshness badge).

---

## REQ-19 — Affordance honesty *(not yet implemented)*

- **Disabled-reason tooltips:** add a `disabledReason` string next to each `disabled` control. Render as `title={disabledReason}` + `aria-disabled` + an `aria-describedby` pointing at the existing panel status line. In `ControlPanel`, the reason is "ROS link is down — commands unavailable"; per-button `title` so hover works even though the panel line already exists.
- **Specific SEND-GOAL reason:** in `MissionPlanner`, compute the reason from which field is empty/invalid (`goalName`/`latitude`/`longitude`) vs `disabled` (connection), and show it as the button `title` + a small inline hint line. Give USE COORDINATES a visible "enter valid lat/lon" message on `NaN` instead of the silent `return`.
- **Non-interactive card:** give `PreviewPanel` an `interactive={false}` (or `static`) prop → renders a `<div>` (not a `<button>`), drops the hover/active affordances, and shows a muted "not a selectable view" hint. Use it for the URDF card in `App.jsx`; drop its `onClick={()=>{}}`.
- **Affordance hint:** clickable `PreviewPanel`s get `title="Click to show in main view"`.

## REQ-20 — Connection-aware fallbacks + reconnect *(not yet implemented)*

- **`DataFallback` component** (replaces bare `NoDataBadge` usage in the views): props `{ connectionStatus, topic, hasEverData, stale }`. Decision order: `disconnected/closed/error` → OFFLINE; `connecting` → CONNECTING; connected + never received → NO SIGNAL (`topic` has no publisher); connected + `stale` → STALE. `NoDataBadge` stays as the pure presentational leaf; `DataFallback` chooses the label/tone. Views need `connectionStatus` (thread from `App`, or read `useRosConnection()` inside `DataFallback`).
- **Reconnect affordance:** a small button in `Header` (or next to the connection chip) shown when `status` ∈ {error, closed}, calling `rosService.reconnect()`. Optional: a bounded auto-reconnect with backoff in `RosConnectionService` — note as a follow-up, keep the manual button as the shippable minimum.
- **CameraView rewrite:** convert to a React `useState` error flag (`streamOk`), remove `getElementById`/`classList`; unique key per instance so main+compact don't collide; reset `streamOk` on `src` change so a recovered stream re-renders. Consider a periodic re-poke of the `<img>` `src` (cache-busting query) to auto-recover.

## REQ-21 — Sensor-view freshness parity *(not yet implemented)*

- `useLaserScan` / `useOccupancyGrid` currently destructure only `{ data, hasData }` from `useRosTopic`; also pull `stale, lastReceivedAt` and return `{ ...timing, hasEverData: !!data }` (mirror the `useOdometry`/`useGps` change already landed). `useTF` likewise. Then swap the `hasData`-only "LIVE" chips in `LidarView`/`SlamView` for `classifyFreshness(...)` + `FreshnessBadge`.

## Cleanup backlog *(audit-surfaced; fold into REQ-11/REQ-13)*

- Theme-token the hardcoded colors (REQ-18 follow-through): `MissionPlanner` yellow button → `bg-signal-amber/15 text-signal-amber`; `GpsMapView` injected marker/route hex → `themeHex(...)` or documented constants.
- `MissionPlanner.jsx` reformat → REQ-13 Prettier pass.
- `RosConnectionService`: delete/annotate the dead `getTopicList()` "auto-detect camera" path (REQ-08 made it moot); REQ-15 error-payload logging.
- `RobotCommandService.returnHome()` `pose: null` → document as backend-integration gap (with the F1/F2 dependency), not a dashboard fix.

## REQ-01 / REQ-02 — Command feedback + connection gating

**New module:** `src/services/RobotCommandService.js` gets each method wrapped in a small helper rather than duplicating try/catch six times:

```js
async function dispatch(publishFn) {
  if (rosService.status !== 'connected') {
    throw new CommandError('DISCONNECTED');
  }
  try {
    publishFn();
    return { state: 'SENT_UNCONFIRMED' }; // no ack topic exists yet — see spec.md cross-cutting note
  } catch (err) {
    throw new CommandError('PUBLISH_FAILED', err);
  }
}
```

`RosConnectionService` needs a synchronous `status` getter (it already tracks `this.status` internally — just expose it) so `dispatch` doesn't need a hook.

**Component changes:**
- `ControlPanel.jsx` — `dispatch(key)` and `handleEstop()` become `async`, catch `CommandError`, and render a new inline error state (e.g. a red line under the button: "STOP failed — disconnected"). Buttons get `disabled={connectionStatus !== 'connected'}` — `ControlPanel` needs `connectionStatus` passed as a prop from `App.jsx` (it's already computed there via `useRosConnection()`, just not currently threaded down to `ControlPanel`/`MissionPlanner`).
- `MissionPlanner.jsx` — same pattern for `handleSendGoal`.
- Both get a small `<CommandFeedback state={...} />` presentational component (new, `src/components/CommandFeedback.jsx`) so the three-state UI (`SENDING`/`SENT — UNCONFIRMED`/`CONFIRMED`) is implemented once and reused, rather than copy-pasted.

**Why no ack topic yet:** per spec.md's cross-cutting dependency note, `CONFIRMED` state is wired into the component but will never actually trigger until a robot-side ack topic exists — that's out of scope here (backend work, tracked separately, not in `tasks.md`). `SENT — UNCONFIRMED` is the honest terminal state for now and is what actually closes F1/F2's "implies success" problem today.

---

## REQ-03 — Error boundary + defensive guards

**New file:** `src/components/ErrorBoundary.jsx` — standard class component (React error boundaries still require a class; there's no hook equivalent). Renders `props.fallback` or a default "PANEL CRASHED" `NoDataBadge`-styled block on `componentDidCatch`.

**Placement:** wrap each independently-crashable panel in `App.jsx` individually (main view, `StatusPanel`, `MissionPlanner`, `ControlPanel`, each right-rail `PreviewPanel` child) rather than one boundary around the whole app — a crash in `SlamView` must not take `ControlPanel` down with it, which a single top-level boundary would not prevent (the whole subtree under the boundary unmounts). `ControlPanel` in particular should also get its own boundary so a crash *inside* it (unlikely, but it's the safety-critical one) is caught, though the bigger win is boundaries around the *other* panels so they can never take `ControlPanel` down as a sibling-unmount side effect — verify in React 18 that sibling components outside the crashed boundary are unaffected (they are, since only the boundary's own subtree unmounts).

**Guards:**
- `useLaserScan.js:25` — `if (!Array.isArray(ranges)) return { hasData: false, points: [], minRange: null, raw: null };` before the `.forEach`.
- `SlamView.jsx:33` — guard `Array.isArray(data)` (and `width`/`height` are positive numbers) before the pixel loop; fall back to the existing `!grid.hasData` NO DATA path.
- `useOccupancyGrid.js` — same idea at the hook level so bad shape never reaches the component: validate `data.info` and `data.data` exist before returning `hasData: true`.

---

## REQ-04 — URDF mesh path

Add `VITE_MESH_SERVER_URL` to `.env.example` (document that it must point at wherever robot-side mesh files are actually served — this is itself a backend question the team needs to answer; PROJECT_CONTEXT.md's process map has no such server today, so this may resolve to "URDF widget stays in degraded mode until one exists," which is an acceptable, *honest* outcome per REQ-04's acceptance criteria).

`useUrdfViewer.js`:
- Replace the `rosbridgeUrl.replace(/^ws/, 'http')` derivation with `import.meta.env.VITE_MESH_SERVER_URL`.
- If unset, skip constructing `ROS3D.UrdfClient` entirely and resolve `status: 'no-mesh-server'` (new explicit status value, distinct from `'error'` and `'loading'`) so `UrdfWidget.jsx` can show an honest, distinct message.
- Remove the `loader: ROS3D.COLLADA_LOADER_2` line (F9 — confirmed non-existent export).

---

## REQ-05 — Trust boundary documentation

Add a "Security model" section to `amr-dashboard/README.md` (not a separate `SECURITY.md` — keep it discoverable in the one doc people actually read): state plainly that rosbridge has no authentication, the dashboard performs none either, and the assumption is a physically-controlled/trusted network. No code changes.

---

## REQ-06 — MissionContext map race

One-line fix in `GpsMapView.jsx`'s map-creation effect: `if (!compact) setMapApi({ map, destinationMarkerRef });`. Confirm `MissionPlanner`'s `handleUseCoordinates` still no-ops gracefully (`if (!mapApi) return;`) when only the compact preview is mounted (e.g. SLAM is the active main view) — it already does, per the existing guard.

---

## REQ-07 — Time-aware jump rejection

`useOdometry.js`: read `data.header.stamp` (ROS `Time` — `sec`/`nanosec`) instead of relying on wall-clock delivery order. Compute `dt` between successive messages; threshold becomes `delta / dt > MAX_PLAUSIBLE_SPEED_MPS` (pick a constant somewhat above the robot's real max speed — `PROJECT_CONTEXT.md` doesn't state one explicitly; use a conservative default like 3 m/s and make it easy to find/tune) rather than a bare `delta < 2`. On rejection, set a small piece of state (`lastRejectedJumpAt`) that `StatusPanel.jsx` reads to render a one-line "resync detected HH:MM:SS" note instead of nothing.

---

## REQ-08 — Camera pipeline honesty

Given `CameraView.jsx` already works today via the hardcoded `VITE_WEB_VIDEO_URL` + `<img>` approach (simpler and arguably more robust than client-side raw-image decoding for an MJPEG-serving robot), the lower-risk path is: **delete `useCameraFeed.js`**, remove its dead import comment trail, and correct `README.md`'s camera section to describe the actual hardcoded-topic behavior (and how to change `VITE_WEB_VIDEO_URL` if the topic name differs). Re-implementing raw `sensor_msgs/Image` decoding is not worth the effort when `web_video_server` already exists and does this correctly server-side.

---

## REQ-09 — Test infrastructure

Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as devDependencies; `vite.config.js` gets a `test` block (`environment: 'jsdom'`); `package.json` gets a `"test": "vitest run"` script. Mock `ROSLIB` at the module level (`vi.mock('roslib', ...)`) rather than standing up a real WebSocket in tests. Write the four tests named in `spec.md`'s REQ-09 acceptance criteria; do not attempt broad coverage beyond that in this pass — it's explicitly scoped to safety-relevant logic.

---

## REQ-10 — Lockfile + audit triage

Run `npm install` once to generate `package-lock.json`, commit it, run `npm audit` against the locked tree, and record the results + triage (dev-only tooling vulnerabilities vs. anything in the shipped runtime bundle) as `docs/remediation/npm-audit-triage.md`. This is a documentation task, not a code task — do not attempt to force-upgrade transitive deps to "fix" audit findings without understanding what breaks; that's separate, riskier work outside this pass's scope if it comes to that.

---

## REQ-11 — Dead code removal

Straightforward deletions once REQ-04 confirms the URDF widget doesn't need `three`/`window.THREE`:
- Remove `three` from `package.json` dependencies; remove the `import('three')` + `window.THREE` lines from `useUrdfViewer.js`.
- Delete `GpsPreviewMap.jsx` (confirmed unused — `App.jsx` uses `GpsMapView compact` for the same slot).
- Remove `react-grid-layout` from `package.json`.
- Run `npm install` after removals to update the lockfile (REQ-10 should land first or these two tasks should be done together in one lockfile-regenerating pass).

---

## REQ-12 / REQ-13 / REQ-15 (Phase 2)

- REQ-12: add `aria-live="polite"` to the `Header.jsx` connection-status span, `aria-live="assertive"` to `ControlPanel.jsx`'s e-stop button container.
- REQ-13: `npx prettier --write .` once, commit as its own isolated commit (large diff, keep separate from logic changes), add `.prettierrc` + `eslint` config + `"lint"`/`"format"` npm scripts.
- REQ-15: `RosConnectionService.js`'s `ros.on('error', (err) => ...)` — pass `err` through to `console.error('[ROS] connection error', err)` before calling `_setStatus('error')`.

## REQ-14

No code change. Add a one-line comment in `MissionContext.jsx` documenting the trigger condition for splitting the context, so it's not forgotten when the next piece of shared state gets added.

---

## Out-of-band / backend dependency (not in `tasks.md`)

To fully close F1/F2 (not just make them honest), a ROS-side package needs to:
- Subscribe to `/emergency_stop` (`std_msgs/Bool`) and actually cut motor power / cancel active goals, publishing an ack (e.g. `/emergency_stop_ack`, `std_msgs/Bool`) the dashboard can consume for the `CONFIRMED` state in REQ-01.
- Subscribe to `/mission_state_cmd` and execute START/PAUSE/RESUME/STOP against whatever mission-execution mechanism exists (none currently does, per `PROJECT_CONTEXT.md`).
- Either deploy a real Nav2 stack for `/navigate_to_pose`, or replace that call path with whatever navigation mechanism the robot actually has.
- Define and implement `amr_msgs/MissionGoal` as a real message package, or change `RobotCommandService.sendGoal` to use an existing message type.

This is new ROS 2 package work, not a dashboard fix, and is intentionally excluded from `tasks.md`. Flag it to whoever owns the robot-side workspace as a follow-up project.
