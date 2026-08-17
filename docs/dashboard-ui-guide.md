# Dashboard UI Guide — Hybrid AMR Command Center

**Last updated:** 2026-08-13
**Scope:** the operator-facing UI and the front-end architecture of `amr-dashboard/`.
**Companion docs:** [`remediation/spec.md`](remediation/spec.md) (safety/functional requirements),
[`remediation/ui-plan.md`](remediation/ui-plan.md) (visual/UX plan), [`remediation/tasks.md`](remediation/tasks.md)
(execution checklist).

This guide documents the work delivered on top of the Phase-U remediation: the
**adaptable panel layout**, the **settings control**, the **framer-motion motion layer**,
and the **state/freshness vocabulary** — plus the design decisions behind them.

---

## 1. Operator guide

Everything below lives in the **Header** (top bar) or on the panels themselves.

| Control | Where | What it does |
|---|---|---|
| **Connection chip** | Header right | One shared tone for link state: `ROSBRIDGE LINKED` (green), `CONNECTING` (amber, pulsing), `LINK CLOSED` / `CONNECTION ERROR` (red), `DISCONNECTED` (grey). |
| **AUTO-RETRY chip** | Header, beside the connection chip, on link loss | The dashboard reconnects **on its own**: `AUTO-RETRY 3/6 · 4s` counts down to the next attempt. Retries are **bounded** — after 6 the chip reads `AUTO-RETRY GAVE UP (6)` and stops. |
| **RECONNECT** button | Header, appears on `error`/`closed`/`disconnected` | Re-establishes the rosbridge link **without a page reload**, immediately rather than waiting for the countdown. Also **resets a spent retry budget** to a fresh round of 6. |
| **Theme toggle** (sun/moon) | Header right | Switches dark ⇄ light. Persists in `localStorage` (`amr-theme`); first visit follows OS `prefers-color-scheme`. |
| **Settings gear** | Header far right | Opens the layout menu (below). |
| **Edit layout** toggle | Settings menu | Turns the whole dashboard into a **drag-and-drop, resizable grid**. A cyan "LAYOUT EDIT MODE" banner appears with a **DONE** button. |
| **Reset to default** | Settings menu | Restores the shipped panel arrangement. |
| **Error reference** | Settings menu → HELP | Opens the catalogue of every fault state the dashboard can report, with the dialog each one raises. |

### Fault explanations (dialogs)

A badge tells the operator *that* something is wrong; a dialog tells them **what, why,
and what to do**. Dialogs are raised only where guessing would be costly:

- **Selecting an empty view.** Clicking a preview with nothing to draw switches the view
  *and* opens a dialog naming the specific cause — `OFFLINE` (link down) vs `NO SIGNAL`
  (link fine, topic silent) vs `STALE` vs `NO CAMERA STREAM` — with the operator steps
  for that case. Link faults carry a **RECONNECT** button inline.
- **A command that did not reach the robot.** A failed dispatch raises a dialog (not just
  the inline feedback line), because a silently-failed emergency stop is the worst case
  in the app. It names the fallback: use the physical e-stop.
- **Error reference** (settings → HELP) lists all states grouped by Connection /
  Telemetry / Commands / System, each with a *VIEW DIALOG* preview, so the vocabulary
  can be learned before an incident rather than during one.

Every dialog is keyboard-operable: focus moves in on open, Tab is trapped inside,
**Esc** or the backdrop closes it, and focus returns to whatever opened it.

### Rearranging panels (Edit layout)

1. Gear → **Edit layout**. Each panel gets a **dashed cyan overlay** with a grip icon + its name.
2. **Move:** press-drag a panel anywhere (grab the cyan overlay).
3. **Resize:** drag the **bottom-right corner** handle.
4. **DONE** (banner) or toggle Edit layout off to lock it again.

The arrangement is saved to `localStorage` (`amr-layout-v1`) and restored on reload.
Panels are **locked by default** — you must enter Edit layout to move them (so normal
clicks keep driving the robot, never the layout).

### Reading telemetry state

The dashboard makes **freshness a first-class visual property** — a value is never shown
as if live when it isn't:

- **Active view highlight** — the preview currently shown in the main view has a glowing
  cyan top bar, an inset cyan border, and a pulsing **LIVE IN MAIN** badge. Click any other
  preview to switch (except the URDF card, which is a static display, not a selectable view).
- **Freshness badges** (LiDAR/SLAM corners, Status rows): **LIVE** (green), **STALE · 8s**
  (amber, with age), **NO DATA** (grey).
- **Connection-aware fallbacks** distinguish *why* data is missing: **OFFLINE** (no link and
  not being retried), **RETRYING** (link dropped, an automatic attempt is pending),
  **CONNECTING**, **NO SIGNAL** (linked but the topic has no publisher), **STALE** (was live,
  now overdue). The camera panel shows **NO CAMERA STREAM** and auto-recovers when the stream
  returns.

  The **OFFLINE / RETRYING** split matters: `RETRYING` means the dashboard is already handling
  it and the operator should wait; `OFFLINE` means the automatic attempts are spent and the
  robot or the network genuinely needs attention. Panels flip from `RETRYING` to `OFFLINE` at
  the moment the budget runs out.
- **E-stop** has a **visible confirm-window countdown** (shrinking red bar) on the two-click
  arm, and disabled command buttons state *why* on hover ("Disconnected — commands unavailable").

---

## 2. Dependencies added

| Package | Version | Why |
|---|---|---|
| `framer-motion` | ^11 | Motion layer — fallback/highlight animation, view crossfade, settings menu, edit banner. Global `MotionConfig reducedMotion="user"` honours OS `prefers-reduced-motion`. |
| `react-grid-layout` | ^1.5 | The draggable/resizable panel grid. **NOTE:** the remediation plan (REQ-11) originally listed this for *removal* as dead code — that is now **reversed**; it backs the editable layout. Do not remove it. |

---

## 3. Front-end architecture

### Layout system

```
App.jsx
 └─ DashboardGrid.jsx        WidthProvider(GridLayout); rowHeight derived from container
     ├─ useLayout.js         layout state + localStorage persistence + reset + reconcile
     └─ PanelFrame.jsx       per-cell wrapper; renders the .panel-drag-handle edit overlay
```

- **`useLayout`** holds the react-grid-layout geometry for all 8 panels (`main`, `status`,
  `mission`, `control`, `gps`, `lidar`, `camera`, `urdf`), persists to `amr-layout-v1`, and
  `reconcile()`s a saved layout against `DEFAULT_LAYOUT` so adding/removing a panel in a future
  build never strands a stored layout. `reconcile()` also **`sanitize()`s** each stored entry —
  non-finite geometry falls back to the shipped value and `x`/`w` are clamped into the 12-column
  grid — so a corrupt or hand-edited `amr-layout-v1` can never render a panel off-screen or
  zero-sized. Covered by [`useLayout.test.js`](../amr-dashboard/src/hooks/useLayout.test.js).
- **`DashboardGrid`** wraps `GridLayout` with `WidthProvider`. `rowHeight` is computed from the
  live container height (12 rows fill one screen); taller custom layouts scroll. Rearrangement is
  **`compactType="vertical"`, `preventCollision={false}`** — a drop *displaces* the panels it
  lands on and the grid settles upward. Do **not** revert to `compactType={null}`: that
  combination lets two panels own the same cells, so dropping one onto another stacked them and a
  panel silently disappeared underneath its neighbour (and dragging away left an un-fillable
  hole). The shipped default layout is already fully packed, so it renders identically either way
  — which is why the regression was invisible until a panel was actually moved. Dragging is gated
  by `draggableHandle=".panel-drag-handle"` and `isDraggable={editMode}`; resizing by
  `isResizable={editMode}` with `draggableCancel=".react-resizable-handle"`.
- **`PanelFrame`** is the drag surface. In edit mode it overlays a `.panel-drag-handle` element
  (the react-grid-layout drag target) at **z-1100** — above Leaflet's map controls (z-1000) —
  so dragging the map panel isn't swallowed by Leaflet. The resize handle is themed at z-1200.

### Error catalog & dialogs

```
src/errors/catalog.js          13 fault states: code, tone, severity, summary, causes, remedies
src/components/ui/Dialog.jsx   accessible modal primitive (focus trap, Esc, restore focus, z-3000)
src/components/ErrorDialog.jsx renders one catalog entry (summary → causes → remedies)
src/components/ErrorReference.jsx  the catalogue page, grouped by category
```

`catalog.js` is the **single source of truth** — the inline badges, the dialogs, and the
reference page all read from it, so they cannot describe the same fault differently.
`diagnoseView()` encodes the precedence (link state first, then never-seen vs went-quiet)
and deliberately mirrors `DataFallback`, so a panel's badge and its dialog always agree.
Note the camera is diagnosed separately: it streams over HTTP from `web_video_server`, not
rosbridge, so a healthy `ROSBRIDGE LINKED` chip says nothing about it.

Adding a fault state means adding one catalog entry — the reference page and its dialog
are generated. `catalog.test.js` enforces that every entry carries causes *and* remedies.

### State / freshness vocabulary (spec REQ-16/17/20/21)

```
src/components/ui/signalTones.js   one tone→colour map (live/warn/critical/idle/stale/info)
src/components/ui/SignalDot.jsx    a tone dot
src/components/ui/SignalChip.jsx   dot + label
src/components/ui/FreshnessBadge.jsx  LIVE / STALE+age / NO DATA, from classifyFreshness
src/components/DataFallback.jsx    OFFLINE/CONNECTING/NO SIGNAL/STALE (+ explicit-label mode)
src/utils/freshness.js             classifyFreshness() + formatAge()
src/hooks/useNow.js                shared 1s ticker so ages count up without per-hook timers
```

Topic hooks (`useOdometry`, `useGps`, `useLaserScan`, `useOccupancyGrid`, `useTF`) all expose
the same timing signals — `hasData` (live-only), `hasEverData`, `stale`, `lastReceivedAt` — so
every sensor view can show true LIVE/STALE/NO-DATA instead of a `hasData`-only "LIVE".

### Theming

All colours are CSS custom properties (space-separated RGB channels) in
[`index.css`](../amr-dashboard/src/index.css) so Tailwind `<alpha-value>` modifiers work in both
themes. `:root` = dark, `:root[data-theme="light"]` = light. Canvas views (LiDAR/SLAM/URDF) read
tokens through `utils/themeColor.js` and re-draw on theme change. `useTheme.js` (localStorage +
OS preference, no-flash init) drives the Header toggle.

### Motion

`framer-motion`, all under the app-level `MotionConfig reducedMotion="user"`:
- `DataFallback` — spring entrance + a radar "ping" ring on the tone dot.
- Main-view switch — `AnimatePresence` crossfade (`App.jsx`).
- `SettingsMenu` — gear rotate + spring popover; edit banner height/opacity.
- Active-preview marker — a fade-in glowing top bar (no `layoutId`, so it never flies between
  panels) + a pulsing LIVE-IN-MAIN dot.

---

## 4. Design decisions & gotchas

- **Active highlight uses an *inset* ring, not an outer ring.** Each panel now sits in a grid
  cell with `overflow-hidden`, which clips outer rings/`shadow-glow`. The active marker is inset
  (`ring-inset`) + a top bar drawn inside the panel, so nothing is clipped.
- **No `layoutId` on the active bar.** A shared `layoutId` made the bar animate across grid cells
  when switching views (looked inconsistent). It's now a per-panel fade-in — identical on every
  active preview.
- **Drag overlay z-index beats Leaflet.** The `.panel-drag-handle` is z-1100 (Leaflet controls are
  z-1000); the resize handle is z-1200. Without this, the map panel couldn't be dragged.
- **Controlled layout.** `DashboardGrid` is controlled via `layout` + `onLayoutChange={setLayout}`;
  react-grid-layout fires `onLayoutChange` on drag/resize **stop**, so persistence is one write per
  gesture with no mid-drag prop fighting.
- **`process` polyfill is REQUIRED for drag/resize.** react-draggable (used directly for dragging
  and indirectly by react-resizable for resizing, both via react-grid-layout) calls an internal
  `log()` that reads `process.env.DRAGGABLE_DEBUG` on every drag/resize **start**. The browser has
  no `process` global, so it throws `ReferenceError: process is not defined` and the gesture is
  aborted — **all panel drag/resize silently fail** in Layout Edit Mode. Fixed in
  [`vite.config.js`](../amr-dashboard/vite.config.js) with `define: { 'process.env.DRAGGABLE_DEBUG':
  'false' }` (dev **and** build). Don't remove it.
- **Headless-preview caveat (why the above was missed).** react-grid-layout positions items with CSS
  transitions; a browser tab that isn't on-screen *pauses* transitions, freezing every item at the
  origin. This makes the layout look "not working" in a non-displayed preview even when it is — but
  it also masked the real `process` bug above, which only reproduces on a **displayed** browser when
  you actually attempt a drag. Verify drag/resize on a real display (or by asserting the layout
  state changes), never by eyeballing the preview. New dependencies / `vite.config.js` changes also
  require a **dev-server restart** (not just a reload) to be picked up by Vite.

---

## 5. Status

**Every phase of the remediation checklist is closed** (see
[`remediation/tasks.md`](remediation/tasks.md)). Gates: `npm run lint` clean · `npm test`
**27/27** · `npm run build` passes.

- **Phase 0** REQ-01…05 — command honesty, error boundaries, URDF mesh path, trust boundary — ✅
- **Phase U** REQ-16…21 — seamlessness, usability, light mode, affordance honesty,
  connection-aware fallbacks, freshness parity — ✅
- **Phase 1** REQ-06…11 — map race, time-aware odometry, camera honesty, dead-code removal,
  lockfile + [audit triage](remediation/npm-audit-triage.md), test infrastructure — ✅
- **Phase 2** REQ-12…15 — `aria-live`, Prettier/ESLint, context note, error logging — ✅
- **Deferred UI** F4 (display-only zone wording) · F5 (pinned view survives mode change) — ✅
- **Feature layer:** adaptable drag/resize layout + settings, framer-motion polish,
  standardized active-view highlight — ✅
- **Error UX:** 12-state error catalog, accessible fault dialogs, error reference page — ✅

Fixed after live browser testing (none of which reproduced in a headless preview):

- Panel **drag/resize was entirely non-functional** — `process.env.DRAGGABLE_DEBUG` threw in the
  browser (see §4).
- Rearranged panels **overlapped and vanished** — `compactType={null}` let two panels own the
  same cells (see §3).
- Edit-mode labels **criss-crossed** the panel content beneath them — scrim was too transparent.

Known remaining work is **backend/ROS-side**, not dashboard: there is still no robot-side
subscriber for `/emergency_stop`, `/mission_state_cmd`, or `/mission_goal`, and no Nav2 stack —
so commands honestly report *sent — unconfirmed* and can never reach `CONFIRMED`. A few
checklist lines are marked `[~]`: code-verified and unit-tested, but needing a live publishing
robot to exercise end-to-end.

### Mission routes (multi-waypoint)

The Mission Planner builds an **ordered route** rather than a single goal. Waypoints are added
from the entry form (or by arming `+ ADD WAYPOINT` on the map and clicking it), reordered with
the per-row ▲▼ controls, repositioned by dragging their map pin, and removed individually or
via a confirming `CLEAR ALL`. Selecting a row focuses that pin on the map, and clicking a pin
selects its row.

Two deliberate limits, both about not inventing information:

- **`SEND ROUTE` dispatches the whole route as one `FollowGPSWaypoints` goal**, so the *robot*
  sequences it. The dashboard walking the route itself would need an "arrival" signal that does
  not exist, leaving the browser to guess arrival from GPS proximity. Waypoints therefore stop
  at `SENT_UNCONFIRMED`; there is no `REACHED` state until real action feedback exists.
- **The route length is straight-line and labelled as such**, and there is no ETA — the
  dashboard knows no speed, and Nav2 owns the actual drivable path.

Beyond the missing Nav2 stack, these action calls also have a **protocol** gap: roslib's
`ActionClient` speaks ROS1 actionlib, which a ROS2 action server does not answer. See
`PROJECT_CONTEXT.md` §5.2.

### GNSS quality (DOP, C/N0, accuracy, RF health)

`/fix` (`sensor_msgs/NavSatFix`) carries a position and almost nothing about how much to
trust it. The **GNSS QUALITY** panel — full width, row 12, below the one-screen fold —
adds the receiver-side detail, and the three headline figures (satellites, HDOP, accuracy)
are repeated in the Status panel and the map's corner overlay so a position is never shown
without a confidence alongside it.

Sources (`hooks/useGnssQuality.js`, maths and vocabulary in `utils/gnss.js`):

| Block | Topic | What it shows |
|---|---|---|
| SOLUTION | `/navpvt` (`ublox_msgs/NavPVT`) | Fix type, `gnssFixOK`, **RTK** carrier solution (NONE / FLOAT / FIXED), differential corrections, satellites used, UTC + validity, TTFF (from `/navstatus`) |
| ACCURACY | `/navpvt` + `/fix` | `hAcc`/`vAcc` (the receiver's own 1σ estimates) and **CEP(50%) / R95 / DRMS / 2DRMS** plus per-axis σ, derived from `position_covariance` |
| GEOMETRY · DOP | `/navdop` (`ublox_msgs/NavDOP`) | **HDOP** (hero, with an IDEAL→POOR rating) plus PDOP/VDOP/GDOP/TDOP/NDOP/EDOP |
| SIGNAL · C/N0 | `/navsat` (`ublox_msgs/NavSAT`) | Per-satellite **C/N0** bar chart, strongest-first, solid = used in the solution; visible/used counts, mean C/N0, per-constellation breakdown |
| RF FRONT-END | `/monhw` (`ublox_msgs/MonHW`) | Antenna status (OK/SHORT/OPEN), jamming state + indicator, AGC, noise level; plus MSL vs ellipsoid height and their geoid separation |

Three things worth stating precisely, because the names get mixed up:

- **There is no RSSI in GNSS.** A GNSS signal arrives ~20 dB *below* the thermal noise
  floor, so received power says nothing on its own. Receivers report post-correlation
  **C/N0** (carrier-to-noise density, dB-Hz, 0–63) per satellite instead. The nearest
  wideband "how strong is the RF here" figure is MonHW's AGC / jamming indicator, which is
  why those sit in their own block.
- **CEP is not a transmitted field.** No GNSS message contains one; it is a statistic. The
  panel derives it from the fix covariance as `1.1774·σ` (and R95 as `2.4477·σ`, DRMS as
  `√(σE²+σN²)`), assuming a circular-normal horizontal error — which is why the raw per-axis
  sigmas are shown too. Where the receiver publishes its own `hAcc`, that is preferred as
  the headline.
- **DOP is unitless geometry**, not an error: position error ≈ DOP × ranging error.

**Satellite count** is the other half of the accuracy picture — DOP says how well-spread the
satellites are, the count says how many there are to spread — so it carries the same rating
vocabulary and tone as DOP wherever it appears (panel header chip, SOLUTION → *Sats used*,
SIGNAL → *Used*, the Status row and the map overlay): `≥9 EXCELLENT` / `7–8 GOOD` /
`5–6 FAIR` / `4 MINIMUM` / `1–3 INSUFFICIENT` / `0 NONE`. Four is the arithmetic minimum for
a 3D fix (three for position, one for the receiver clock), so it is deliberately rated amber,
never green: a solution with no redundancy is one obstruction away from dropping. The rating
uses the **used** count from `numSV`, not the visible one — a satellite the receiver can see
but has not included contributes nothing to the fix.

Two robustness details. The five diagnostic topics are subscribed and reported
**independently** — the u-blox driver publishes each only when the matching
`publish.nav.*` / `publish.mon.*` option is set in `ublox_config.yaml`, so a receiver with
DOP disabled shows live satellites next to an honest `NO DATA` for geometry rather than a
blank panel. And every field is read under both its ROS1 (`hAcc`, `numSV`, `gnssId`) and
ROS2 (`h_acc`, `num_sv`, `gnss_id`) spelling, so a driver-version difference degrades to
nothing instead of to a panel of NO DATA.

Topics are unprefixed because `ros2 run ublox_gps ublox_gps_node` puts the node in the root
namespace — the same reason `/fix` is unprefixed. Set `VITE_UBLOX_NS` if the driver is
launched inside a namespace.

Backend/runtime note: the dashboard connects to the robot's rosbridge at the URL in
`amr-dashboard/.env` (`VITE_ROSBRIDGE_URL`). Live telemetry additionally requires the robot's
sensor drivers to be publishing; see the robot bringup (`rock_bringup`).
