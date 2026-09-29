import json
import re
import pytest
from amr_control_bridge.amr_control_bridge_node import (
    AmrControlBridgeNode,
    SUPPORTED_CAPABILITIES,
    String,
    Bool,
    Twist
)

ID_REGEX = re.compile(r'^[a-zA-Z0-9_-]{1,80}$')


@pytest.fixture
def bridge_node():
    node = AmrControlBridgeNode()
    yield node
    node.destroy_node()


def test_initialization_and_session_contract(bridge_node):
    """Verify session payload matches the strict /amr/session schema."""
    assert ID_REGEX.match(bridge_node.robot_id)
    assert ID_REGEX.match(bridge_node.session_id)
    assert bridge_node.started_at.endswith("Z")

    # Capture published session msg
    published_session = []
    bridge_node.session_pub.publish = lambda m: published_session.append(m)

    bridge_node.publish_session()

    assert len(published_session) == 1
    data = json.loads(published_session[0].data)
    assert data["schema_version"] == 1
    assert data["robot_id"] == bridge_node.robot_id
    assert data["session_id"] == bridge_node.session_id
    assert data["started_at"] == bridge_node.started_at
    assert data["state"] == "active"


def test_workspace_state_heartbeat_contract(bridge_node):
    """Verify workspace state matches the strict /amr/workspace/state schema."""
    published_state = []
    bridge_node.state_pub.publish = lambda m: published_state.append(m)

    prev_seq = bridge_node.sequence
    bridge_node.publish_workspace_state()

    assert len(published_state) == 1
    state = json.loads(published_state[0].data)

    assert state["schema_version"] == 1
    assert state["robot_id"] == bridge_node.robot_id
    assert state["session_id"] == bridge_node.session_id
    assert state["sequence"] == prev_seq + 1
    assert state["environment"] in ["indoor", "outdoor"]
    for cap in [
        "operation.start", "operation.pause", "operation.resume", "operation.cancel",
        "navigation.home", "navigation.indoor", "navigation.outdoor", "operation.reconcile"
    ]:
        assert cap in state["capabilities"]
    assert state["operation"]["state"] in ["idle", "running", "paused", "canceling"]
    assert state["navigation_ready"] is True
    assert state["localization"] == "localized"
    assert "map_id" in state["active_map"]
    assert "revision" in state["active_map"]
    assert "package_sha256" in state["active_map"]
    assert "operation_id" in state["active_map"]
    assert isinstance(state["reconciled_request_ids"], list)


def test_operation_start_and_pause_and_resume(bridge_node):
    """Verify start -> pause -> resume lifecycle operations."""
    responses = []
    bridge_node.response_pub.publish = lambda m: responses.append(json.loads(m.data))

    # 1. Start operation
    start_req = String()
    start_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-start-001",
        "op": "operation.start",
        "args": {}
    })
    bridge_node.on_workspace_request(start_req)

    assert bridge_node.operation_state == "running"
    assert len(responses) == 1
    assert responses[-1]["ok"] is True
    assert responses[-1]["client_id"] == "client-123"
    assert responses[-1]["request_id"] == "req-start-001"
    assert responses[-1]["op"] == "operation.start"
    assert responses[-1]["result"]["acknowledged"] is True
    assert "req-start-001" in bridge_node.reconciled_request_ids

    # 2. Pause operation
    pause_req = String()
    pause_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-pause-002",
        "op": "operation.pause",
        "args": {}
    })
    bridge_node.on_workspace_request(pause_req)

    assert bridge_node.operation_state == "paused"
    assert len(responses) == 2
    assert responses[-1]["ok"] is True
    assert responses[-1]["request_id"] == "req-pause-002"
    assert responses[-1]["result"]["acknowledged"] is True

    # 3. Resume operation
    resume_req = String()
    resume_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-resume-003",
        "op": "operation.resume",
        "args": {}
    })
    bridge_node.on_workspace_request(resume_req)

    assert bridge_node.operation_state == "running"
    assert len(responses) == 3
    assert responses[-1]["ok"] is True
    assert responses[-1]["request_id"] == "req-resume-003"
    assert responses[-1]["result"]["acknowledged"] is True


def test_operation_cancel_and_home(bridge_node):
    """Verify STOP (operation.cancel) and RETURN HOME (navigation.home)."""
    responses = []
    cmd_vel_msgs = []
    bridge_node.response_pub.publish = lambda m: responses.append(json.loads(m.data))
    bridge_node.cmd_vel_pub.publish = lambda m: cmd_vel_msgs.append(m)

    # 1. Cancel operation (STOP)
    cancel_req = String()
    cancel_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-cancel-004",
        "op": "operation.cancel",
        "args": {}
    })
    bridge_node.on_workspace_request(cancel_req)

    assert bridge_node.operation_state == "idle"
    assert len(responses) == 1
    assert responses[-1]["ok"] is True
    assert responses[-1]["op"] == "operation.cancel"
    assert responses[-1]["result"]["acknowledged"] is True
    assert len(cmd_vel_msgs) == 1
    assert cmd_vel_msgs[-1].linear.x == 0.0
    assert cmd_vel_msgs[-1].angular.z == 0.0

    # 2. Return Home
    home_req = String()
    home_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-home-005",
        "op": "navigation.home",
        "args": {}
    })
    bridge_node.on_workspace_request(home_req)

    assert bridge_node.operation_state == "running"
    assert len(responses) == 2
    assert responses[-1]["ok"] is True
    assert responses[-1]["op"] == "navigation.home"
    assert responses[-1]["result"]["acknowledged"] is True


def test_emergency_stop_interlock(bridge_node):
    """Verify emergency stop interlock halts motion and rejects active operations."""
    responses = []
    cmd_vel_msgs = []
    bridge_node.response_pub.publish = lambda m: responses.append(json.loads(m.data))
    bridge_node.cmd_vel_pub.publish = lambda m: cmd_vel_msgs.append(m)

    # Trigger emergency stop
    estop_msg = Bool()
    estop_msg.data = True
    bridge_node.on_emergency_stop(estop_msg)

    assert bridge_node.is_emergency_stopped is True
    assert bridge_node.operation_state == "idle"
    assert len(cmd_vel_msgs) >= 1
    assert cmd_vel_msgs[-1].linear.x == 0.0

    # Attempt to start while in emergency stop
    start_req = String()
    start_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-blocked",
        "op": "operation.start",
        "args": {}
    })
    bridge_node.on_workspace_request(start_req)

    assert len(responses) == 1
    assert responses[-1]["ok"] is False
    assert "Emergency Stop" in responses[-1]["error"]
    assert bridge_node.operation_state == "idle"

    # Cancel (STOP) should succeed even during emergency stop
    cancel_req = String()
    cancel_req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-cancel-during-estop",
        "op": "operation.cancel",
        "args": {}
    })
    bridge_node.on_workspace_request(cancel_req)
    assert responses[-1]["ok"] is True

    # Clear emergency stop
    clear_msg = Bool()
    clear_msg.data = False
    bridge_node.on_emergency_stop(clear_msg)
    assert bridge_node.is_emergency_stopped is False


def test_unsupported_operation_rejection(bridge_node):
    """Verify unsupported operations are rejected with ok=False and error description."""
    responses = []
    bridge_node.response_pub.publish = lambda m: responses.append(json.loads(m.data))

    req = String()
    req.data = json.dumps({
        "schema_version": 1,
        "robot_id": bridge_node.robot_id,
        "session_id": bridge_node.session_id,
        "client_id": "client-123",
        "request_id": "req-invalid",
        "op": "nonexistent.command",
        "args": {}
    })
    bridge_node.on_workspace_request(req)

    assert len(responses) == 1
    assert responses[-1]["ok"] is False
    assert "Unsupported operation" in responses[-1]["error"]


def test_legacy_mission_cmd_fallback(bridge_node):
    """Verify legacy /mission_state_cmd commands translate correctly."""
    cmd = String()
    cmd.data = "START"
    bridge_node.on_legacy_mission_cmd(cmd)
    assert bridge_node.operation_state == "running"

    cmd.data = "PAUSE"
    bridge_node.on_legacy_mission_cmd(cmd)
    assert bridge_node.operation_state == "paused"

    cmd.data = "RESUME"
    bridge_node.on_legacy_mission_cmd(cmd)
    assert bridge_node.operation_state == "running"

    cmd.data = "STOP"
    bridge_node.on_legacy_mission_cmd(cmd)
    assert bridge_node.operation_state == "idle"
