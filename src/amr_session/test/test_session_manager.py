import os
import json
import time
import tempfile
import threading
import pytest
from amr_session.session_manager import (
    SessionManager,
    format_utc_iso8601_ms,
    check_clock_sync_status,
    ID_REGEX
)

def test_utc_iso8601_ms_format():
    t = 1790326970.123456
    s = format_utc_iso8601_ms(t)
    assert s.endswith('Z')
    assert '.' in s
    parts = s[:-1].split('.')
    assert len(parts) == 2
    assert len(parts[1]) == 3, f"Expected 3 digits, got {parts[1]}"

def test_id_regex():
    assert ID_REGEX.match("amr-1")
    assert ID_REGEX.match("amr_123")
    assert ID_REGEX.match("550e8400-e29b-41d4-a716-446655440000")
    assert not ID_REGEX.match("")
    assert not ID_REGEX.match("invalid space")
    assert not ID_REGEX.match("a" * 81)

def test_session_creation_and_idempotency():
    with tempfile.TemporaryDirectory() as tmpdir:
        sm = SessionManager(session_dir=tmpdir, robot_id="test-amr")
        sess1 = sm.get_or_create_session()
        assert sess1["schema_version"] == 1
        assert sess1["robot_id"] == "test-amr"
        assert sess1["state"] == "active"
        assert ID_REGEX.match(sess1["session_id"])
        
        # Second call in same boot must return exact same session
        sess2 = sm.get_or_create_session()
        assert sess1["session_id"] == sess2["session_id"]
        assert sess1["started_at"] == sess2["started_at"]

def test_simultaneous_startup_requests():
    with tempfile.TemporaryDirectory() as tmpdir:
        results = []
        def worker():
            sm = SessionManager(session_dir=tmpdir, robot_id="worker-amr")
            sess = sm.get_or_create_session()
            results.append(sess)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 10
        first_id = results[0]["session_id"]
        first_start = results[0]["started_at"]
        for r in results:
            assert r["session_id"] == first_id
            assert r["started_at"] == first_start

def test_next_boot_creates_new_session(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        import amr_session.session_manager as sm_mod
        
        monkeypatch.setattr(sm_mod, "get_boot_id", lambda: "boot-cycle-1")
        sm1 = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess1 = sm1.get_or_create_session()
        assert sess1["_boot_id"] == "boot-cycle-1"

        # Now reboot occurs
        monkeypatch.setattr(sm_mod, "get_boot_id", lambda: "boot-cycle-2")
        sm2 = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess2 = sm2.get_or_create_session()
        assert sess2["_boot_id"] == "boot-cycle-2"
        assert sess2["session_id"] != sess1["session_id"]

def test_repeated_wall_clock_timestamp(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        import amr_session.session_manager as sm_mod
        
        fixed_time = 1790000000.0
        monkeypatch.setattr(time, "time", lambda: fixed_time)

        monkeypatch.setattr(sm_mod, "get_boot_id", lambda: "boot-A")
        sm1 = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess1 = sm1.get_or_create_session()

        monkeypatch.setattr(sm_mod, "get_boot_id", lambda: "boot-B")
        sm2 = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess2 = sm2.get_or_create_session()

        assert sess1["started_at"] == sess2["started_at"]
        # But session_ids must be unique UUIDs!
        assert sess1["session_id"] != sess2["session_id"]

def test_clock_correction_immutability(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        import amr_session.session_manager as sm_mod
        
        current_time = 1790000000.0
        monkeypatch.setattr(time, "time", lambda: current_time)
        monkeypatch.setattr(sm_mod, "get_boot_id", lambda: "boot-same")

        sm = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess1 = sm.get_or_create_session()
        orig_started_at = sess1["started_at"]

        # NTP steps the clock forward by 10,000 seconds
        current_time += 10000.0
        sess2 = sm.get_or_create_session()
        assert sess2["started_at"] == orig_started_at
        assert sess2["session_id"] == sess1["session_id"]

def test_malformed_metadata_healing():
    with tempfile.TemporaryDirectory() as tmpdir:
        sess_file = os.path.join(tmpdir, "session.json")
        with open(sess_file, "w") as f:
            f.write("{invalid-json corrupt content")

        sm = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess = sm.get_or_create_session()
        assert sess["schema_version"] == 1
        assert sess["state"] == "active"
        assert ID_REGEX.match(sess["session_id"])

def test_orderly_shutdown_end_session():
    with tempfile.TemporaryDirectory() as tmpdir:
        sm = SessionManager(session_dir=tmpdir, robot_id="amr-1")
        sess = sm.get_or_create_session()
        orig_id = sess["session_id"]
        orig_start = sess["started_at"]

        ended = sm.end_session()
        assert ended["state"] == "ended"
        assert ended["session_id"] == orig_id
        assert ended["started_at"] == orig_start
        assert "_ended_at_utc" in ended

        payload = sm.get_client_payload(ended)
        assert payload["state"] == "ended"
        assert payload["session_id"] == orig_id
        assert payload["started_at"] == orig_start
