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

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

PORT = int(os.environ.get("ADMIN_BACKEND_PORT", 5001))

MANAGED_PROCESS_PATTERNS = {
    "hybrid_manager": ["hybrid_manager.py", "hybrid_navigation"],
    "gps_proc": ["hiwonder_gps_node", "hiwonder_gps", "gps_node", "ublox_gps_node", "ublox_gps"],
    "urdf_proc": ["robot_state_publisher"],
    "joint_state_proc": ["joint_state_publisher"],
    "lidar_proc": ["ydlidar_ros2_driver", "ydlidar_ros2_driver_node"],
    "odom_proc": ["esp32_odom", "odom_node", "arrow_teleop"],
    "imu_proc": ["hiwonder_imu_node", "hiwonder_imu", "imu_serial_node", "imu_node"],
    "slam_proc": ["slam_toolbox", "localization_slam_toolbox_node", "async_slam_toolbox_node"],
    "rviz_proc": ["rviz2"],
    "camera_proc": ["realsense2_camera_node", "realsense2_camera", "rs_launch", "v4l2_camera_node", "v4l2_camera"],
    "video_server_proc": ["web_video_server"],
    "rosbridge_proc": ["rosbridge_websocket"],
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
            "uptime_seconds": round(uptime_seconds),
            "hostname": socket.gethostname(),
            "network": get_network_interfaces()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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

    hw_esp = check_dev_path("/dev/esp", "/dev/amr_encoder", "/dev/ttyUSB2", "/dev/esp32")
    hw_lidar = check_dev_path("/dev/amr_lidar", "/dev/ttyUSB3", "/dev/ttyUSB4", "/dev/lidar")
    hw_gps = check_dev_path("/dev/hiwonder_gps", "/dev/amr_gps", "/dev/gps", "/dev/ttyUSB0")
    hw_imu = check_dev_path("/dev/hiwonder_imu", "/dev/amr_imu", "/dev/esp-imu", "/dev/ttyUSB1")
    
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

    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "hardware": {
            "esp32": hw_esp,
            "ydlidar": hw_lidar,
            "hiwonder_gps": hw_gps,
            "hiwonder_imu": hw_imu
        },
        "services": {
            "rosbridge_9090": rosbridge_reachable,
            "web_video_server_8080": video_server_reachable
        },
        "managed_processes": processes_info
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

BRINGUP_LOG_FILE = "/tmp/robot_bringup.log"

@app.route("/api/stack/start", methods=["POST"])
def start_robot_stack():
    global GLOBAL_STACK_PROC
    data = request.json or {}
    include_camera = data.get("include_camera", False)

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
        f"ros2 launch rock_bringup navigation.launch.py start_camera:={'true' if include_camera else 'false'}"
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
            "message": f"Robot stack launched successfully (camera={'on' if include_camera else 'off'}).",
            "pid": GLOBAL_STACK_PROC.pid
        })
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
    global GLOBAL_STACK_PROC, GLOBAL_CAMERA_PROC
    killed_pids = []

    # 1. Stop main stack process group with gentle SIGINT then SIGTERM/SIGKILL
    if GLOBAL_STACK_PROC and GLOBAL_STACK_PROC.poll() is None:
        try:
            pgid = os.getpgid(GLOBAL_STACK_PROC.pid)
            os.killpg(pgid, signal.SIGINT)   # Allow nodes to close serial handles
            time.sleep(0.4)
            os.killpg(pgid, signal.SIGTERM)
            time.sleep(0.2)
            os.killpg(pgid, signal.SIGKILL)
            killed_pids.append(GLOBAL_STACK_PROC.pid)
        except Exception:
            try:
                GLOBAL_STACK_PROC.kill()
                killed_pids.append(GLOBAL_STACK_PROC.pid)
            except Exception:
                pass
        GLOBAL_STACK_PROC = None

    if GLOBAL_CAMERA_PROC and GLOBAL_CAMERA_PROC.poll() is None:
        try:
            pgid = os.getpgid(GLOBAL_CAMERA_PROC.pid)
            os.killpg(pgid, signal.SIGINT)
            time.sleep(0.2)
            os.killpg(pgid, signal.SIGKILL)
            killed_pids.append(GLOBAL_CAMERA_PROC.pid)
        except Exception:
            try:
                GLOBAL_CAMERA_PROC.kill()
                killed_pids.append(GLOBAL_CAMERA_PROC.pid)
            except Exception:
                pass
        GLOBAL_CAMERA_PROC = None

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

@app.route("/api/camera/toggle", methods=["POST"])
def toggle_camera_module():
    global GLOBAL_CAMERA_PROC
    data = request.json or {}
    enable = data.get("enable", True)

    if enable:
        if GLOBAL_CAMERA_PROC and GLOBAL_CAMERA_PROC.poll() is None:
            return jsonify({
                "status": "ok",
                "message": "Camera module is already running.",
                "pid": GLOBAL_CAMERA_PROC.pid
            })

        cmd_str = (
            "export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml && "
            "export RMW_IMPLEMENTATION=rmw_fastrtps_cpp && "
            "export ROS_LOG_DIR=/tmp/ros_log && "
            "source /opt/ros/jazzy/setup.bash && "
            "source /home/ubuntu/Desktop/Xtrmbly/install/setup.bash && "
            "ros2 launch realsense2_camera rs_launch.py initial_reset:=false enable_gyro:=false enable_accel:=false enable_motion:=false enable_sync:=false enable_infra1:=false enable_infra2:=false depth_module.depth_profile:=424x240x15 rgb_camera.color_profile:=424x240x15"
        )
        try:
            GLOBAL_CAMERA_PROC = subprocess.Popen(
                ["/bin/bash", "-c", cmd_str],
                preexec_fn=os.setsid
            )
            return jsonify({
                "status": "ok",
                "message": "Camera module turned ON.",
                "pid": GLOBAL_CAMERA_PROC.pid
            })
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    else:
        killed = []
        if GLOBAL_CAMERA_PROC and GLOBAL_CAMERA_PROC.poll() is None:
            try:
                os.killpg(os.getpgid(GLOBAL_CAMERA_PROC.pid), 15)
                killed.append(GLOBAL_CAMERA_PROC.pid)
            except Exception:
                try:
                    GLOBAL_CAMERA_PROC.terminate()
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

        return jsonify({
            "status": "ok",
            "message": "Camera module turned OFF.",
            "killed_pids": list(set(killed))
        })

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
