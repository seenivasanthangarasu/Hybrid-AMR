# Xtrmbly: environment-aware dashboard, indoor map lifecycle, and navigation

Copy this entire prompt into the development agent working on the client dashboard repository. Execute the phases in order. This is an implementation request, not a request to stop at a plan.

## 1. Objective and user requirements

Adapt the existing Xtrmbly dashboard to the environment and operating mode selected during onboarding. Implement setup-to-dashboard integration, indoor mapping, persistent client map storage, explicit map selection/activation, and environment-appropriate navigation.

Use the existing React/Vite application in `amr-dashboard/`. Preserve its dark dashboard design, typography, telemetry honesty, connection handling, and operator features. The name is **Xtrmbly**, never Extremely. Do not add a logo, slogans, promotional branding, or a replacement framework.

The user's rules are:

1. Indoor uses an indoor map and localization. Hide the GPS location map, geographic destination inputs, and GPS-only panels from this workspace.
2. Outdoor uses GPS and latitude/longitude destinations. It does not require an indoor SLAM map, saved-map picker, or Mapping Mode. Remove outdoor Mapping Mode.
3. Indoor Mapping Mode creates a map on the robot/server. Build a dedicated mapping workspace/component. Displaying `/map` alone does not implement map creation, completion, or saving.
4. After mapping finishes successfully, transfer the complete generated map artifact to persistent storage on the client dashboard computer. Store it inside the source session's folder and identify the mapping run that generated it.
5. The client owns the reusable map library. Do not assume a saved map library already exists on the server at startup.
6. Every fresh entry into Indoor Navigation Mode requires explicit user selection of a saved map. Do not silently reuse the last map or automatically select the newest map.
7. If no usable client maps exist, explain that a map must be generated and offer a clear action into Indoor Mapping Mode. Do not display an apparently ready navigation workspace without a map.
8. Selecting a client map must transfer/load it into the robot's navigation/localization stack and obtain real readiness confirmation before navigation is enabled.
9. Outdoor Navigation proceeds directly to latitude/longitude entry without indoor map prerequisites. Movement still requires a connected, capable robot and valid navigation readiness.
10. Preserve relevant common telemetry, connection feedback, and emergency-stop functionality.

“Outdoor only needs GPS” describes the map/navigation workflow. It does not mean disabling LiDAR, obstacle avoidance, local costmaps, camera, IMU, or sensors required by the robot.

## 2. Scope and explicitly labeled assumptions

This repository contains the browser client. The companion ROS 2 robot/server repository is separate. Historical backend descriptions are not evidence that endpoints are deployed.

Implement all client work possible here. If the server repository is available within the authorized workspace, inspect and implement the counterpart there. Otherwise implement documented client adapters, honest unavailable states, fixture-based tests, and an exact server handoff. Continue independent work instead of blocking the whole task. Never use fake production backend responses to claim end-to-end completion.

The following details were not fully specified by the user. Use these conservative assumptions and list them in your report:

- **Outdoor Manual Mode remains available** alongside Navigation Mode. The user removed Mapping Mode, not Manual Mode. “Direct navigation” means no indoor-map gate, not skipping the user's mode choice or starting movement on entry.
- **Hybrid requires an explicit active Indoor or Outdoor segment** for the initial implementation. Preserve `environment: hybrid` separately from this segment. Apply that segment's rules. Hybrid Mapping is indoor mapping only. Hybrid indoor navigation requires map selection/readiness; the outdoor segment uses GPS. Do not invent seamless autonomous transitions or switch an active mission when GPS quality changes. Automatic transitions require a future explicit robot contract.
- Mapping Mode does not imply autonomous exploration. Use actual supported mapping and movement interfaces; do not invent driving controls or browser-issued shell launch commands.

## 3. Inspect and preserve the existing implementation

Read applicable AGENTS.md files and inspect `git status` first. There are uncommitted changes, including onboarding and session support. Preserve unrelated work. Source is authoritative over older documents; verify these findings against the current tree.

Relevant files:

- `src/main.jsx`: default entry renders onboarding; `?view=dashboard` dynamically imports another entry.
- `src/dashboard-entry.jsx`: creates a React root, wraps App in MotionConfig/MissionProvider, and starts AmrSessionService.
- `src/components/onboarding/Onboarding.jsx`: welcome, environment/mode cards and placeholder; choices currently exist only in local React state, not App. `?skipWelcome=1` bypasses the 2.6-second welcome.
- `src/components/onboarding/onboarding.css`: corrected dark Xtrmbly setup styling.
- `src/App.jsx`: uses reported robot mode for its default view but mounts a fixed set of panels, including GPS preview and geographic mission planner; subscribes to GPS and occupancy data regardless of the user's environment.
- `src/hooks/useRobotMode.js`: reads `/robot_mode`, accepts INDOOR/OUTDOOR, and defaults to OUTDOOR when data is unavailable. This is reported environment, not Manual/Mapping/Navigation operating mode.
- `src/components/SlamView.jsx`: Canvas2D live occupancy renderer with TF/scan overlays. It does not start/stop SLAM or save/load maps. Its world-to-screen code assumes origin translation without fully handling origin rotation; do not copy this assumption into goal picking.
- `src/hooks/useOccupancyGrid.js`: subscribes to live `/map`. Its current shape check is not sufficient imported-file validation.
- `src/components/GpsMapView.jsx`, `MissionPlanner.jsx`, `src/context/MissionContext.jsx`, `src/utils/waypoints.js`: geographic map, coordinate entry, route editing and shared mission state. Reuse for outdoor; do not reinterpret these coordinates as indoor meters.
- `src/services/RobotCommandService.js`: source documents a ROS 2 action-protocol gap in the current ROSLIB ActionClient implementation and missing deployed navigation integration. Verify actual runtime; successful JS publication does not mean a goal was accepted or completed. Do not repeat the unsupported assumption that identity quaternion means unconstrained final heading; define heading semantics explicitly.
- `src/components/ControlPanel.jsx`: existing mission commands and emergency stop. Connection alone currently gates many commands; add operation readiness without weakening emergency stop.
- `src/components/StatusPanel.jsx`: directly subscribes to GPS/GNSS. Removing GPS preview alone will not remove irrelevant indoor fields/subscriptions.
- `src/components/Sidebar.jsx`, `DashboardGrid.jsx`, `src/hooks/useLayout.js`: fixed panel IDs and persisted `amr-layout-v3`; adapt per-workspace panel sets and layout persistence.
- `src/services/McapStorageService.js`: File System Access folder picker with directory handle persisted in IndexedDB. Permissions can expire.
- `src/services/AmrSessionService.js`: `/amr/session` schema v1, robot-owned power-on identity, 10-second heartbeat timeout, session-folder creation and capture lifecycle guards. The parser returns only defined v1 fields.
- `src/components/DataHandlingPage.jsx`: session/capture UI to integrate with.
- `src/services/BackupRotationService.js`: telemetry filename/retention utilities; maps must not be deleted through capture retention.
- `src/index.css`, `tailwind.config.js`, `components/ui/`: existing colors, typography, panels, dialogs and freshness vocabulary.

Read `README.md`, `docs/dashboard-ui-guide.md`, `docs/server-session-agent-prompt.md`, `docs/robot-repo-tasks.md`, and the connection handoff documents in `docs/prompts/`. `PROJECT_CONTEXT.md` distinguishes this client repository from historical robot descriptions.

## 4. Shared workspace state and capability policy

Refactor normal setup-to-dashboard navigation into **one React application root**. Lazy-load operational code as appropriate, preserve providers, and define service start/stop ownership. Avoid duplicate subscriptions under StrictMode or remounts. Do not use two files independently mounting roots as the normal transition.

Introduce a shared workspace provider/state model and one capability policy. Suggested concepts, not compulsory names:

- `environment`: indoor | outdoor | hybrid.
- `operatingMode`: manual | mapping | navigation.
- `activeSegment`: indoor | outdoor for Hybrid.
- `reportedRobotEnvironment` / `reportedRobotOperatingState`: separate telemetry values.
- `navigationEntryId`: unique to each navigation entry; scopes map selection and readiness.
- `selectedMapRef`: immutable map ID/revision/hash and local reference.
- `mapActivation`: upload/load/localization/readiness state with matching operation IDs.
- `operationRun`: run ID and parent server power-on session identity.

Keep user preferences, actual robot state, and supported capabilities separate. A UI selection is not evidence of a robot mode change. Show reported mismatches and block incompatible commands where needed; telemetry must not silently overwrite preferences or redirect active operations.

| Effective environment | Manual | Mapping | Navigation | Navigation representation |
| --- | --- | --- | --- | --- |
| Indoor | If supported | If supported | Explicit saved-map selection and activation | Occupancy map; map-frame goals |
| Outdoor | If supported | Unavailable | No indoor-map gate | GPS; geographic goals |
| Hybrid / Indoor | Indoor rules | Indoor mapping | Indoor rules | Occupancy map |
| Hybrid / Outdoor | Outdoor rules | Unavailable | Outdoor rules | GPS |

Remove not-applicable panels entirely. Disable applicable-but-unready operations with a concrete reason. Enforce policy in command services/handlers as well as UI. A stale URL, legacy `?view=dashboard`, localStorage value, keyboard action, or restored layout must not bypass prerequisites.

Unmount irrelevant features/subscriptions instead of merely fading or hiding them. Respect hook rules through component boundaries or supported hook options. Keep common safety sensors when needed.

Changing environment/segment/mode invalidates incompatible drafts and activation. Never automatically send movement commands on entry. If a real operation is active, require explicit stop/cancel and server confirmation before switching. Leaving a screen is not stopping the robot. Never automatically resume movement after reload/reconnect.

## 5. Power-on session versus operation run

Preserve the current authoritative `/amr/session` contract and folder name:

`<chosen-client-parent>/<started_at with colons replaced>__<robot_id>__<session_id>/`

A power-on session may contain manual use, multiple mapping runs, and navigation. Do not create a new power-on session on mode changes. Do not label the whole boot session as mapping when it contains several operations.

Add versioned operation-run metadata beneath that session. A mapping run owns its artifact(s) and references the parent boot session. Do not append metadata to `session.json` and assume it survives: AmrSessionService currently rewrites that file using its narrow schema. Prefer separate manifests with explicit ownership.

Suggested layout, compatible with current capture paths:

```text
<chosen-client-parent>/
  <existing-server-session-folder>/
    session.json
    <existing telemetry files>
    camera/
    runs/
      <run-id>/
        run.json
        maps/
          <map-id>/<revision>/
            manifest.json
            map.yaml
            map.pgm
            preview.png          # optional derived preview
            <pose-graph-files>   # only if required by actual stack
```

The exact package must match the actual server save/load stack. YAML plus image is a **proposed** occupancy package, not an existing endpoint. Localization or mapping-resume implementations may require serialized state. Record supported uses; a preview image or MCAP recording alone is not a complete navigable map.

Metadata should include schema version, map ID/revision/name, environment, compatibility, source robot/session/run, creation time, frame ID, resolution, dimensions, origin pose/yaw, required-file inventory, sizes/checksums and validated completion state. Separate server-owned metadata from client receipt/index metadata. Use collision-resistant IDs, not names/timestamps alone.

Index maps across prior sessions, including ended sessions. Reading historical maps must not require an active heartbeat. New capture follows existing confirmed-session/write-permission rules. Late retrieval from a completed run needs verified source identity and explicit recovery/import handling; never file it under the newest session accidentally.

## 6. Indoor Mapping Mode

Create a dedicated mapping workspace and state machine, reusing rendering/common panels where useful.

1. Enter Indoor → Mapping.
2. Check actual server mapping capability, connection/session and prerequisites. Verify client storage readiness before starting when automatic save is expected; explain permission/setup failures.
3. Start mapping only on an explicit supported request. Subscribing to `/map` or viewing a page is not starting SLAM.
4. Track start pending, accepted/running, stopping/finalizing, artifact ready, transferring, verifying, saved locally, interrupted and failed. Server map generation and client saving are distinct milestones.
5. “Finish and save map” requests server finalization/snapshot and a complete artifact. Specify whether it stops mapping or snapshots it according to actual backend behavior.
6. Retrieve, validate and persist the artifact under its correct run/session. Publish a ready library entry only after verifying all required files.
7. Offer navigation afterward, still requiring explicit selection for the new navigation entry.

Handle unsupported capability, rejected start, missing map, server save failure, disconnect, interrupted transfer, denied permission, disk full, checksum mismatch and wrong session/run. Retrying transfer must not silently create another mapping run. Correlate request IDs, ignore superseded responses, and reconcile unknown outcomes after timeouts.

If the browser closes before delivery, retrieve the completed artifact later from agreed server staging retention when available. Do not promise background capture by a closed browser. Do not let the server remove its only copy merely because a transfer started; require verified client receipt or a documented retention policy.

## 7. Persistent client map library

Build a library service and picker around existing storage conventions. Maps survive refresh, mode changes and later boot sessions. They are client-local, not automatically synchronized across computers/profiles.

- Reuse the selected parent directory and existing IndexedDB handle patterns. Store artifacts on disk; a rebuildable index may live in IndexedDB. Do not store large base64 maps in localStorage.
- Scan/reconcile known manifest locations; support refresh and detect externally changed/deleted files.
- Show name, optional thumbnail, source session/date, resolution/dimensions, compatibility and usable/corrupt/incomplete state.
- Distinguish no maps, no folder, expired permission, unsupported browser, scan failure, corrupt files and unavailable storage. Do not tell users to generate a map when the actual problem is permission.
- Request permissions from user gestures. A persisted handle is not a current permission grant.
- Multi-file filesystem writes are not automatically atomic. Stage files, verify contents and write a completion marker last. Ignore incomplete packages; recover retries without duplicate ready entries.
- Exclude maps from telemetry retention. Never silently overwrite maps with matching display names.
- Bound file count/package size; validate dimensions, finite positive resolution, origin, image consistency, checksums and safe package-relative filenames. Reject path traversal, absolute image paths, external file references, malformed YAML, unsupported formats and unsafe archive expansion.
- Unsupported File System Access must have an honest limitation state. An optional explicit import/export fallback must not present in-memory data as durable storage.
- Offline browsing of historical maps should work. Label saved previews distinctly from live robot state. Do not mark immutable saved maps stale simply because they are old.

## 8. Indoor Navigation and map activation

Every fresh Indoor Navigation entry, including a Hybrid indoor segment, begins a selection gate. Persisted preferences or old readiness acknowledgements cannot bypass it.

1. Open the local map picker before enabling navigation.
2. With no usable maps, show “No indoor maps found. Create a map in Mapping Mode to continue.” Provide Generate map and Back actions, preserving context.
3. On explicit selection, validate package/compatibility and show a local preview without implying robot activation.
4. Upload/stage the package because the robot may start without maps. A verified cache may avoid retransmission only when the server reports matching ID/revision/hash in the current context; explicit selection is still required. Client filesystem paths are not robot-accessible paths.
5. Request activation through the actual map-server/localization stack. Correlate acknowledgements to exact artifact and current robot/session/run.
6. Require localization/navigation readiness and valid robot pose. If initial pose is needed, expose a separate supported action; never fabricate it or assume the robot is at origin.
7. Enable map-frame destination selection only after these prerequisites. Indoor goals use meters, frame ID and defined heading semantics, not geographic coordinates.
8. Show acceptance/progress/cancellation/results only from actual server feedback. Sending alone remains unconfirmed.

Represent selected locally, uploading, staged, loading, loaded, awaiting localization, ready, unavailable, failed and unknown outcome separately. Disconnect/session change invalidates readiness. Reconnect reconciles actual server state without resending movement. Uploading a map never starts motion.

For click-to-goal and initial pose, implement correct image Y flip, resolution, origin rotation/translation, viewport pan/zoom, DPR, boundary checks and frame IDs. Do not present occupied/unknown cells as confirmed safe destinations; retain server planner validation. Verify scan overlays using real TF frames, not an assumed scan-frame/base_link equivalence.

A reusable occupancy renderer may accept explicit live/saved sources. Keep live mapping, saved preview and navigation on an activated map distinct. Loading a saved map must not accidentally restart SLAM or modify the map.

## 9. Outdoor Navigation and Manual Mode

Outdoor defaults to GPS and the existing geographic planner. Do not query the indoor library as a navigation prerequisite. Reuse validation and route editing; reject nonfinite/out-of-range coordinates, but accept zero as a legitimate latitude/longitude.

Use actual GPS/odometry/GNSS requirements rather than invented thresholds. Verify deployed ROS 2 action/bridge compatibility before claiming send/cancel/results work. Replace the documented incompatible action path with one contract-tested implementation; never silently fall back to ROS1 action wrappers. Geographic conversion, datum handling, route execution and obstacle avoidance belong on the robot.

Manual Mode remains for both environments when supported. Indoor Manual must not require a saved map. Display appropriate monitoring and supported controls. Existing ControlPanel mission actions are not automatically a complete teleoperation implementation; do not invent motion behavior. Preserve emergency stop.

## 10. Robot contract and missing-backend handoff

Inspect real capabilities, ROS interfaces and transport versions. Prefer existing supported interfaces. New names/formats are proposals until implemented and verified.

Define a versioned contract for:

- Capability discovery and requested versus actual environment/operating mode, readiness and mismatch reasons.
- Mapping start, finalization/save, cancellation/status reconciliation and artifact inventory/retrieval.
- Package format, bounded transfer/chunking, integrity verification and client receipt semantics.
- Map staging/activation; exact active map identity/hash; localization/initial-pose/navigation readiness.
- Map-frame and geographic goals, acceptance/rejection, progress/result, cancellation, timeout and reconnect behavior.
- Request/run/robot/session/map/revision/goal correlation, idempotency and stale-response rejection.
- Multiple-client ownership: one dashboard must not change the map/mode beneath another client's active operation. Define server-side rejection/locking rules.

The robot need not own a permanent reusable library, but must temporarily hold generated/uploaded artifacts and load the selected map. “No maps on server at startup” does not mean the robot can navigate without map data.

Avoid unbounded recurring topic payloads or arbitrary huge service responses for file transfer. Select a practical bounded transport supported by deployment. There is currently rosbridge and MJPEG, not an established map REST API; adding one is a deliberate interface change. Document network, CORS and authentication assumptions without inventing existing services.

If the server repository is unavailable, create `docs/server-mapping-navigation-agent-prompt.md` with exact example requests/responses, fields, state transitions, file format, errors, required ROS launch/lifecycle work and acceptance tests. Unsupported production operations must stay honestly unavailable. Backend absence is not a reason to abandon independent client work.

## 11. Ordered implementation phases

Maintain a checklist and execute these phases sequentially, with concise progress updates:

1. **Audit/design:** Verify source and backend scope; write capability matrix, session/run model, contracts and assumptions. Do not issue physical movement commands during an audit.
2. **Shared state/setup integration:** One root/provider tree; connect onboarding to App; enforce combinations and invalidate incompatible state; preserve welcome/skip; prevent legacy URL bypass.
3. **Environment-aware dashboard:** Filter panel registry, sidebar, status fields and subscriptions; separate indoor/geographic planners; implement workspace-specific layouts. Migrate existing layouts without wiping valid preferences. Avoid empty grid holes and invalid pinned views.
4. **Map storage/library:** Manifests, durable writes, validation/index recovery, permissions, previews and picker states. Tests use fixtures; production does not seed fake maps.
5. **Mapping:** Dedicated component/state machine plus adapter. Wire verified endpoints or mark unavailable and deliver server contract.
6. **Indoor Navigation:** Mandatory selection each entry; upload/load/localization readiness; map-frame goals and actual action feedback.
7. **Outdoor/Manual/Hybrid:** Preserve GPS planning, remove indoor prerequisites, address protocol compatibility, and apply explicit Hybrid segment rules.
8. **Verification/docs:** Appropriate tests, lint/build, responsive browser review; real client/server checks only when available and physical testing only with suitable operator authorization. Report all remaining external dependencies accurately.

Make phases reviewable, but do not stop after each to ask permission for already-authorized work. Complete independent work when backend dependencies block live operations; do not fabricate completion.

## 12. Acceptance tests

Add or adapt meaningful behavior tests:

- Valid mode matrix; no Outdoor Mapping; stale URLs/preferences cannot bypass gates.
- Indoor has no GPS/geographic planner/GNSS-only fields; outdoor has no indoor mapping or required saved-map gate. Irrelevant subscriptions are released.
- Reported robot mode does not silently replace user preferences or switch active operations.
- Indoor Manual/Mapping can begin without saved maps when supported.
- No-map versus missing folder/permission/unsupported API/corrupt map/scan-error states have distinct remedies.
- Every new Indoor Navigation entry requires selection, including leave/reenter, environment changes and reload. Late responses from old entries cannot enable current navigation.
- Selection alone does not enable navigation: correct artifact activation and localization are required.
- Disconnect/session changes invalidate readiness without resending goals; active-operation switches require proper reconciliation.
- Multiple mapping runs share one boot-session ID while retaining unique run IDs. Prior-session maps remain discoverable.
- Partial/corrupt transfers never appear ready; retries are idempotent; storage failures never become saved success.
- Map artifacts survive telemetry rotation; index reconstruction finds complete packages.
- Coordinate conversion covers nonzero origin yaw, Y flip, frame IDs and boundary cases; initial pose is distinct from destination.
- Outdoor accepts valid geographic coordinates without indoor library access. Unconfirmed/rejected commands never appear successful.
- Hybrid requires an explicit segment and never invents automatic transitions.
- Existing reconnect/freshness/e-stop, MCAP/camera sessions, route editing, layout persistence and theme behavior remain intact or are deliberately adapted.
- Keyboard/focus behavior, touch targets, reduced motion and mobile/tablet/desktop layouts remain functional.

Run appropriate Vitest tests, `npm run lint`, and `npm run build` in `amr-dashboard`. Report pre-existing warnings separately. Contract fixtures do not prove real ROS 2 interoperability; distinguish them from live integration tests.

## 13. Deliverables and final report

Deliver working client code, tests, run instructions, updated documentation, capability matrix, versioned artifact/transfer contract and backend handoff where needed. Correct obsolete entry-path, mode and session-storage documentation.

Report what works now, changed files/entry points, tests run, live robot checks performed versus not performed, exact missing backend capabilities, next action for each blocker, assumptions for Hybrid/Outdoor Manual, and actionable browser/storage limitations.

Do not claim map generation, file transfer or autonomous navigation works because a UI renders, a mocked test passes or a publish call returns. Preserve the project's core rule: show actual state and its cause; never fabricate telemetry, readiness, map completion or mission success.
