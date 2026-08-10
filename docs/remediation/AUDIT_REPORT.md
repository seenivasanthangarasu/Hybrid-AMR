# Hybrid AMR Command Center — Production-Readiness Audit

**Date:** 2026-08-06
**Scope:** `amr-dashboard/` (React 18 + Vite operator ground control station), cross-checked against the ROS 2 workspace described in [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md).
**Auditor:** Claude (Sonnet 5), full-source read-through + `node_modules` internals verification (`ros3d`, `roslib`).

> This document is the source of truth for [`spec.md`](spec.md), [`plan.md`](plan.md), and [`tasks.md`](tasks.md) in this folder. Every requirement in `spec.md` traces back to a numbered finding below.

---

## 1. Executive Summary

This is a well-intentioned, thoughtfully-designed dashboard — the "no mock data, no fabricated success" principle is real and mostly honored in the read paths (`useOdometry`, `useGps`, `useLaserScan`, `useOccupancyGrid` all correctly gate on live data). But the **write path is where the design philosophy breaks down**: every operator command (mission state, e-stop, goal sending, navigation) is fired at topics/actions with **no confirmed subscriber on the robot**, and the UI has **zero mechanism to distinguish "I clicked a button" from "the robot did something."** For a dashboard whose reason for existing is safety-critical teleoperation, that gap is disqualifying on its own.

Beyond the previously-known issues (all confirmed still present), this pass found several new, concrete bugs: the URDF viewer's mesh-loading path points at the rosbridge WebSocket port, which cannot serve HTTP mesh files, so the 3D widget silently renders without a robot model while reporting success; `useCameraFeed` is dead code that is also broken for the one real, non-compressed camera topic in this system; there is no error boundary anywhere, so a single malformed ROS message (e.g. a `/scan` without a `ranges` field) can blank the entire dashboard, e-stop button included; and a `MissionContext` race means the "USE COORDINATES" button in Mission Planner pans/zooms the wrong (preview) map instance rather than the main view the operator is looking at.

**Top 5 blockers to calling this "production ready":**
1. No ROS-side subscriber for `/emergency_stop`, `/mission_state_cmd`, `/mission_goal`, or a Nav2 stack for `/navigate_to_pose` — every operator command is fire-and-forget into the void, and the UI presents this as if it succeeded.
2. No error boundary — a single malformed message can white-screen the entire dashboard, including the e-stop control.
3. No visual/audible distinction between "command sent" and "command acknowledged" anywhere in the app.
4. E-stop failure mode when disconnected is silent — the publish call very likely throws inside the WebSocket send path and the operator sees no error.
5. No authentication on the rosbridge WebSocket — anyone on the LAN can drive the robot or fake an e-stop-cleared state.

None of this means the code is bad — the hooks layer is genuinely careful about not synthesizing data, and the architecture is reasonable for its stage. It means this is a **UI prototype for a control architecture that hasn't been built on the robot side yet**, not a production teleoperation tool.

---

## 2. Findings

### Safety-critical UX / correctness

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F1 | **Critical** | `RobotCommandService.js:74-82`, `ControlPanel.jsx:21-30` | `emergencyStop()` publishes to `/emergency_stop`, `/mission_state_cmd`, `/mission_goal` — confirmed no subscriber exists anywhere in the ROS workspace. UI shows "Last: EMERGENCYSTOP — 14:32:07" with zero robot-side confirmation. | Don't ship any command path without a robot-side ack the UI waits on and displays. Until then, label commands as unconfirmed. |
| F2 | **Critical** | `RobotCommandService.js:74-81` → `roslib`'s `Topic.publish` (verified in `node_modules/roslib`) | `publish()` calls `socket.send()` with no connection-state guard. If the socket is closed when e-stop is clicked, this very likely throws synchronously. `ControlPanel.handleEstop` has no try/catch, and the state updates that would show feedback sit *after* the throwing call — so on failure the operator gets no error, just the confirm-pulse silently reverting after its own 3s timeout. | Wrap all `RobotCommandService` calls in try/catch; gate command buttons on live connection status; show a hard, unmissable error on failure. |
| F3 | **Critical** | No `ErrorBoundary`/`componentDidCatch` anywhere in `src/` | `useLaserScan.js:25` does `ranges.forEach(...)` with no existence guard; `SlamView.jsx:33` iterates `grid.data` with no null check. A malformed `/scan` or `/map` message throws inside a `useEffect`, and React 18 unmounts the **entire tree**, including the e-stop button, with no visible error. | Add a top-level error boundary; add defensive shape guards at the ROS-message boundary. |
| F4 | **High** | `LidarView.jsx:9-11, 92-99` | "SAFETY ZONE BREACH" is a purely visual Canvas2D indicator with zero coupling to `/cmd_vel` or `/emergency_stop`. Wording implies enforcement; there is none. | Rename to make the display-only nature explicit, or wire real behavior. |
| F5 | **High** | `App.jsx:26-28` | Any `mode` change silently resets `mainView` to `'auto'`, discarding an operator's manual view pin with no warning — latent today since `/robot_mode` is never actually published, but will bite the moment it is. | Only reset on first observation, or show a toast instead of silently overriding. |
| F6 | **Medium** | `useOdometry.js:24-33` | The >2m jump-rejection assumes uniform sample spacing. After a reconnect/stall, the next `/odom` message can reflect several seconds of real motion and get discarded as a "reset," silently undercounting distance with no operator indication. | Use timestamp-delta-aware (velocity) thresholding; surface rejected jumps in the UI. |
| F7 | **Medium** | `ControlPanel.jsx`, `MissionPlanner.jsx` | None of START/PAUSE/RESUME/STOP/RETURN HOME/SEND GOAL check connection status before publishing — same fire-and-forget problem as e-stop, lower severity. | Same fix as F2, applied uniformly. |

### Correctness & robustness

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F8 | **High** | `useUrdfViewer.js:53-61` | `path: rosbridgeUrl.replace(/^ws/, 'http') + '/'` — for `wss://` this produces malformed `httpss://`. Even for `ws://`, port 9090 is the rosbridge WebSocket JSON-RPC endpoint, not an HTTP static file server; nothing in this stack serves mesh files there. Every mesh fetch fails, but the failures are async (not caught by the surrounding try/catch), so `status` still resolves to `'ready'` — **the widget reports success while rendering an empty scene.** | Add a dedicated mesh-server URL config; fix the `wss` regex bug regardless. |
| F9 | **Medium** | `useUrdfViewer.js:55-61` | `loader: ROS3D.COLLADA_LOADER_2` — verified against installed `ros3d@1.1.0`: this export does not exist (stale API from an older ros3d version). Evaluates to `undefined`, currently harmless but misleading dead code. | Remove the stale option. |
| F10 | **Medium** | `package.json:18` (`three@^0.160.0`) vs. `ros3d`'s bundled internals | Verified `ros3d.esm.js` imports only `roslib` and bundles its own internal ~r89-vintage three.js; it never reads `window.THREE`. The app's separate `three` dependency + `window.THREE` assignment in `useUrdfViewer.js:26-28` is dead weight — an entire unused second copy of three.js in the bundle. | Drop the `three` dependency and the `window.THREE` shim (verify visually first). |
| F11 | **Medium** | `useCameraFeed.js:70-88` | For the one real camera topic (`/camera/camera/color/image_raw`, raw `sensor_msgs/Image`), the hook returns `hasData: true` while `imageSrc` stays `null` (raw decoding is never implemented) — a direct violation of the app's own "no fabricated success" principle. | Implement raw-image decoding, or make `hasData` strictly require `imageSrc`. |
| F12 | **Medium** | `useCameraFeed.js` is dead code | Confirmed unused anywhere in `src/`. `CameraView.jsx` was patched to bypass it with a hardcoded `<img src>` off `VITE_WEB_VIDEO_URL`, silently dropping the auto-detect behavior the README still documents. | Delete the hook and fix the README, or re-wire `CameraView` to use it. |
| F13 | **Medium** | `MissionContext.jsx` + `GpsMapView.jsx:30-72` | `setMapApi(...)` in the map-creation effect has no `if (!compact)` guard. Two `GpsMapView` instances mount simultaneously (main + right-rail preview) whenever GPS is the main view; the preview's later-mounting call overwrites `mapApi`, so `MissionPlanner`'s "USE COORDINATES" pans/zooms the tiny preview map, not the main view. | Only call `setMapApi` from the non-compact instance. |
| F14 | **Low** | `useRosTopic.js:39-48` and same pattern in `useTF.js`, `useRobotMode.js` | Each subscribed topic runs its own independent 1Hz staleness-watchdog `setInterval` — ~8 uncoordinated timers with the current widget set. | Not urgent; could centralize if profiling shows it matters. |

### Race conditions / connection lifecycle

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F15 | **Medium** | `useTF.js:18-19`, `useUrdfViewer.js:16-18` | Both read `rosService.ros` directly instead of going through `useRosConnection()`'s status, leaving a narrow window where a stale/nulled `ros` reference could be captured in a closure if `reconnect()` were ever wired to a UI control (it currently isn't). | Route connection access through `useRosConnection()` status everywhere. |
| F16 | **Medium** | `useTF.js` vs `useUrdfViewer.js:45-51` | Two independent `ROSLIB.TFClient` instances with different `fixedFrame` (`map` vs `base_link`) — duplicate `/tf`/`/tf_static` WebSocket traffic, doubled whenever the SLAM view and URDF widget are both visible (the normal layout). | Share one `TFClient`. |
| F17 | **Low** | `main.jsx:9` `React.StrictMode` | Double-invokes effects in dev, harmless given `connect()`'s guard, but worth knowing during debugging. | No action needed. |

### UI/UX & Accessibility

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F18 | **Medium** | Entire `src/components/` tree | Zero `aria-*`/`role`/`aria-live` anywhere. Connection-loss and e-stop confirm-state changes are purely visual. | Mark connection status and e-stop confirm-state as `aria-live` regions at minimum. |
| F19 | **Low** | `PreviewPanel.jsx:3-9` | Preview panels are `<button>` elements wrapping a Leaflet map/canvas — unusual nesting, fragile if preview interactivity is ever added. | Consider a `div role="button"` wrapper if previews need internal interactivity later. |
| F20 | **Low** | No responsive breakpoints anywhere | Fine if the deployment target is a fixed operator workstation (as implied); undefined below ~1024px width. | Confirm deployment target explicitly before investing in responsive work. |
| F21 | **Low** | `UrdfWidget.jsx:14-22` | `error` and default-loading branches render identical text ("NO DATA — /robot_description"), making a genuine load error indistinguishable from "hasn't published yet." | Give `error` its own distinct message. |

### Code quality & architecture

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F22 | **Low** | `GpsPreviewMap.jsx` | Not imported anywhere — `App.jsx` uses `GpsMapView compact` instead. Orphaned duplicate of marker logic. | Delete, or wire in and remove the duplication the other direction. |
| F23 | **Low** | `package.json:17` (`react-grid-layout`) | Confirmed dead — zero imports anywhere. | Remove from `package.json`. |
| F24 | **Low** | `MissionContext.jsx` | Mixes UI-transient state (`mapApi`) with domain state (`destination`, `routeInfo`) in one context, no memoization on the provider value — every consumer re-renders on any field change. | Split contexts / memoize if more shared state gets added; not urgent at current scale. |
| F25 | **Low** | Formatting inconsistency across `MissionPlanner.jsx`, `MissionContext.jsx`, `GpsMapView.jsx` | Mixed indentation suggests hand-editing outside whatever formatter produced the rest of the codebase; no Prettier/ESLint config exists. | Add Prettier + CI lint check. |
| F26 | **Info** | No TypeScript/PropTypes/runtime schema validation anywhere | Direct cause of F3's crash risk — hooks make extensive unguarded shape assumptions about ROS messages. | Add defensive guards at the hook boundary (cheaper than full TS migration). |

### Test coverage

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F27 | **High** | Whole project | No test infrastructure at all — no `vitest`/`jest`, no config, no `__tests__`, no `*.test.jsx`. Zero coverage on the e-stop path or odometry jump-rejection logic. | See prioritized test plan in `spec.md`/`tasks.md`. |

### Performance & scalability

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F28 | **Low** | `GpsMapView.jsx:185-187` | Breadcrumb ring buffer uses `Array.shift()` (O(n)) past the 5000-point cap — negligible at current GPS publish rates. | Not worth fixing at this scale. |
| F29 | **Low** | `SlamView.jsx`, `LidarView.jsx` | Full canvas clear + redraw on every message, no dirty-region diffing — not a real bottleneck at current scan sizes/rates. | Leave as-is; revisit only if scan size/rate grow substantially. |
| F30 | **Medium** | Duplicate Leaflet instances | Two full Leaflet maps mount simultaneously (main + preview) whenever GPS is the main view, each independently fetching OSM tiles. | Consider a shared map instance with a PiP transform, or accept as a reasonable tradeoff. |
| F31 | **Info** | Bundle splitting | `ros3d`/`three` are correctly dynamically imported — good. Removing the dead `three` dependency (F10) is the highest-leverage bundle-size win available. | Same fix as F10. |

### Production readiness

| # | Sev | Location | What's wrong | Suggested fix |
|---|---|---|---|---|
| F32 | **High** | rosbridge has no authentication | Confirmed no `Authorization`/token/credential handling anywhere in `RosConnectionService.js`. Defensible only if the deployment network is a closed/trusted LAN — that must be a documented decision, not an oversight. | Document the trust boundary explicitly; enforce with network-level ACL/VPN if ever exposed beyond a physically-controlled LAN. |
| F33 | **Medium** | No `package-lock.json` committed | Confirmed via glob — every `npm install` can resolve different transitive versions, so vulnerability counts from `npm audit` aren't reproducible between runs. | Commit a lockfile; re-run `npm audit` against the locked tree and triage real vs. dev-only findings. |
| F34 | **Medium** | Production build never exercised | No `dist/` in repo, no CI. Given the ros3d/three quirk (F10), a production Vite build is exactly where module-resolution surprises would surface that dev mode wouldn't catch. | Run `npm run build && npm run preview` and smoke-test URDF widget, camera view, and e-stop before calling this deployable. |
| F35 | **Low** | No structured logging | `RosConnectionService`'s `ros.on('error', ...)` handler only sets status to `'error'`, discarding the actual error payload. | Log the error event payload; consider a lightweight in-app diagnostics panel. |
| F36 | **Info** | No CI/Dockerfile | Premature given the current `npm run dev` deployment model. | A minimal CI step (lint + build) is cheap and worth adding now; full CI/CD is not yet warranted. |
| F37 | **Info** | Browser compatibility | WebGL failure in `UrdfWidget` is one of the few genuinely well-handled failure paths in the app (caught, surfaces `NO DATA`). | No action needed — used as the model for how F1/F2 should behave. |

---

## 3. Roadmap Phases (source for `spec.md` phase grouping)

**Phase 0 — must-fix before any real deployment:** F1, F2, F3, F8, F32 (+ backend: real ROS subscribers/Nav2, tracked as a cross-team dependency, see `plan.md`).
**Phase 1 — should-fix before scaling to multiple robots/operators:** F13, F6, F11, F12, F27, F33, F26, F22, F23, F10.
**Phase 2 — nice-to-have polish:** F18, F25, F24, F35, F36.
