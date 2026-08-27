#!/usr/bin/env bash
# ==============================================================================
# usb_heal.sh — Automated USB Host Controller Reset & Port Healer for Hybrid-AMR
# Resolves USB hub brownouts (error -71) and locks up without rebooting
# ==============================================================================

set -e

echo "🔌 Checking USB hub bus state..."

# 1. Disable USB autosuspend across all controllers
echo 0 > /sys/module/usbcore/parameters/autosuspend 2>/dev/null || true
for f in /sys/bus/usb/devices/usb*/power/control /sys/bus/pci/devices/*/power/control; do
    [ -f "$f" ] && echo on > "$f" 2>/dev/null || true
done
for f in /sys/bus/usb/devices/*/power/autosuspend_delay_ms; do
    [ -f "$f" ] && echo -1 > "$f" 2>/dev/null || true
done

# 2. Check if serial devices or hub are missing
AMR_DEVS=("/dev/amr_lidar" "/dev/amr_encoder" "/dev/hiwonder_imu" "/dev/hiwonder_gps")
MISSING=0
for dev in "${AMR_DEVS[@]}"; do
    if [ ! -e "$dev" ]; then
        MISSING=$((MISSING + 1))
    fi
done

# 3. If any sensors are missing or error -71 occurred, rebind the PCIe xHCI controller
if [ "$MISSING" -gt 0 ] || [ "$1" == "--force" ]; then
    echo "⚠️ $MISSING AMR sensor symlinks missing. Rebinding PCI xHCI controller..."
    for dev in /sys/bus/pci/drivers/xhci_hcd/*:*; do
        if [ -e "$dev" ]; then
            bname=$(basename "$dev")
            echo "   ↳ Resetting PCI xHCI: $bname"
            echo "$bname" > /sys/bus/pci/drivers/xhci_hcd/unbind 2>/dev/null || true
            sleep 0.8
            echo "$bname" > /sys/bus/pci/drivers/xhci_hcd/bind 2>/dev/null || true
            sleep 1.5
        fi
    done
fi

# 4. Trigger udev rule reload & settle
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger 2>/dev/null || true
udevadm settle --timeout=2 2>/dev/null || true

echo "✅ USB bus scan complete. Detected ports:"
ls -la /dev/amr_* /dev/lidar /dev/esp* /dev/hiwonder* 2>/dev/null || true
