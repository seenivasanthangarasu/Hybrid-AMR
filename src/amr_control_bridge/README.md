# amr_control_bridge

Server-side AMR Control Operations, Workspace State, and RPC Lifecycle Bridge for **Hybrid-AMR** on **ROS 2 Jazzy**.

---

## 📌 Architectural Overview

`amr_control_bridge` implements the authoritative server side of the workspace control and state contracts enforced by the client dashboard (`WorkspaceBridge.js` / `RobotCommandService.js`):

1. **Authoritative Session Broadcast (`/amr/session`)**:
   - Publishes `std_msgs/msg/String` JSON envelope every 2.0s and immediately on boot.
   - Idempotently synchronized with `amr_session`'s kernel-boot-bound session UUID.
2. **Capability Heartbeat (`/amr/workspace/state`)**:
   - Publishes `std_msgs/msg/String` JSON envelope every 1.0s.
   - Emits monotonically increasing safe integer `sequence`.
   - Broadcasts supported capabilities: `operation.start`, `operation.pause`, `operation.resume`, `operation.cancel`, `navigation.home`, `navigation.indoor`, `navigation.outdoor`, `operation.reconcile`.
   - Conveys `operation.state` (`idle` | `running` | `paused` | `canceling`), `navigation_ready`, `localization: "localized"`, and `active_map` metadata.
3. **Correlated RPC Request/Response (`/amr/workspace/request` ➔ `/amr/workspace/response`)**:
   - Handles `operation.start`, `operation.pause`, `operation.resume`, `operation.cancel`, and `navigation.home`.
   - Returns correlated response with matching `client_id`, `request_id`, `op`, and `ok: true`, `result: {"acknowledged": true}`.
   - Enforces emergency stop interlocking (rejects non-cancel operations while estop is active).
4. **Emergency Stop & Zero Velocity Safety Interlock (`/emergency_stop` & `/cmd_vel`)**:
   - Subscribes to `/emergency_stop` (`std_msgs/msg/Bool`).
   - Immediately publishes zero twist on `/cmd_vel` (`geometry_msgs/msg/Twist`) upon activation or cancel.
5. **Backwards Compatibility**:
   - Subscribes to `/mission_state_cmd` (`std_msgs/msg/String`) for legacy controllers (`START`, `PAUSE`, `RESUME`, `STOP`).

---

## 🚀 Execution & Verification

### Run Bridge Node
```bash
ros2 run amr_control_bridge amr_control_bridge_node
```

### Launch via Launch File
```bash
ros2 launch amr_control_bridge control_bridge.launch.py
```

### Run Unit Tests
```bash
PYTHONPATH=src/amr_control_bridge:src/amr_session pytest -v src/amr_control_bridge/test/
```

### CLI Verification
```bash
# Echo Session
ros2 topic echo /amr/session --once

# Echo State Heartbeat
ros2 topic echo /amr/workspace/state --once

# Test Start RPC
ros2 topic pub /amr/workspace/request std_msgs/msg/String \
  '{data: "{\"schema_version\":1,\"robot_id\":\"amr-1\",\"session_id\":\"test\",\"client_id\":\"cli-test\",\"request_id\":\"req-1\",\"op\":\"operation.start\",\"args\":{}}"}' --once

# Listen for Correlated Response
ros2 topic echo /amr/workspace/response --once
```
