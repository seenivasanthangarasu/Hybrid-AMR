#!/usr/bin/env python3
import os
import sys
import time
import socket
import glob
import subprocess
from flask import Flask, jsonify, request
from flask_cors import CORS
import psutil
import signal

# Import Authoritative AMR Session Manager
WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AMR_SESSION_PKG = os.path.join(WORKSPACE_ROOT, "src", "amr_session")
if AMR_SESSION_PKG not in sys.path:
    sys.path.insert(0, AMR_SESSION_PKG)

try:
    from amr_session.session_manager import get_session_manager, check_clock_sync_status
except ImportError:
    try:
        from src.amr_session.amr_session.session_manager import get_session_manager, check_clock_sync_status
    except ImportError:
        get_session_manager = None
        check_clock_sync_status = lambda: {"synchronized": False, "details": "amr_session package not loaded"}

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

PORT = int(os.environ.get("ADMIN_BACKEND_PORT", 5001))

MANAGED_PROCESS_PATTERNS = {
    "session_proc": ["amr_session_publisher", "session_publisher", "session_publisher.py"],
    "hybrid_manager": ["hybrid_manager.py", "hybrid_navigation"],
    "gps_proc": ["hiwonder_gps_node", "hiwonder_gps", "gps_node", "ublox_gps_node", "ublox_gps"],
    "urdf_proc": ["robot_state_publisher"],
    "joint_state_proc": ["joint_state_publisher"],
    "lidar_proc": ["ydlidar_ros2_driver", "ydlidar_ros2_driver_node"],
    "odom_proc": ["esp32_odom", "odom_node", "arrow_teleop"],
    "imu_proc": ["hiwonder_imu_node", "hiwonder_imu", "imu_serial_node", "imu_node"],
    "slam_proc": ["slam_toolbox", "localization_slam_toolbox_node", "async_slam_toolbox_node"],
    "rviz_proc": ["rviz2"],
    "camera_proc": [
        "realsense2_camera_node", "realsense2_camera", "rs_launch",
        "v4l2_camera_node", "v4l2_camera",
        "camera_streamer.py", "camera_streamer_node",
        "depth_colorizer.py",
        "diagnostic_cam.py", "diagnostic_camera_node"
    ],
    "video_server_proc": ["web_video_server"],
    "rosbridge_proc": ["rosbridge_websocket"],
    "radio_proc": ["radio_receiver_node", "radio_receiver"],
    "sabertooth_proc": ["sabertooth_node", "sabertooth_driver"],
}

def check_port_reachable(host="127.0.0.1", port=9090, timeout=1.0):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False

def get_cpu_temp():
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for name, entries in temps.items():
                for entry in entries:
                    if entry.current is not None:
                        return round(entry.current, 1)
    except Exception:
        pass
    
    # Fallback to sysfs thermal zone
    try:
        if os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
            with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                temp_raw = f.read().strip()
                return round(float(temp_raw) / 1000.0, 1)
    except Exception:
        pass
    return None

def get_network_interfaces():
    interfaces = []
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        io_counters = psutil.net_io_counters(pernic=True)
        
        for name, addr_list in addrs.items():
            if name == "lo":
                continue
            ip = None
            mac = None
            for addr in addr_list:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                elif addr.family == getattr(psutil, 'AF_LINK', socket.AF_PACKET):
                    mac = addr.address
            
            stat = stats.get(name)
            io = io_counters.get(name)
            
            interfaces.append({
                "name": name,
                "ip": ip or "Disconnected",
                "mac": mac or "N/A",
                "is_up": stat.isup if stat else False,
                "speed_mbps": stat.speed if stat else 0,
                "bytes_sent": io.bytes_sent if io else 0,
                "bytes_recv": io.bytes_recv if io else 0
            })
    except Exception as e:
        print(f"Error fetching net interfaces: {e}")
    return interfaces

_battery_cache = {
    "voltage": None,
    "current": None,
    "temp": None,
    "timestamp": 0.0
}

def get_motor_driver_battery():
    global _battery_cache
    now = time.time()
    if now - _battery_cache["timestamp"] < 1.5 and _battery_cache["voltage"] is not None:
        return _battery_cache

    # If Sabertooth ROS driver is running, avoid direct serial access to prevent DTR reset & motor jerks
    try:
        for p in psutil.process_iter(['name', 'cmdline']):
            try:
                cmd_str = " ".join(p.info['cmdline'] or [])
                if "sabertooth_node" in cmd_str or "sabertooth_driver" in cmd_str:
                    return _battery_cache
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass

    candidate_ports = ["/dev/sabertooth", "/dev/amr_motors", "/dev/ttyACM0"]
    port_to_use = None
    for p in candidate_ports:
        if os.path.exists(p) and os.access(p, os.R_OK | os.W_OK):
            port_to_use = p
            break

    if not port_to_use:
        return _battery_cache

    try:
        import serial
        import re
        with serial.Serial(port_to_use, 115200, timeout=0.1) as s:
            s.write(b"M1: getb\r\n")
            time.sleep(0.04)
            raw = s.read_all().decode('ascii', errors='ignore')
            m = re.search(r'(?:M\d+:)?B\s*([+-]?\d+)', raw, re.IGNORECASE)
            if m:
                v = round(int(m.group(1)) / 10.0, 1)
                _battery_cache["voltage"] = v
                _battery_cache["timestamp"] = now
    except Exception:
        pass
    return _battery_cache

@app.route("/api/system", methods=["GET"])
def get_system_metrics():
    try:
        # Call cpu_percent once; per-core requires percpu=True on the same call.
        # First call with interval=None uses time since last call (or 0.0 on first invocation).
        # We call with percpu=True to get both total and per-core in one shot.
        per_core_list = psutil.cpu_percent(interval=None, percpu=True)
        cpu_total = round(sum(per_core_list) / len(per_core_list), 1) if per_core_list else 0.0
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        bat_info = get_motor_driver_battery()
        
        uptime_seconds = 0
        try:
            with open("/proc/uptime", "r") as f:
                uptime_seconds = float(f.readline().split()[0])
        except Exception:
            uptime_seconds = time.time() - psutil.boot_time()

        return jsonify({
            "status": "ok",
            "timestamp": time.time(),
            "cpu": {
                "total_percent": cpu_total,
                "per_core": per_core_list,
                "temp_c": get_cpu_temp(),
                "cores_count": psutil.cpu_count(logical=True)
            },
            "memory": {
                "total_mb": round(mem.total / (1024 * 1024), 1),
                "used_mb": round(mem.used / (1024 * 1024), 1),
                "free_mb": round(mem.available / (1024 * 1024), 1),
                "percent": mem.percent
            },
            "disk": {
                "total_gb": round(disk.total / (1024 ** 3), 1),
                "used_gb": round(disk.used / (1024 ** 3), 1),
                "free_gb": round(disk.free / (1024 ** 3), 1),
                "percent": disk.percent
            },
            "battery": {
                "voltage": bat_info.get("voltage"),
                "unit": "V",
                "present": (bat_info.get("voltage") is not None)
            },
            "uptime_seconds": round(uptime_seconds),
            "hostname": socket.gethostname(),
            "network": get_network_interfaces()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

def detect_camera_hardware():
    realsense_found = False
    realsense_name = "Intel RealSense"
    for path in glob.glob("/sys/bus/usb/devices/*"):
        try:
            vendor_file = os.path.join(path, "idVendor")
            if os.path.exists(vendor_file):
                with open(vendor_file, "r") as f:
                    if f.read().strip().lower() == "8086":
                        realsense_found = True
                        prod_file = os.path.join(path, "product")
                        if os.path.exists(prod_file):
                            with open(prod_file, "r") as pf:
                                realsense_name = pf.read().strip() or "Intel RealSense"
                        break
        except Exception:
            pass

    v4l2_devices = []
    # Check persistent symlinks first
    for sym in ["/dev/amr_camera", "/dev/logi_cam", "/dev/video_cam"]:
        if os.path.exists(sym) and sym not in v4l2_devices:
            v4l2_devices.append(sym)

    for dev in sorted(glob.glob("/dev/video*")):
        base = os.path.basename(dev)
        if base in ["video32", "video33"]:
            continue
        if os.path.exists(dev) and dev not in v4l2_devices:
            v4l2_devices.append(dev)

    logitech_found = False
    logitech_name = "Logitech C270 HD Webcam"
    for dev in v4l2_devices:
        target = os.path.realpath(dev) if os.path.islink(dev) else dev
        base = os.path.basename(target)
        name_path = f"/sys/class/video4linux/{base}/name"
        if os.path.exists(name_path):
            try:
                with open(name_path) as f:
                    name_str = f.read().strip()
                    if "C270" in name_str or "Logitech" in name_str:
                        logitech_found = True
                        logitech_name = f"Logitech {name_str} (720p HD)"
                        break
            except Exception:
                pass

    if realsense_found:
        hw_type = "realsense"
        label = f"{realsense_name} (USB 3D Camera)"
    elif logitech_found:
        hw_type = "v4l2"
        dev_label = v4l2_devices[0] if v4l2_devices else "/dev/video0"
        label = f"{logitech_name} ({dev_label})"
    elif v4l2_devices:
        hw_type = "v4l2"
        label = f"V4L2 USB Camera ({v4l2_devices[0]})"
    else:
        hw_type = "diagnostic"
        label = "Diagnostic Pro-Max HUD Streamer"

    return {
        "realsense": realsense_found,
        "realsense_name": realsense_name if realsense_found else None,
        "logitech": logitech_found,
        "logitech_name": logitech_name if logitech_found else None,
        "v4l2_devices": v4l2_devices,
        "type": hw_type,
        "label": label,
        "physical_camera_connected": (realsense_found or len(v4l2_devices) > 0)
    }

@app.route("/api/status", methods=["GET"])
def get_hardware_and_processes():
    # 1. Serial device status
    def check_dev_path(*paths):
        for p in paths:
            if os.path.exists(p):
                return {
                    "path": p,
                    "exists": True,
                    "accessible": os.access(p, os.R_OK | os.W_OK)
                }
        return {
            "path": paths[0],
            "exists": False,
            "accessible": False
        }

    hw_esp = check_dev_path("/dev/ttyACM1", "/dev/esp", "/dev/amr_encoder", "/dev/ttyUSB2", "/dev/esp32")
    hw_lidar = check_dev_path("/dev/amr_lidar", "/dev/ttyUSB1", "/dev/ttyUSB3", "/dev/ttyUSB4", "/dev/lidar", "/dev/ydlidar")
    hw_gps = check_dev_path("/dev/hiwonder_gps", "/dev/amr_gps", "/dev/gps", "/dev/ttyUSB0")
    hw_imu = check_dev_path("/dev/hiwonder_imu", "/dev/amr_imu", "/dev/esp-imu", "/dev/ttyUSB1")
    hw_sabertooth = check_dev_path("/dev/sabertooth", "/dev/amr_motors", "/dev/ttyACM0")
    hw_radio = {
        "path": "GPIO8 (CH1) & GPIO24 (CH2)",
        "exists": os.path.exists("/dev/gpiochip4"),
        "accessible": os.access("/dev/gpiochip4", os.R_OK | os.W_OK) if os.path.exists("/dev/gpiochip4") else False
    }
    hw_camera = detect_camera_hardware()
    
    # 2. Port reachability
    rosbridge_reachable = check_port_reachable("127.0.0.1", 9090)
    video_server_reachable = check_port_reachable("127.0.0.1", 8080)
    
    # 3. Process introspection
    processes_info = {}
    for proc_key, patterns in MANAGED_PROCESS_PATTERNS.items():
        processes_info[proc_key] = {
            "name": proc_key,
            "patterns": patterns,
            "running": False,
            "pid": None,
            "cpu_percent": 0.0,
            "memory_percent": 0.0,
            "uptime_seconds": None
        }

    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time', 'cpu_percent', 'memory_percent']):
            try:
                cmdline_str = " ".join(p.info['cmdline'] or [])
                pname = p.info['name'] or ""
                full_str = f"{pname} {cmdline_str}"
                
                for proc_key, patterns in MANAGED_PROCESS_PATTERNS.items():
                    if not processes_info[proc_key]["running"]:
                        for pat in patterns:
                            if pat in full_str:
                                processes_info[proc_key]["running"] = True
                                processes_info[proc_key]["pid"] = p.info['pid']
                                processes_info[proc_key]["cpu_percent"] = round(p.info['cpu_percent'] or 0.0, 1)
                                processes_info[proc_key]["memory_percent"] = round(p.info['memory_percent'] or 0.0, 1)
                                if p.info['create_time']:
                                    processes_info[proc_key]["uptime_seconds"] = round(time.time() - p.info['create_time'])
                                break
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except Exception as e:
        print(f"Error inspecting processes: {e}")

    bat_info = get_motor_driver_battery()
    hw_sabertooth["battery_voltage"] = bat_info.get("voltage")

    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "hardware": {
            "esp32": hw_esp,
            "ydlidar": hw_lidar,
            "hiwonder_gps": hw_gps,
            "hiwonder_imu": hw_imu,
            "sabertooth": hw_sabertooth,
            "radio": hw_radio,
            "camera": hw_camera
        },
        "battery": {
            "voltage": bat_info.get("voltage"),
            "unit": "V",
            "present": (bat_info.get("voltage") is not None),
            "timestamp": bat_info.get("timestamp")
        },
        "session": (get_session_manager().get_or_create_session() if get_session_manager else None),
        "clock_sync": check_clock_sync_status(),
        "services": {
            "rosbridge_9090": rosbridge_reachable,
            "web_video_server_8080": video_server_reachable
        },
        "managed_processes": processes_info
    })

@app.route("/api/session", methods=["GET"])
def get_session_endpoint():
    try:
        if get_session_manager is None:
            return jsonify({"status": "error", "message": "amr_session manager not available"}), 500
        sm = get_session_manager()
        session_data = sm.get_or_create_session()
        payload = sm.get_client_payload(session_data)
        clock_status = check_clock_sync_status()
        return jsonify({
            "status": "ok",
            "session": payload,
            "internal_metadata": {
                "boot_id": session_data.get("_boot_id"),
                "started_at_epoch": session_data.get("_started_at_epoch"),
                "clock_sync": clock_status,
                "session_file": sm.session_file
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/battery", methods=["GET"])
def get_battery_telemetry_endpoint():
    bat_info = get_motor_driver_battery()
    return jsonify({
        "status": "ok",
        "voltage": bat_info.get("voltage"),
        "unit": "V",
        "present": (bat_info.get("voltage") is not None),
        "timestamp": bat_info.get("timestamp") or time.time()
    })

@app.route("/api/process/restart", methods=["POST"])
def restart_managed_process():
    data = request.json or {}
    proc_name = data.get("process")
    if not proc_name or proc_name not in MANAGED_PROCESS_PATTERNS:
        return jsonify({"status": "error", "message": f"Invalid process name: {proc_name}"}), 400

    patterns = MANAGED_PROCESS_PATTERNS[proc_name]
    killed_pids = []

    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline_str = " ".join(p.info['cmdline'] or [])
                pname = p.info['name'] or ""
                full_str = f"{pname} {cmdline_str}"
                for pat in patterns:
                    if pat in full_str:
                        pid = p.info['pid']
                        p.terminate()
                        killed_pids.append(pid)
                        break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        # If killing hybrid_manager, give feedback
        return jsonify({
            "status": "ok",
            "message": f"Process restart signal sent for {proc_name}.",
            "killed_pids": killed_pids
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

GLOBAL_STACK_PROC = None
GLOBAL_CAMERA_PROC = None
GLOBAL_TELEOP_PROC = None
GLOBAL_MOTOR_PROC = None
GLOBAL_RADIO_PROC = None

BRINGUP_LOG_FILE = "/tmp/robot_bringup.log"

@app.route("/api/stack/start", methods=["POST"])
def start_robot_stack():
    global GLOBAL_STACK_PROC
    data = request.json or {}
    include_camera = data.get("include_camera", False)
    include_motors = data.get("include_motors", False)
    include_radio = data.get("include_radio", False)
    include_manual_drive = data.get("include_manual_drive", True)

    if GLOBAL_STACK_PROC and GLOBAL_STACK_PROC.poll() is None:
        return jsonify({
            "status": "ok",
            "message": "Robot stack is already running.",
            "pid": GLOBAL_STACK_PROC.pid
        })

    cmd_str = (
        "export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml && "
        "export RMW_IMPLEMENTATION=rmw_fastrtps_cpp && "
        "export ROS_LOG_DIR=/tmp/ros_log && "
        "source /opt/ros/jazzy/setup.bash && "
        "source /home/ubuntu/Desktop/Xtrmbly/install/setup.bash && "
        f"ros2 launch rock_bringup navigation.launch.py "
        f"start_camera:={'true' if include_camera else 'false'} "
        f"start_manual_drive:={'true' if include_manual_drive else 'false'} "
        f"start_motors:={'true' if include_motors else 'false'} "
        f"start_radio:={'true' if include_radio else 'false'}"
    )

    try:
        # Clear/open log file
        log_out = open(BRINGUP_LOG_FILE, "w", buffering=1)
        GLOBAL_STACK_PROC = subprocess.Popen(
            ["/bin/bash", "-c", cmd_str],
            stdout=log_out,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )
        return jsonify({
            "status": "ok",
            "message": f"Robot stack launched successfully (camera={'on' if include_camera else 'off'}, manual_drive={'on' if include_manual_drive else 'off'}).",
            "pid": GLOBAL_STACK_PROC.pid
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

TELEOP_LOG_FILE = "/tmp/teleop_bringup.log"

@app.route("/api/teleop/toggle", methods=["POST"])
def toggle_teleop_stack():
    global GLOBAL_TELEOP_PROC, GLOBAL_MOTOR_PROC, GLOBAL_RADIO_PROC
    data = request.json or {}
    enable = data.get("enable", True)

    if not enable:
        killed = []
        for proc_ref_name in ["GLOBAL_TELEOP_PROC", "GLOBAL_MOTOR_PROC", "GLOBAL_RADIO_PROC"]:
            proc_obj = globals().get(proc_ref_name)
            if proc_obj and proc_obj.poll() is None:
                try:
                    pgid = os.getpgid(proc_obj.pid)
                    os.killpg(pgid, signal.SIGINT)
                    time.sleep(0.3)
                    os.killpg(pgid, signal.SIGTERM)
                    time.sleep(0.1)
                    os.killpg(pgid, signal.SIGKILL)
                    killed.append(proc_obj.pid)
                except Exception:
                    try:
                        proc_obj.kill()
                        killed.append(proc_obj.pid)
                    except Exception:
                        pass
                globals()[proc_ref_name] = None

        for pat in ["radio_receiver_node", "radio_receiver", "sabertooth_node", "sabertooth_driver", "manual_radio_drive"]:
            for p in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline_str = " ".join(p.info['cmdline'] or [])
                    pname = p.info['name'] or ""
                    full_str = f"{pname} {cmdline_str}"
                    if pat in full_str and p.pid != os.getpid():
                        p.terminate()
                        killed.append(p.info['pid'])
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

        return jsonify({
            "status": "ok",
            "message": "Radio teleop drive & motor controller stopped.",
            "running": False,
            "killed_pids": list(set(killed))
        })

    # Check if already running
    if GLOBAL_TELEOP_PROC and GLOBAL_TELEOP_PROC.poll() is None:
        return jsonify({
            "status": "ok",
            "message": "Radio teleop drive is already running.",
            "running": True,
            "pid": GLOBAL_TELEOP_PROC.pid
        })

    cmd_str = (
        "export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml && "
        "export RMW_IMPLEMENTATION=rmw_fastrtps_cpp && "
        "export ROS_LOG_DIR=/tmp/ros_log && "
        "source /opt/ros/jazzy/setup.bash && "
        "source /home/ubuntu/Desktop/Xtrmbly/install/setup.bash && "
        "ros2 launch sabertooth_driver manual_radio_drive.launch.py"
    )

    try:
        teleop_log_out = open(TELEOP_LOG_FILE, "a", buffering=1)
        GLOBAL_TELEOP_PROC = subprocess.Popen(
            ["/bin/bash", "-c", cmd_str],
            stdout=teleop_log_out,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )
        return jsonify({
            "status": "ok",
            "message": "HOT RC Radio Controller & Sabertooth Motor Driver launched.",
            "running": True,
            "pid": GLOBAL_TELEOP_PROC.pid
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/motor/toggle", methods=["POST"])
def toggle_motor_node():
    global GLOBAL_MOTOR_PROC
    data = request.json or {}
    enable = data.get("enable", True)

    if not enable:
        killed = []
        if GLOBAL_MOTOR_PROC and GLOBAL_MOTOR_PROC.poll() is None:
            try:
                pgid = os.getpgid(GLOBAL_MOTOR_PROC.pid)
                os.killpg(pgid, signal.SIGINT)
                time.sleep(0.3)
                os.killpg(pgid, signal.SIGTERM)
                killed.append(GLOBAL_MOTOR_PROC.pid)
            except Exception:
                try:
                    GLOBAL_MOTOR_PROC.kill()
                except Exception:
                    pass
            GLOBAL_MOTOR_PROC = None

        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline_str = " ".join(p.info['cmdline'] or [])
                if "sabertooth_node" in cmdline_str:
                    p.terminate()
                    killed.append(p.info['pid'])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        return jsonify({"status": "ok", "message": "Sabertooth motor driver stopped.", "running": False, "killed_pids": killed})

    if GLOBAL_MOTOR_PROC and GLOBAL_MOTOR_PROC.poll() is None:
        return jsonify({"status": "ok", "message": "Motor driver is already running.", "running": True, "pid": GLOBAL_MOTOR_PROC.pid})

    cmd_str = (
        "export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml && "
        "export RMW_IMPLEMENTATION=rmw_fastrtps_cpp && "
        "source /opt/ros/jazzy/setup.bash && "
        "source /home/ubuntu/Desktop/Xtrmbly/install/setup.bash && "
        "ros2 launch sabertooth_driver sabertooth.launch.py"
    )
    try:
        GLOBAL_MOTOR_PROC = subprocess.Popen(
            ["/bin/bash", "-c", cmd_str],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )
        return jsonify({"status": "ok", "message": "Sabertooth motor driver launched.", "running": True, "pid": GLOBAL_MOTOR_PROC.pid})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/radio/toggle", methods=["POST"])
def toggle_radio_node():
    global GLOBAL_RADIO_PROC
    data = request.json or {}
    enable = data.get("enable", True)

    if not enable:
        killed = []
        if GLOBAL_RADIO_PROC and GLOBAL_RADIO_PROC.poll() is None:
            try:
                pgid = os.getpgid(GLOBAL_RADIO_PROC.pid)
                os.killpg(pgid, signal.SIGINT)
                time.sleep(0.3)
                os.killpg(pgid, signal.SIGTERM)
                killed.append(GLOBAL_RADIO_PROC.pid)
            except Exception:
                try:
                    GLOBAL_RADIO_PROC.kill()
                except Exception:
                    pass
            GLOBAL_RADIO_PROC = None

        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline_str = " ".join(p.info['cmdline'] or [])
                if "radio_receiver_node" in cmdline_str:
                    p.terminate()
                    killed.append(p.info['pid'])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        return jsonify({"status": "ok", "message": "Radio receiver stopped.", "running": False, "killed_pids": killed})

    if GLOBAL_RADIO_PROC and GLOBAL_RADIO_PROC.poll() is None:
        return jsonify({"status": "ok", "message": "Radio receiver is already running.", "running": True, "pid": GLOBAL_RADIO_PROC.pid})

    cmd_str = (
        "export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml && "
        "export RMW_IMPLEMENTATION=rmw_fastrtps_cpp && "
        "source /opt/ros/jazzy/setup.bash && "
        "source /home/ubuntu/Desktop/Xtrmbly/install/setup.bash && "
        "ros2 launch radio_receiver radio_receiver.launch.py"
    )
    try:
        GLOBAL_RADIO_PROC = subprocess.Popen(
            ["/bin/bash", "-c", cmd_str],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )
        return jsonify({"status": "ok", "message": "HOT RC Radio Receiver launched.", "running": True, "pid": GLOBAL_RADIO_PROC.pid})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/stack/logs", methods=["GET"])
def get_stack_logs():
    lines_count = int(request.args.get("lines", 100))
    if os.path.exists(BRINGUP_LOG_FILE):
        try:
            with open(BRINGUP_LOG_FILE, "r", errors="ignore") as f:
                all_lines = f.readlines()
                return jsonify({
                    "status": "ok",
                    "lines": [l.rstrip("\r\n") for l in all_lines[-lines_count:]]
                })
        except Exception as e:
            return jsonify({"status": "error", "message": str(e), "lines": []}), 500
    return jsonify({"status": "ok", "lines": ["[No bringup logs recorded yet]"]})

@app.route("/api/stack/stop", methods=["POST"])
def stop_robot_stack():
    global GLOBAL_STACK_PROC, GLOBAL_CAMERA_PROC, GLOBAL_TELEOP_PROC, GLOBAL_MOTOR_PROC, GLOBAL_RADIO_PROC
    killed_pids = []

    # 1. Stop main stack process group with gentle SIGINT then SIGTERM/SIGKILL
    for proc_ref_name in ["GLOBAL_STACK_PROC", "GLOBAL_CAMERA_PROC", "GLOBAL_TELEOP_PROC", "GLOBAL_MOTOR_PROC", "GLOBAL_RADIO_PROC"]:
        proc_obj = globals().get(proc_ref_name)
        if proc_obj and proc_obj.poll() is None:
            try:
                pgid = os.getpgid(proc_obj.pid)
                os.killpg(pgid, signal.SIGINT)   # Allow nodes to close serial handles
                time.sleep(0.3)
                os.killpg(pgid, signal.SIGTERM)
                time.sleep(0.1)
                os.killpg(pgid, signal.SIGKILL)
                killed_pids.append(proc_obj.pid)
            except Exception:
                try:
                    proc_obj.kill()
                    killed_pids.append(proc_obj.pid)
                except Exception:
                    pass
            globals()[proc_ref_name] = None

    # 2. Terminate any remaining stack processes by pattern
    to_kill = []
    for proc_key, patterns in MANAGED_PROCESS_PATTERNS.items():
        if proc_key in ["rosbridge_proc", "video_server_proc"]:
            continue  # Keep infrastructure servers alive
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline_str = " ".join(p.info['cmdline'] or [])
                pname = p.info['name'] or ""
                full_str = f"{pname} {cmdline_str}"
                for pat in patterns:
                    if pat in full_str and p.pid != os.getpid():
                        try:
                            p.terminate()
                            to_kill.append(p)
                            killed_pids.append(p.pid)
                        except Exception:
                            pass
                        break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    if to_kill:
        gone, alive = psutil.wait_procs(to_kill, timeout=0.8)
        for p in alive:
            try:
                p.kill()
            except Exception:
                pass
        if alive:
            psutil.wait_procs(alive, timeout=0.5)

    # 3. Clean USB bus transaction translator state and wait for udev to settle
    try:
        subprocess.run(
            ["sudo", "bash", "-c", "echo 0 > /sys/bus/usb/devices/usb1/authorized && sleep 0.2 && echo 1 > /sys/bus/usb/devices/usb1/authorized && udevadm settle --timeout=5"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=6.0
        )
    except Exception:
        pass

    return jsonify({
        "status": "ok",
        "message": "Robot stack stopped.",
        "killed_pids": list(set(killed_pids))
    })

GLOBAL_CAMERA_MODE = "auto"

@app.route("/api/camera/status", methods=["GET"])
def get_camera_status():
    global GLOBAL_CAMERA_PROC, GLOBAL_CAMERA_MODE
    hw = detect_camera_hardware()
    
    is_running = False
    proc_pid = None
    if GLOBAL_CAMERA_PROC and GLOBAL_CAMERA_PROC.poll() is None:
        is_running = True
        proc_pid = GLOBAL_CAMERA_PROC.pid
    else:
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                full_str = " ".join(p.info['cmdline'] or [])
                for pat in MANAGED_PROCESS_PATTERNS["camera_proc"]:
                    if pat in full_str:
                        is_running = True
                        proc_pid = p.info['pid']
                        break
                if is_running:
                    break
            except Exception:
                continue

    active_topic = "/camera/color/image_raw"
    if GLOBAL_CAMERA_MODE == "realsense" or (GLOBAL_CAMERA_MODE == "auto" and hw["realsense"]):
        active_topic = "/camera/camera/color/image_raw"
    elif GLOBAL_CAMERA_MODE == "diagnostic":
        active_topic = "/camera/color/image_raw"

    return jsonify({
        "status": "ok",
        "running": is_running,
        "pid": proc_pid,
        "mode": GLOBAL_CAMERA_MODE,
        "active_topic": active_topic,
        "hardware": hw
    })

@app.route("/api/camera/rescan", methods=["POST"])
def rescan_camera_devices():
    try:
        subprocess.run(["udevadm", "settle", "--timeout=1"], timeout=2)
    except Exception:
        pass
    hw = detect_camera_hardware()
    return jsonify({
        "status": "ok",
        "message": "USB and camera device bus rescanned.",
        "hardware": hw
    })

@app.route("/api/camera/toggle", methods=["POST"])
def toggle_camera_module():
    global GLOBAL_CAMERA_PROC, GLOBAL_CAMERA_MODE
    data = request.json or {}
    enable = data.get("enable", True)
    req_mode = data.get("mode", "auto")

    # Stop any running camera process first
    killed = []
    if GLOBAL_CAMERA_PROC and GLOBAL_CAMERA_PROC.poll() is None:
        try:
            os.killpg(os.getpgid(GLOBAL_CAMERA_PROC.pid), 15)
            killed.append(GLOBAL_CAMERA_PROC.pid)
        except Exception:
            try:
                os.killpg(os.getpgid(GLOBAL_CAMERA_PROC.pid), 15)
                killed.append(GLOBAL_CAMERA_PROC.pid)
            except Exception:
                pass
        GLOBAL_CAMERA_PROC = None

    patterns = MANAGED_PROCESS_PATTERNS["camera_proc"]
    for p in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline_str = " ".join(p.info['cmdline'] or [])
            pname = p.info['name'] or ""
            full_str = f"{pname} {cmdline_str}"
            for pat in patterns:
                if pat in full_str:
                    p.terminate()
                    killed.append(p.info['pid'])
                    break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if not enable:
        GLOBAL_CAMERA_MODE = "off"
        return jsonify({
            "status": "ok",
            "message": "Camera module turned OFF.",
            "mode": "off",
            "killed_pids": list(set(killed))
        })

    # Enable requested mode
    hw = detect_camera_hardware()
    chosen_mode = req_mode
    if req_mode == "auto":
        chosen_mode = hw["type"]

    GLOBAL_CAMERA_MODE = chosen_mode

    prefix = (
        "export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml && "
        "export RMW_IMPLEMENTATION=rmw_fastrtps_cpp && "
        "export ROS_LOG_DIR=/tmp/ros_log && "
        "source /opt/ros/jazzy/setup.bash && "
        "source /home/ubuntu/Desktop/Xtrmbly/install/setup.bash && "
    )

    if chosen_mode == "realsense":
        cmd_str = (
            prefix +
            "ros2 launch realsense2_camera rs_launch.py initial_reset:=false enable_gyro:=false enable_accel:=false enable_motion:=false enable_sync:=false enable_infra1:=false enable_infra2:=false color_qos:=DEFAULT depth_qos:=DEFAULT depth_module.depth_profile:=480x270x15 rgb_camera.color_profile:=424x240x15"
        )
        active_topic = "/camera/camera/color/image_raw"
    elif chosen_mode == "v4l2":
        dev = hw["v4l2_devices"][0] if hw["v4l2_devices"] else "/dev/video0"
        image_size = "[1280,720]" if hw.get("logitech") else "[640,480]"
        cmd_str = (
            prefix +
            f"ros2 run v4l2_camera v4l2_camera_node --ros-args -p video_device:={dev} -p image_size:={image_size} -r image_raw:=/camera/color/image_raw"
        )
        active_topic = "/camera/color/image_raw"
    else:  # diagnostic
        cmd_str = (
            prefix +
            "python3 /home/ubuntu/Desktop/Xtrmbly/admin-dashboard/server/diagnostic_cam.py"
        )
        active_topic = "/camera/color/image_raw"

    try:
        GLOBAL_CAMERA_PROC = subprocess.Popen(
            ["/bin/bash", "-c", cmd_str],
            preexec_fn=os.setsid
        )
        return jsonify({
            "status": "ok",
            "message": f"Camera module turned ON ({chosen_mode} mode).",
            "mode": chosen_mode,
            "active_topic": active_topic,
            "hardware": hw,
            "pid": GLOBAL_CAMERA_PROC.pid
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/logs", methods=["GET"])
def get_logs():
    source = request.args.get("source", "ros")
    lines_count = int(request.args.get("lines", 100))
    filter_keyword = request.args.get("filter", "").strip().lower()

    logs = []
    
    if source == "journalctl":
        try:
            cmd = ["journalctl", "-n", str(lines_count), "--no-pager"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            logs = res.stdout.splitlines()
        except Exception as e:
            logs = [f"[Error running journalctl: {e}]"]
    else:
        # ROS log directory search
        ros_log_dir = os.path.expanduser("~/.ros/log")
        if os.path.exists(ros_log_dir):
            log_files = glob.glob(os.path.join(ros_log_dir, "**/*.log"), recursive=True)
            if log_files:
                # Sort by modification time
                log_files.sort(key=os.path.getmtime, reverse=True)
                latest_log = log_files[0]
                try:
                    with open(latest_log, "r", errors="ignore") as f:
                        all_lines = f.readlines()
                        logs = [l.strip() for l in all_lines[-lines_count:]]
                except Exception as e:
                    logs = [f"[Error reading ROS log file {latest_log}: {e}]"]
            else:
                logs = ["[No ROS log files found in ~/.ros/log]"]
        else:
            logs = ["[~/.ros/log directory does not exist yet]"]

    if filter_keyword:
        logs = [line for line in logs if filter_keyword in line.lower()]

    return jsonify({
        "status": "ok",
        "source": source,
        "lines": logs
    })

if __name__ == "__main__":
    print(f"Starting Rubik Pi ROS 2 Admin Backend on 0.0.0.0:{PORT}...")
    app.run(host="0.0.0.0", port=PORT, debug=False)
