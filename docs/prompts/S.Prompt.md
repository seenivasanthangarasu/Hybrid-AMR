# S.Prompt — Robot-Side Connection Discovery

Run this with shell access to the machine hosting the ROS 2 stack (the
RubikPi / robot compute board) — SSH in, or run it locally on that box.
Its only job is to discover the details another machine needs to connect
a dashboard to this robot over rosbridge, and emit them as **one** markdown
document in the exact shape below. [C.Prompt](C.Prompt.md) parses that
output mechanically, so don't paraphrase the format or add prose outside it.

This is **read-only discovery** — do not start, stop, or restart any
service, and do not edit any files on this machine.

## What to do

1. **IP address.** Identify every non-loopback IPv4 address on this host
   (`ip -4 addr show` or `hostname -I`). Exclude Docker/virtual interfaces
   (`docker0`, `br-*`, `veth*`, `lo`). Pick the one on the robot's actual
   operator LAN/Wi-Fi as `primary_ip`; list any others as `alternate_ips`.

2. **rosbridge.** Confirm `rosbridge_server` is actually listening — don't
   assume port 9090 just because it's the default:
   ```bash
   ss -tlnp | grep 9090   # or: netstat -tlnp | grep 9090
   ```
   If nothing is bound there, check the process list for `rosbridge` to
   find its real port/launch args. If it isn't running at all, record
   `rosbridge_port: NOT RUNNING` — do not invent a port.

3. **web_video_server.** Same check, default port 8080. If it isn't
   running, record `web_video_port: NOT RUNNING` rather than guessing —
   the dashboard has an honest "no camera stream" state for exactly this.

4. **Mesh server (optional).** Only report a `mesh_server_url` if a static
   file server for URDF meshes is *already* intentionally running. Don't
   start one just to have something to report.

5. **ROS 2 distro.** `echo $ROS_DISTRO`, or check what's under `/opt/ros/`.

6. **Active topics.** `ros2 topic list -t`. This tells the client which
   panels *should* show live data right now versus legitimately showing
   `NO SIGNAL` because nothing upstream is publishing yet — list them all,
   don't summarize.

7. **Timestamp.** Current UTC time. This snapshot goes stale the moment a
   node restarts, the DHCP lease changes, or rosbridge is relaunched — say
   so isn't your job here, just timestamp it so the client can judge.

## Output format

Produce exactly this structure, filled in — nothing before it, nothing
after except the notes line:

````markdown
```connection
timestamp_utc: <ISO8601>
hostname: <hostname>
primary_ip: <ip used for rosbridge/web_video>
alternate_ips: <comma-separated, or "none">
rosbridge_port: <port, or "NOT RUNNING">
web_video_port: <port, or "NOT RUNNING">
mesh_server_url: <url, or "none">
ros_distro: <e.g. jazzy>
```

### Active topics

| Topic | Type |
|---|---|
| /fix | sensor_msgs/NavSatFix |
| ... | ... |

### Notes

<Anything unusual — non-default port, multiple NICs, a service that's
down, a topic the dashboard expects but isn't listed above. "None." if
there's genuinely nothing to flag.>
````
