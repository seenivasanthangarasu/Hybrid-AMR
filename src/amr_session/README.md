# amr_session

Authoritative power-cycle session manager and publisher for the **Hybrid-AMR** on **ROS 2 Jazzy**.

## 📌 Features

* **Kernel Boot Binding**: Session UUID is idempotently derived from the Linux kernel boot ID (`/proc/sys/kernel/random/boot_id`). System reboots produce a clean new session; browser reconnects or node restarts retain the active session.
* **QoS Contract**: Publishes on `/amr/session` using `RELIABLE` reliability and `TRANSIENT_LOCAL` durability (depth: 1) every 2.0s while active.
* **Orderly Teardown**: Intercepts `SIGINT` and `SIGTERM` signals to broadcast `"state": "ended"` before shutting down transport.

## 🚀 Usage

```bash
# Run session publisher directly
ros2 run amr_session session_publisher

# Run unit test suite (9 Tests)
PYTHONPATH=src/amr_session pytest src/amr_session/test/
```

## ⚙️ Systemd Auto-Start

A systemd unit file is provided at `scripts/amr-session.service`:

```bash
sudo cp scripts/amr-session.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now amr-session.service
```
