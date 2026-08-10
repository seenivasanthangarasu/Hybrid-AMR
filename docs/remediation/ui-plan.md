# UI Betterment Plan — Hybrid AMR Dashboard

**Date:** 2026-08-07
**Companion docs:** [`spec.md`](spec.md) (safety/functional remediation), [`plan.md`](plan.md), [`tasks.md`](tasks.md)
**Scope of THIS doc:** the **visual / UX layer only**. No new data plumbing, no ROS contract changes — those live in `spec.md`. This plan assumes the `spec.md` work either lands first or in parallel; it never contradicts it.

## Direction (decided)

- **Ambition:** *Refine + restructure.* Keep the existing dark "command-center" identity (the `deck`/`signal`/`ink` token system in [`tailwind.config.js`](../../amr-dashboard/tailwind.config.js) stays). Rework **layout** and **feedback**, not the aesthetic.
- **North-star priority:** **at-a-glance monitoring.** Every design decision below is judged against one question: *can an operator standing back from the workstation read robot state correctly, and instantly tell live vs stale vs no-data vs disconnected?*

## Design principles

1. **One vocabulary for state.** A green/amber/red signal means the same thing in the header, the status panel, and command feedback. No per-component reinvention.
2. **Freshness is a first-class visual property.** Every telemetry value carries an implicit "how old is this?" — the UI must show it, not hide it.
3. **Safety controls are never just another panel.** The control/e-stop zone is visually privileged and always reachable.
4. **Refine, don't relayout for its own sake.** Restructuring is justified only where it improves glanceability.

---

## Workstreams

### UI-01 — Shared state-signal system *(foundation; do first)*
**Problem:** connection status ([`Header.jsx`](../../amr-dashboard/src/components/Header.jsx) `STATUS_STYLES`), MODE chip, `StatusPanel` conn label, and `CommandFeedback` each hand-roll their own color+dot+label logic. Same concept, four implementations → inconsistent glance-reading.
**Change:**
- New `SignalChip` / `SignalDot` presentational components (`src/components/ui/`) — props: `tone` (`live|warn|critical|idle|stale`), `label`, optional `pulse`.
- Centralize the tone→color map once (green=`signal-green`, amber=`signal-amber`, red=`signal-red`, idle=`ink-low`).
- Refactor Header status, MODE chip, StatusPanel's ROS-connection row, and CommandFeedback to consume it.
**Glanceability payoff:** color always means the same thing.

### UI-02 — Freshness / staleness treatment *(highest at-a-glance value)*
**Problem:** `StatusPanel` shows either a value or flat `NO DATA` ([`StatusPanel.jsx:9`](../../amr-dashboard/src/components/StatusPanel.jsx)). It cannot express "this number is real but 8 seconds old" — the most dangerous ambiguity for a monitoring operator.
**Change:**
- Introduce three explicit visual states per telemetry value: **LIVE** (normal), **STALE** (last update older than a per-topic threshold — dimmed + small age tag e.g. `8s`), **NO DATA** (never received).
- Requires a `lastUpdated` timestamp from the topic hooks; if `spec.md`'s `useRosTopic` staleness work (REQ-09 area) exposes this, reuse it — do **not** build a parallel timer.
- Apply to `StatusPanel` rows and to each preview/main sensor view (a corner freshness badge).
**Glanceability payoff:** the core of the whole request — trustworthy-at-a-distance telemetry.

### UI-03 — Restructure: privilege the control/safety zone
**Problem:** Status / Mission / Control are a co-equal 3-up row ([`App.jsx:64`](../../amr-dashboard/src/App.jsx)); the safety-critical control cluster has no visual priority and scrolls like everything else.
**Change (keep identity, rework layout):**
- Give the control + e-stop cluster a distinct, heavier-bordered zone that stays visible (does not scroll away).
- Consider moving primary telemetry (Status) into a persistent top-of-rail or a wider dedicated strip so the numbers an operator watches most are always in the same place.
- Make e-stop's 3-second confirm window **visible** — a shrinking bar / countdown ring on the button (the timeout in [`ControlPanel.jsx:38`](../../amr-dashboard/src/components/ControlPanel.jsx) is currently invisible to the operator).
**Constraint:** must not regress the per-panel `ErrorBoundary` isolation from `spec.md` REQ-03.

### UI-04 — Preview rail & main-view relationship
**Problem:** active preview is signalled only by a thin cyan ring ([`PreviewPanel.jsx:7`](../../amr-dashboard/src/components/PreviewPanel.jsx)); the "this preview is what's live in the main view" link is weak at a glance.
**Change:**
- Strengthen the active-preview affordance (label badge "● LIVE IN MAIN", stronger edge treatment).
- Clarify the MAIN VIEW header chip ([`App.jsx:57`](../../amr-dashboard/src/App.jsx)) and add a subtle transition when the main view switches so the operator's eye tracks the change.
- Distinguish the non-interactive URDF card (currently `active={false} onClick={()=>{}}`) from the clickable view-switching previews so it doesn't read as "broken/unselectable."

### UI-05 — Telemetry hierarchy & readability
**Problem:** all `StatusPanel` rows are visually equal weight; from across a room nothing stands out.
**Change:**
- Promote the 2–3 most-watched values (Speed, Mode, Connection) to larger "hero" readouts; demote lat/long precision detail.
- Tighten the type scale and tabular-number alignment (`data-value` already uses tabular-nums — extend consistently).
- Add unit/label rhythm so scanning is vertical and fast.

### UI-06 — Motion with meaning *(polish, do last)*
**Problem:** `scan` + `pulse-slow` keyframes are defined but underused ([`tailwind.config.js:37`](../../amr-dashboard/tailwind.config.js)).
**Change:** purposeful, restrained motion only — live-sensor scanline, connection-pulse (already partial in Header), e-stop confirm countdown (UI-03), view-switch transition (UI-04). No decorative animation. Respect `prefers-reduced-motion`.

### UI-07 — Seamlessness *(spec REQ-16)*
**Problem:** state changes today can jar — different components draw the same status differently, and values appearing/disappearing reflow their neighbours.
**Change:**
- Single state vocabulary via UI-01's `SignalChip`/`SignalDot` — same tone renders identically everywhere.
- Zero layout shift: fixed row/panel heights reserve space for value ↔ `NO DATA` ↔ error so nothing reflows.
- Smooth transitions on main-view switch, preview activation, and theme change; all behind `prefers-reduced-motion: no-preference`.

### UI-08 — Extreme usability *(spec REQ-17)*
**Problem:** disabled controls don't say why; the e-stop confirm window is invisible; there's no consistent keyboard/focus story; telemetry is flat.
**Change:**
- Theme-aware global `:focus-visible` ring; verified tab order; fully mouse-free operable.
- Disabled controls always state the reason inline.
- Visible e-stop confirm countdown (folds together with UI-03).
- Telemetry glance hierarchy (hero Mode/Speed/Connection) + freshness from UI-02.
- Comfortable hit targets; consistent `PanelHeader` primitive.

### UI-09 — Light mode / theming *(spec REQ-18; FOUNDATION, do first)*
**Problem:** every color is baked hex in [`tailwind.config.js`](../../amr-dashboard/tailwind.config.js) and [`index.css`](../../amr-dashboard/src/index.css); no theme can invert.
**Change:**
- Channel-ize all tokens to `rgb(var(--token) / <alpha-value>)` so existing `/opacity` modifiers survive.
- `:root` = dark (unchanged), `:root[data-theme="light"]` = light overrides; convert `.panel`, body bg, scrollbar, `.data-*`, `.no-data`, `.leaflet-container` to variables.
- `useTheme` hook (localStorage + OS `prefers-color-scheme`, no-flash init) + Header toggle.
- Light palette keeps signal-color safety legibility and e-stop prominence in both themes.

---

## Sequencing *(front-end-first, updated 2026-08-07)*

1. **UI-09** (light-mode / token foundation) — **do first**; the token refactor is what UI-01 and the theme-aware focus/motion work build on.
2. **UI-01** (shared signal system) — everything else consumes it.
3. **UI-07** (seamlessness) — depends on UI-01 + UI-09.
4. **UI-02** (freshness) — the headline at-a-glance win; depends on a `lastUpdated` source.
5. **UI-03 + UI-08** (control-zone restructure + usability, incl. e-stop countdown) — biggest layout change; do while UI is still small.
6. **UI-05** (telemetry hierarchy) — refines what UI-02/UI-03 restructured.
7. **UI-04** (preview rail) — independent, slot anywhere after UI-01.
8. **UI-06** (motion) — final polish pass.

## Explicitly NOT in this plan
- Responsive/tablet layout (matches `spec.md` non-goal — fixed operator workstation).
- Color-palette or font replacement (identity stays).
- New data sources or ROS topics (that's `spec.md`).
- A component library / design-token migration beyond the small `src/components/ui/` primitives introduced in UI-01.

## Open dependency
UI-02 needs per-value `lastUpdated`. Confirm whether `spec.md`'s test/staleness work on `useRosTopic` will expose a timestamp the UI can read, or whether a thin `useFreshness` wrapper is needed. Resolve before starting UI-02.
