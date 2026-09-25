#!/usr/bin/env python3
"""
session_manager.py — Authoritative AMR Power-Cycle Session Manager

Contracts:
- Generates identity on the robot before announcing it.
- Creates exactly one authoritative session for each AMR power-on cycle.
- Uses OS boot identity (/proc/sys/kernel/random/boot_id) as durable idempotency key.
- Persists session metadata atomically using atomic tempfile replacement and file locking (fcntl.flock).
- Started_at is immutable across NTP adjustments / clock steps.
- Formats started_at strictly as ISO 8601 UTC with exactly 3 fractional digits and trailing 'Z'.
- Validates identifiers against [a-zA-Z0-9_-]{1,80}.
- Inspects system clock synchronization state via adjtimex / timedatectl.
"""

import os
import sys
import json
import time
import uuid
import re
import fcntl
import socket
import datetime
import ctypes

ID_REGEX = re.compile(r'^[a-zA-Z0-9_-]{1,80}$')
SESSION_SCHEMA_VERSION = 1

# Default persistent session file location
# Try /var/lib/amr/session.json (if writable), fallback to /home/ubuntu/.amr/session.json or local dir
DEFAULT_SESSION_DIR = "/var/lib/amr"
FALLBACK_SESSION_DIR = os.path.expanduser("~/.amr")


def get_boot_id():
    """Read Linux kernel boot_id from /proc/sys/kernel/random/boot_id."""
    try:
        with open("/proc/sys/kernel/random/boot_id", "r") as f:
            return f.read().strip()
    except Exception as e:
        # Fallback to psutil boot time or machine-id if /proc is unreadable
        try:
            with open("/etc/machine-id", "r") as f:
                mid = f.read().strip()
                import psutil
                return f"{mid}-{int(psutil.boot_time())}"
        except Exception:
            return f"boot-{int(time.time())}"


def format_utc_iso8601_ms(epoch_timestamp_sec):
    """
    Format float epoch seconds as strict ISO 8601 UTC string:
    'YYYY-MM-DDTHH:MM:SS.sssZ' with exactly 3 fractional digits and trailing 'Z'.
    """
    dt = datetime.datetime.fromtimestamp(epoch_timestamp_sec, tz=datetime.timezone.utc)
    return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def check_clock_sync_status():
    """
    Query Linux kernel adjtimex for clock synchronization state and limitations.
    Returns a dict with sync status, estimated max error, and details.
    """
    res = {
        "synchronized": False,
        "method": "adjtimex",
        "max_error_sec": None,
        "status_code": None,
        "details": "Unknown"
    }
    try:
        class Timex(ctypes.Structure):
            _fields_ = [
                ('modes', ctypes.c_uint),
                ('offset', ctypes.c_long),
                ('freq', ctypes.c_long),
                ('maxerror', ctypes.c_long),
                ('esterror', ctypes.c_long),
                ('status', ctypes.c_int),
                ('constant', ctypes.c_long),
                ('precision', ctypes.c_long),
                ('tolerance', ctypes.c_long),
                ('time_sec', ctypes.c_long),
                ('time_usec', ctypes.c_long),
                ('tick', ctypes.c_long),
                ('ppsfreq', ctypes.c_long),
                ('jitter', ctypes.c_long),
                ('shift', ctypes.c_int),
                ('stabil', ctypes.c_long),
                ('jitcnt', ctypes.c_long),
                ('calcnt', ctypes.c_long),
                ('errcnt', ctypes.c_long),
                ('stbcnt', ctypes.c_long),
                ('tai', ctypes.c_int),
                ('padding', ctypes.c_int * 11)
            ]
        libc = ctypes.CDLL('libc.so.6')
        tx = Timex()
        state = libc.adjtimex(ctypes.byref(tx))
        # STA_UNSYNC is 0x0040
        is_unsync = bool(tx.status & 0x0040)
        max_error = tx.maxerror / 1000000.0  # in seconds
        res["synchronized"] = not is_unsync and (state != 5) # TIME_BAD = 5
        res["status_code"] = state
        res["max_error_sec"] = max_error
        res["details"] = (
            f"adjtimex state={state}, STA_UNSYNC={is_unsync}, maxerror={max_error:.4f}s"
            if not is_unsync else "Clock not synchronized (STA_UNSYNC bit active)"
        )
    except Exception as e:
        res["details"] = f"adjtimex inspection error: {e}"

    return res


class SessionManager:
    """
    Manages session lifecycle for the AMR robot.
    Guarantees:
    - Atomicity across simultaneous startup requests using file locks.
    - Idempotency within the same boot cycle.
    - Durable state persistence.
    """

    def __init__(self, session_dir=None, robot_id=None):
        self.session_dir = self._resolve_session_dir(session_dir)
        os.makedirs(self.session_dir, exist_ok=True)
        self.session_file = os.path.join(self.session_dir, "session.json")
        self.lock_file = os.path.join(self.session_dir, "session.lock")
        
        # Robot ID resolution: env var > parameter > config file > hostname > default
        resolved_robot_id = robot_id or os.environ.get("AMR_ROBOT_ID")
        if not resolved_robot_id:
            cfg_path = os.path.join(self.session_dir, "robot_id")
            if os.path.exists(cfg_path):
                try:
                    with open(cfg_path, "r") as f:
                        resolved_robot_id = f.read().strip()
                except Exception:
                    pass
        if not resolved_robot_id:
            resolved_robot_id = socket.gethostname().split('.')[0]
        
        # Sanitize robot_id to conform to [a-zA-Z0-9_-]{1,80}
        resolved_robot_id = re.sub(r'[^a-zA-Z0-9_-]', '_', resolved_robot_id)[:80]
        if not resolved_robot_id or not ID_REGEX.match(resolved_robot_id):
            resolved_robot_id = "amr-1"
        self.robot_id = resolved_robot_id

    def _resolve_session_dir(self, requested_dir):
        if requested_dir:
            return requested_dir
        # Try /var/lib/amr first
        if os.path.exists(DEFAULT_SESSION_DIR) and os.access(DEFAULT_SESSION_DIR, os.W_OK):
            return DEFAULT_SESSION_DIR
        try:
            os.makedirs(DEFAULT_SESSION_DIR, exist_ok=True)
            if os.access(DEFAULT_SESSION_DIR, os.W_OK):
                return DEFAULT_SESSION_DIR
        except Exception:
            pass
        return FALLBACK_SESSION_DIR

    def get_or_create_session(self):
        """
        Idempotently returns the session for the current power-on cycle.
        If a valid session matching current boot_id exists and is active, returns it.
        Otherwise creates a new active session atomically.
        """
        current_boot_id = get_boot_id()

        # Open lock file for exclusive coordination
        with open(self.lock_file, "a+") as lf:
            fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
            try:
                # 1. Inspect existing session
                if os.path.exists(self.session_file):
                    try:
                        with open(self.session_file, "r") as f:
                            data = json.load(f)
                        if self._is_valid_active_session_for_boot(data, current_boot_id):
                            return data
                    except Exception:
                        pass # Corrupted or invalid; will regenerate below

                # 2. Need a new session for this boot cycle
                clock_sync = check_clock_sync_status()
                now_epoch = time.time()
                session_id = str(uuid.uuid4())
                started_at_iso = format_utc_iso8601_ms(now_epoch)

                session_data = {
                    "schema_version": SESSION_SCHEMA_VERSION,
                    "robot_id": self.robot_id,
                    "session_id": session_id,
                    "started_at": started_at_iso,
                    "state": "active",
                    # Internal metadata for auditing and durable boot binding
                    "_boot_id": current_boot_id,
                    "_started_at_epoch": now_epoch,
                    "_clock_sync_on_start": clock_sync,
                    "_created_at_utc": started_at_iso
                }

                self._atomic_save(session_data)
                return session_data
            finally:
                fcntl.flock(lf.fileno(), fcntl.LOCK_UN)

    def _is_valid_active_session_for_boot(self, data, current_boot_id):
        """Validates that loaded session dictionary is well-formed, active, and matches current boot."""
        if not isinstance(data, dict):
            return False
        if data.get("schema_version") != SESSION_SCHEMA_VERSION:
            return False
        if data.get("state") != "active":
            return False
        if data.get("_boot_id") != current_boot_id:
            return False
        if not data.get("session_id") or not ID_REGEX.match(data["session_id"]):
            return False
        if not data.get("robot_id") or not ID_REGEX.match(data["robot_id"]):
            return False
        if not data.get("started_at") or not isinstance(data["started_at"], str):
            return False
        return True

    def _atomic_save(self, session_data):
        """Atomically writes session JSON by writing to a temporary file then renaming."""
        tmp_file = f"{self.session_file}.tmp.{os.getpid()}"
        with open(tmp_file, "w") as f:
            json.dump(session_data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_file, self.session_file)

    def end_session(self):
        """
        Transitions the current session to 'ended' upon orderly shutdown.
        Preserves original session identity, robot_id, and started_at.
        """
        current_boot_id = get_boot_id()
        with open(self.lock_file, "a+") as lf:
            fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
            try:
                session_data = None
                if os.path.exists(self.session_file):
                    try:
                        with open(self.session_file, "r") as f:
                            session_data = json.load(f)
                    except Exception:
                        pass
                
                if not session_data or session_data.get("_boot_id") != current_boot_id:
                    session_data = self.get_or_create_session()

                session_data["state"] = "ended"
                session_data["_ended_at_utc"] = format_utc_iso8601_ms(time.time())
                self._atomic_save(session_data)
                return session_data
            finally:
                fcntl.flock(lf.fileno(), fcntl.LOCK_UN)

    def get_client_payload(self, session_data=None):
        """
        Formats session_data strictly according to the client session contract:
        {
          "schema_version": 1,
          "robot_id": "...",
          "session_id": "...",
          "started_at": "...",
          "state": "active" | "ended"
        }
        """
        if session_data is None:
            session_data = self.get_or_create_session()
        
        return {
            "schema_version": int(session_data.get("schema_version", SESSION_SCHEMA_VERSION)),
            "robot_id": str(session_data["robot_id"]),
            "session_id": str(session_data["session_id"]),
            "started_at": str(session_data["started_at"]),
            "state": str(session_data["state"])
        }


# Singleton accessor
_manager_instance = None

def get_authoritative_session():
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = SessionManager()
    return _manager_instance.get_or_create_session()

def get_session_manager(session_dir=None, robot_id=None):
    global _manager_instance
    if _manager_instance is None or session_dir is not None:
        _manager_instance = SessionManager(session_dir=session_dir, robot_id=robot_id)
    return _manager_instance
