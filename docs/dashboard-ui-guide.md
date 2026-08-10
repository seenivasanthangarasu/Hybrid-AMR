# Dashboard UI Guide — Hybrid AMR Command Center

**Last updated:** 2026-08-10
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
| **RECONNECT** button | Header, appears on `error`/`closed`/`disconnected` | Re-establishes the rosbridge link **without a page reload**. |
| **Theme toggle** (sun/moon) | Header right | Switches dark ⇄ light. Persists in `localStorage` (`amr-theme`); first visit follows OS `prefers-color-scheme`. |
| **Settings gear** | Header far right | Opens the layout menu (below). |
| **Edit layout** toggle | Settings menu | Turns the whole dashboard into a **drag-and-drop, resizable grid**. A cyan "LAYOUT EDIT MODE" banner appears with a **DONE** button. |
| **Reset to default** | Settings menu | Restores the shipped panel arrangement. |

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
- **Connection-aware fallbacks** distinguish *why* data is missing: **OFFLINE** (no link),
  **CONNECTING**, **NO SIGNAL** (linked but the topic has no publisher), **STALE** (was live,
  now overdue). The camera panel shows **NO CAMERA STREAM** and auto-recovers when the stream
  returns.
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
  build never strands a stored layout.
- **`DashboardGrid`** wraps `GridLayout` with `WidthProvider`. `rowHeight` is computed from the
  live container height (12 rows fill one screen); taller custom layouts scroll. Free placement:
  `compactType={null}`, `preventCollision={false}`. Dragging is gated by
  `draggableHandle=".panel-drag-handle"` and `isDraggable={editMode}`; resizing by
  `isResizable={editMode}` with `draggableCancel=".react-resizable-handle"`.
- **`PanelFrame`** is the drag surface. In edit mode it overlays a `.panel-drag-handle` element
  (the react-grid-layout drag target) at **z-1100** — above Leaflet's map controls (z-1000) —
  so dragging the map panel isn't swallowed by Leaflet. The resize handle is themed at z-1200.

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
- **Headless-preview caveat.** react-grid-layout animates position with CSS transitions; a browser
  tab that isn't on-screen *pauses* transitions, freezing items at the origin. That's a preview
  artifact only — on a displayed browser the panels position and drag normally. New dependencies
  also require a **dev-server restart** (not just a reload) to be picked up by Vite.

---

## 5. Status

Front-end UI/UX phase (spec Phase U) is complete and browser-verified:

- REQ-16 Seamlessness · REQ-17 Extreme usability · REQ-18 Light mode — ✅
- REQ-19 Affordance honesty · REQ-20 Connection-aware fallbacks + reconnect ·
  REQ-21 Sensor-view freshness parity — ✅ (see [`remediation/tasks.md`](remediation/tasks.md))
- Phase-U cleanup backlog — ✅
- **Feature layer (this guide):** adaptable drag/resize layout + settings, framer-motion polish,
  standardized active-view highlight — ✅

Backend/runtime note: the dashboard connects to the robot's rosbridge at the URL in
`amr-dashboard/.env` (`VITE_ROSBRIDGE_URL`). Live telemetry additionally requires the robot's
sensor drivers to be publishing; see the robot bringup (`rock_bringup`).
