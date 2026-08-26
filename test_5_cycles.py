#!/usr/bin/env python3
import time
import json
import os
import subprocess

os.environ['FASTRTPS_DEFAULT_PROFILES_FILE'] = '/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml'
os.environ['RMW_IMPLEMENTATION'] = 'rmw_fastrtps_cpp'

import urllib.request
import urllib.error
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
from nav_msgs.msg import Odometry
from sensor_msgs.msg import Imu, LaserScan, NavSatFix, Image
from std_msgs.msg import String
from tf2_msgs.msg import TFMessage

class TelemetryCollector(Node):
    def __init__(self):
        super().__init__('cycle_test_collector')
        self.received = {
            'odom': 0,
            'imu': 0,
            'gps_nmea': 0,
            'gps_fix': 0,
            'lidar': 0,
            'camera_color': 0,
            'camera_depth_color': 0,
            'tf': 0
        }

        qos_sensor = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        qos_reliable = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        self.create_subscription(Odometry, '/odom', lambda m: self._inc('odom'), qos_sensor)
        self.create_subscription(Imu, '/hiwonder/imu/data_raw', lambda m: self._inc('imu'), qos_sensor)
        self.create_subscription(String, '/hiwonder/gps/nmea', lambda m: self._inc('gps_nmea'), qos_sensor)
        self.create_subscription(NavSatFix, '/hiwonder/gps/fix', lambda m: self._inc('gps_fix'), qos_sensor)
        self.create_subscription(LaserScan, '/scan', lambda m: self._inc('lidar'), qos_sensor)
        self.create_subscription(Image, '/camera/camera/color/image_raw', lambda m: self._inc('camera_color'), qos_sensor)
        self.create_subscription(Image, '/camera/camera/depth/image_rect_raw/color', lambda m: self._inc('camera_depth_color'), qos_sensor)
        self.create_subscription(TFMessage, '/tf', lambda m: self._inc('tf'), qos_sensor)

    def _inc(self, key):
        self.received[key] += 1

    def reset_counts(self):
        for k in self.received:
            self.received[k] = 0

def http_post(url, data=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data or {}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def http_get(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def test_video_server_snapshot(topic):
    url = f"http://127.0.0.1:8080/snapshot?topic={topic}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=4) as resp:
            content = resp.read()
            return len(content) > 1000
    except Exception:
        return False

def ensure_backend_server():
    try:
        http_get("http://127.0.0.1:5001/api/status")
        return None
    except Exception:
        print("   🔧 Starting Admin Server on port 5001...", flush=True)
        p = subprocess.Popen(
            ["/usr/bin/python3", "/home/ubuntu/Desktop/Xtrmbly/admin-dashboard/server/server.py"],
            cwd="/home/ubuntu/Desktop/Xtrmbly/admin-dashboard",
            stdout=open("/tmp/admin_server.log", "a"),
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )
        time.sleep(2.0)
        return p

def run_test_cycles(num_cycles=5):
    print("=" * 80, flush=True)
    print(f"🚀 STARTING {num_cycles}-CYCLE BRINGUP & TELEMETRY VALIDATION TEST", flush=True)
    print("=" * 80, flush=True)

    server_proc = ensure_backend_server()

    results = []

    for cycle in range(1, num_cycles + 1):
        print(f"\n▶️  [CYCLE {cycle}/{num_cycles}] --- LAUNCHING ROBOT STACK ---", flush=True)

        if not rclpy.ok():
            rclpy.init()
        node = TelemetryCollector()

        # 1. Trigger Launch via Backend API (Hardware Sensors)
        try:
            start_res = http_post("http://127.0.0.1:5001/api/stack/start", {"include_camera": False})
            print(f"   ↳ Start Response: {start_res.get('status')} (PID {start_res.get('pid')})", flush=True)
        except Exception as e:
            print(f"   ❌ Start Request Failed: {e}", flush=True)
            results.append({'cycle': cycle, 'status': 'FAIL', 'error': f"Start failed: {e}"})
            node.destroy_node()
            rclpy.shutdown()
            continue

        # 2. Hardware Sensor Telemetry Collection Window (10 seconds)
        print("   ⏳ Collecting sensor telemetry (odom, imu, gps, lidar, tf)...", flush=True)
        start_t = time.time()
        last_tick = start_t
        while time.time() - start_t < 10.0:
            rclpy.spin_once(node, timeout_sec=0.1)
            if time.time() - last_tick >= 2.5:
                last_tick = time.time()
                t_counts = node.received
                print(f"      ⏱️  +{int(last_tick - start_t):2d}s: odom={t_counts['odom']} imu={t_counts['imu']} gps={t_counts['gps_nmea']} lidar={t_counts['lidar']} tf={t_counts['tf']}", flush=True)

        # 3. Test Camera Stream Toggle ON
        print("   📹 Testing Camera Toggle ON & Video Server Stream...", flush=True)
        try:
            cam_start_res = http_post("http://127.0.0.1:5001/api/camera/toggle", {"enable": True})
            print(f"   ↳ Camera Start Response: {cam_start_res.get('status')}", flush=True)
        except Exception as e:
            print(f"   ⚠️ Camera start failed: {e}", flush=True)

        cam_start_t = time.time()
        while time.time() - cam_start_t < 6.0:
            rclpy.spin_once(node, timeout_sec=0.1)

        # Check Camera Video Server MJPEG Frame Fetch
        mjpeg_color_ok = test_video_server_snapshot("/camera/camera/color/image_raw")
        mjpeg_depth_ok = test_video_server_snapshot("/camera/camera/depth/image_rect_raw/color")
        print(f"   📹 Web Video Server Snapshot: RGB={mjpeg_color_ok}, DepthColor={mjpeg_depth_ok}", flush=True)

        # Toggle Camera OFF before stack stop
        try:
            http_post("http://127.0.0.1:5001/api/camera/toggle", {"enable": False})
        except Exception:
            pass

        # 4. Check Backend Process & Hardware Introspection
        try:
            status_res = http_get("http://127.0.0.1:5001/api/status")
            procs = status_res.get('managed_processes', {})
            active_procs = [k for k, v in procs.items() if v.get('running')]
        except Exception as e:
            active_procs = []
            print(f"   ⚠️ Could not fetch /api/status: {e}", flush=True)

        print(f"   🔍 Active Managed Processes ({len(active_procs)}): {', '.join(active_procs)}", flush=True)

        # 5. Evaluate Telemetry Counts
        telemetry = dict(node.received)
        print(f"   📊 Received Message Counts:", flush=True)
        for topic_key, count in telemetry.items():
            print(f"      - {topic_key:18s}: {count:4d} msgs", flush=True)

        # Telemetry validation criteria
        checks = {
            'odom_active': telemetry['odom'] > 0,
            'imu_active': telemetry['imu'] > 0,
            'gps_active': (telemetry['gps_nmea'] > 0 or telemetry['gps_fix'] > 0),
            'lidar_active': telemetry['lidar'] > 0,
            'camera_active': telemetry['camera_color'] > 0,
            'depth_colorizer': telemetry['camera_depth_color'] > 0,
            'tf_tree': telemetry['tf'] > 0,
            'procs_ok': len(active_procs) >= 5
        }

        all_passed = all(checks.values())
        print(f"   📋 Validation Result: {'✅ ALL PASSED' if all_passed else '⚠️ PARTIAL/FAILED'}", flush=True)
        for c_name, c_val in checks.items():
            if not c_val:
                print(f"      ❌ Check failed: {c_name}", flush=True)

        node.destroy_node()
        rclpy.shutdown()

        # 6. Shut Down Stack
        print(f"   ⏹️  Stopping Robot Stack...", flush=True)
        try:
            stop_res = http_post("http://127.0.0.1:5001/api/stack/stop")
            print(f"   ↳ Stop Response: {stop_res.get('status')} (Killed: {stop_res.get('killed_pids')})", flush=True)
        except Exception as e:
            print(f"   ⚠️ Stop request error: {e}", flush=True)

        # 7. Post-shutdown Cooldown & Udev Settle (4.5 seconds)
        time.sleep(4.5)
        try:
            post_status = http_get("http://127.0.0.1:5001/api/status")
            post_procs = [k for k, v in post_status.get('managed_processes', {}).items() if v.get('running') and k not in ['rosbridge_proc', 'video_server_proc']]
        except Exception:
            post_procs = []
        print(f"   🧹 Remaining Managed Procs: {post_procs if post_procs else 'None (Clean)'}", flush=True)

        cycle_summary = {
            'cycle': cycle,
            'status': 'PASS' if all_passed else 'FAIL',
            'active_procs': len(active_procs),
            'telemetry': telemetry,
            'checks': checks,
            'clean_teardown': len(post_procs) == 0
        }
        results.append(cycle_summary)

    if rclpy.ok():
        rclpy.shutdown()

    # Summary report
    print("\n" + "=" * 80, flush=True)
    print("📊 5-CYCLE STABILITY & TELEMETRY TEST SUMMARY REPORT", flush=True)
    print("=" * 80, flush=True)
    print(f"{'Cycle':<8} {'Status':<10} {'Odom':<8} {'IMU':<8} {'GPS':<8} {'Lidar':<8} {'Camera':<8} {'Depth':<8} {'TF':<8} {'Teardown':<10}", flush=True)
    print("-" * 80, flush=True)
    for r in results:
        t = r.get('telemetry', {})
        gps_cnt = t.get('gps_nmea', 0) + t.get('gps_fix', 0)
        teardown_str = "CLEAN" if r.get('clean_teardown') else "STALE"
        print(f"{r['cycle']:<8} {r['status']:<10} {t.get('odom',0):<8} {t.get('imu',0):<8} {gps_cnt:<8} {t.get('lidar',0):<8} {t.get('camera_color',0):<8} {t.get('camera_depth_color',0):<8} {t.get('tf',0):<8} {teardown_str:<10}", flush=True)
    print("=" * 80, flush=True)

    total_pass = sum(1 for r in results if r['status'] == 'PASS')
    print(f"\n🏁 FINAL OUTCOME: {total_pass}/{num_cycles} CYCLES PASSED PERFECTLY!\n", flush=True)
    return total_pass == num_cycles

if __name__ == '__main__':
    run_test_cycles(5)
