"""
test_server.py
==============
pytest + pytest-flask unit/integration tests for the Flask admin backend.

Run from the admin-dashboard root:
    python3 -m pytest server/tests/ -v

The tests import the Flask app from server/server.py directly and use
pytest-flask's `client` fixture for in-process HTTP calls — no real
network, no real hardware, no real processes needed.
"""

import os
import sys
import json
import subprocess
import types

import pytest

# ── Make sure server/ is importable ──────────────────────────────────────────
SERVER_DIR = os.path.join(os.path.dirname(__file__), "..")
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from server import app as flask_app  # noqa: E402


# ── pytest-flask fixtures ─────────────────────────────────────────────────────

@pytest.fixture
def app():
    flask_app.config["TESTING"] = True
    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


# ─────────────────────────────────────────────────────────────────────────────
# /api/system
# ─────────────────────────────────────────────────────────────────────────────

class TestApiSystem:

    def test_happy_path_returns_200(self, client):
        rv = client.get("/api/system")
        assert rv.status_code == 200

    def test_happy_path_json_shape(self, client):
        data = rv = client.get("/api/system").get_json()
        assert data["status"] == "ok"
        assert "cpu" in data
        assert "memory" in data
        assert "disk" in data
        assert "uptime_seconds" in data
        assert "hostname" in data
        assert "network" in data

    def test_cpu_fields_present(self, client):
        cpu = client.get("/api/system").get_json()["cpu"]
        assert "total_percent" in cpu
        assert "per_core" in cpu
        assert "cores_count" in cpu
        # temp_c may be None on machines without thermal sensors — that's OK
        assert "temp_c" in cpu

    def test_memory_fields_present(self, client):
        mem = client.get("/api/system").get_json()["memory"]
        for field in ("total_mb", "used_mb", "free_mb", "percent"):
            assert field in mem, f"Missing field: {field}"

    def test_disk_fields_present(self, client):
        disk = client.get("/api/system").get_json()["disk"]
        for field in ("total_gb", "used_gb", "free_gb", "percent"):
            assert field in disk, f"Missing field: {field}"

    def test_uptime_is_positive(self, client):
        data = client.get("/api/system").get_json()
        assert data["uptime_seconds"] >= 0

    def test_500_on_psutil_failure(self, client, monkeypatch):
        """When psutil.cpu_percent raises, the endpoint should return 500 + error JSON."""
        import psutil
        def boom(*a, **kw):
            raise RuntimeError("psutil exploded")
        monkeypatch.setattr(psutil, "cpu_percent", boom)

        rv = client.get("/api/system")
        assert rv.status_code == 500
        body = rv.get_json()
        assert body["status"] == "error"
        assert "psutil exploded" in body["message"]


# ─────────────────────────────────────────────────────────────────────────────
# /api/status
# ─────────────────────────────────────────────────────────────────────────────

class TestApiStatus:

    def test_returns_200(self, client):
        assert client.get("/api/status").status_code == 200

    def test_json_shape(self, client):
        data = client.get("/api/status").get_json()
        assert data["status"] == "ok"
        assert "hardware" in data
        assert "services" in data
        assert "managed_processes" in data

    def test_hardware_keys_present(self, client):
        hw = client.get("/api/status").get_json()["hardware"]
        assert "esp32" in hw
        assert "ydlidar" in hw
        assert "hiwonder_gps" in hw
        assert "hiwonder_imu" in hw

    def test_esp32_device_missing_when_path_absent(self, client, monkeypatch, tmp_path):
        """When ESP serial device paths do not exist, esp32.exists must be False."""
        import server
        # Patch os.path.exists so all esp paths return False
        real_exists = os.path.exists
        def fake_exists(p):
            if p in ("/dev/esp", "/dev/esp32", "/dev/amr_encoder", "/dev/ttyUSB2"):
                return False
            return real_exists(p)
        monkeypatch.setattr("server.os.path.exists", fake_exists)
        monkeypatch.setattr("server.os.access", lambda *a, **kw: False)

        data = client.get("/api/status").get_json()
        assert data["hardware"]["esp32"]["exists"] is False
        assert data["hardware"]["esp32"]["accessible"] is False

    def test_services_keys_present(self, client):
        svc = client.get("/api/status").get_json()["services"]
        assert "rosbridge_9090" in svc
        assert "web_video_server_8080" in svc

    def test_port_check_mocked_reachable(self, client, monkeypatch):
        """Monkeypatching check_port_reachable to return True."""
        import server
        monkeypatch.setattr(server, "check_port_reachable", lambda *a, **kw: True)
        data = client.get("/api/status").get_json()
        assert data["services"]["rosbridge_9090"] is True
        assert data["services"]["web_video_server_8080"] is True

    def test_port_check_mocked_unreachable(self, client, monkeypatch):
        import server
        monkeypatch.setattr(server, "check_port_reachable", lambda *a, **kw: False)
        data = client.get("/api/status").get_json()
        assert data["services"]["rosbridge_9090"] is False

    def test_managed_processes_dict_contains_expected_keys(self, client):
        procs = client.get("/api/status").get_json()["managed_processes"]
        expected = {"hybrid_manager", "gps_proc", "urdf_proc", "lidar_proc",
                    "odom_proc", "slam_proc", "rviz_proc", "camera_proc",
                    "imu_proc", "joint_state_proc", "rosbridge_proc"}
        assert expected.issubset(set(procs.keys()))

    def test_stopped_process_has_correct_defaults(self, client, monkeypatch):
        """If no matching process is found, running should be False and pid None."""
        import psutil
        # Return an empty process iterator
        monkeypatch.setattr(psutil, "process_iter", lambda fields: iter([]))
        procs = client.get("/api/status").get_json()["managed_processes"]
        for key, info in procs.items():
            assert info["running"] is False, f"{key}.running should be False"
            assert info["pid"] is None, f"{key}.pid should be None"


# ─────────────────────────────────────────────────────────────────────────────
# /api/process/restart
# ─────────────────────────────────────────────────────────────────────────────

class TestApiProcessRestart:

    def _post(self, client, body):
        return client.post(
            "/api/process/restart",
            data=json.dumps(body),
            content_type="application/json",
        )

    def test_missing_body_returns_400(self, client):
        rv = self._post(client, {})
        assert rv.status_code == 400
        assert rv.get_json()["status"] == "error"

    def test_unknown_process_name_returns_400(self, client):
        rv = self._post(client, {"process": "definitely_not_real"})
        assert rv.status_code == 400

    def test_valid_process_no_running_instances_returns_200(self, client, monkeypatch):
        """Valid process name but no matching system process → ok, killed_pids=[]"""
        import psutil
        monkeypatch.setattr(psutil, "process_iter", lambda fields: iter([]))
        rv = self._post(client, {"process": "hybrid_manager"})
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["status"] == "ok"
        assert body["killed_pids"] == []

    def test_valid_process_kills_matching_pid(self, client, monkeypatch):
        """Valid process name, matching fake process → killed_pids contains that PID."""
        import psutil

        fake_pid = 9999

        # Build a fake psutil.Process-like object
        class FakeProc:
            info = {
                "pid": fake_pid,
                "name": "python3",
                "cmdline": ["python3", "hybrid_manager.py"],
                "create_time": 0.0,
                "cpu_percent": 1.0,
                "memory_percent": 0.5,
            }
            def terminate(self):
                self._terminated = True

        monkeypatch.setattr(psutil, "process_iter", lambda fields: iter([FakeProc()]))
        rv = self._post(client, {"process": "hybrid_manager"})
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["status"] == "ok"
        assert fake_pid in body["killed_pids"]

    def test_error_during_kill_returns_500(self, client, monkeypatch):
        import psutil
        def boom(fields):
            raise RuntimeError("kill failed")
        monkeypatch.setattr(psutil, "process_iter", boom)
        rv = self._post(client, {"process": "lidar_proc"})
        assert rv.status_code == 500
        assert rv.get_json()["status"] == "error"


# ─────────────────────────────────────────────────────────────────────────────
# /api/stack/* and /api/camera/toggle
# ─────────────────────────────────────────────────────────────────────────────

class TestApiStackAndCamera:

    def test_start_stack(self, client, monkeypatch):
        class FakeSubprocess:
            pid = 1234
            def poll(self):
                return None

        monkeypatch.setattr("server.subprocess.Popen", lambda *a, **kw: FakeSubprocess())
        rv = client.post("/api/stack/start", json={"include_camera": False})
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["status"] == "ok"
        assert "launched successfully" in body["message"]

    def test_stop_stack(self, client, monkeypatch):
        import psutil
        monkeypatch.setattr(psutil, "process_iter", lambda fields: iter([]))
        rv = client.post("/api/stack/stop")
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["status"] == "ok"
        assert body["message"] == "Robot stack stopped."

    def test_toggle_camera_on_and_off(self, client, monkeypatch):
        class FakeSubprocess:
            pid = 5678
            def poll(self):
                return None

        monkeypatch.setattr("server.subprocess.Popen", lambda *a, **kw: FakeSubprocess())
        rv_on = client.post("/api/camera/toggle", json={"enable": True, "mode": "diagnostic"})
        assert rv_on.status_code == 200
        body = rv_on.get_json()
        assert body["status"] == "ok"
        assert body["mode"] == "diagnostic"
        assert body["active_topic"] == "/camera/color/image_raw"

        import psutil
        monkeypatch.setattr(psutil, "process_iter", lambda fields: iter([]))
        rv_off = client.post("/api/camera/toggle", json={"enable": False})
        assert rv_off.status_code == 200
        assert rv_off.get_json()["status"] == "ok"

    def test_camera_status_and_rescan(self, client, monkeypatch):
        import psutil
        monkeypatch.setattr(psutil, "process_iter", lambda fields: iter([]))
        rv_status = client.get("/api/camera/status")
        assert rv_status.status_code == 200
        st = rv_status.get_json()
        assert st["status"] == "ok"
        assert "hardware" in st
        assert "running" in st

        rv_rescan = client.post("/api/camera/rescan")
        assert rv_rescan.status_code == 200
        res = rv_rescan.get_json()
        assert res["status"] == "ok"
        assert "hardware" in res


# ─────────────────────────────────────────────────────────────────────────────
# /api/logs
# ─────────────────────────────────────────────────────────────────────────────

class TestApiLogs:

    def test_ros_source_no_log_dir_returns_fallback(self, client, monkeypatch):
        """When ~/.ros/log does not exist, a helpful message is returned."""
        monkeypatch.setattr("server.os.path.exists", lambda p: False)
        rv = client.get("/api/logs?source=ros&lines=50&filter=")
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["status"] == "ok"
        assert any("does not exist" in line or "~/.ros/log" in line
                   for line in data["lines"])

    def test_ros_source_no_log_files_found(self, client, monkeypatch, tmp_path):
        """~/.ros/log exists but contains no .log files → fallback message."""
        monkeypatch.setattr("server.os.path.exists", lambda p: True)
        monkeypatch.setattr("server.glob.glob", lambda *a, **kw: [])
        rv = client.get("/api/logs?source=ros&lines=50&filter=")
        data = rv.get_json()
        assert any("no ros log files" in line.lower() for line in data["lines"])

    def test_ros_source_reads_latest_log_file(self, client, monkeypatch, tmp_path):
        """When a log file exists, its last N lines are returned."""
        log_file = tmp_path / "out.log"
        log_file.write_text("\n".join(f"line {i}" for i in range(10)))

        monkeypatch.setattr("server.os.path.exists", lambda p: True)
        monkeypatch.setattr("server.glob.glob", lambda *a, **kw: [str(log_file)])
        monkeypatch.setattr("server.os.path.getmtime", lambda p: 0)

        rv = client.get("/api/logs?source=ros&lines=5&filter=")
        data = rv.get_json()
        assert data["status"] == "ok"
        assert len(data["lines"]) == 5  # last 5 of 10

    def test_journalctl_source_uses_subprocess(self, client, monkeypatch):
        """journalctl source must call subprocess.run and return stdout lines."""
        fake_result = types.SimpleNamespace(stdout="line a\nline b\nline c\n")
        monkeypatch.setattr(
            "server.subprocess.run",
            lambda *a, **kw: fake_result,
        )
        rv = client.get("/api/logs?source=journalctl&lines=3&filter=")
        data = rv.get_json()
        assert data["source"] == "journalctl"
        assert "line a" in data["lines"]

    def test_filter_keyword_applies(self, client, monkeypatch, tmp_path):
        """Lines not matching the filter keyword are excluded."""
        log_file = tmp_path / "out.log"
        log_file.write_text("error: bad thing\ninfo: all good\nerror: also bad\n")

        monkeypatch.setattr("server.os.path.exists", lambda p: True)
        monkeypatch.setattr("server.glob.glob", lambda *a, **kw: [str(log_file)])
        monkeypatch.setattr("server.os.path.getmtime", lambda p: 0)

        rv = client.get("/api/logs?source=ros&lines=100&filter=error")
        data = rv.get_json()
        assert all("error" in line.lower() for line in data["lines"])
        assert not any("info: all good" in line for line in data["lines"])

    def test_journalctl_subprocess_error_returns_fallback(self, client, monkeypatch):
        """If journalctl subprocess raises, the error is reported in the lines list."""
        def boom(*a, **kw):
            raise OSError("journalctl not found")
        monkeypatch.setattr("server.subprocess.run", boom)

        rv = client.get("/api/logs?source=journalctl&lines=10&filter=")
        data = rv.get_json()
        assert any("error" in line.lower() for line in data["lines"])

    def test_response_json_shape(self, client, monkeypatch):
        monkeypatch.setattr("server.os.path.exists", lambda p: False)
        data = client.get("/api/logs?source=ros&lines=50&filter=").get_json()
        assert "status" in data
        assert "source" in data
        assert "lines" in data
        assert isinstance(data["lines"], list)
