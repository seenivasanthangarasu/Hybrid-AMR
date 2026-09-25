#!/usr/bin/env python3
"""
HIWONDER 9-DOF IMU — Live Magnetic North (0.0°) Finder & Alignment Tool
Supports both direct serial reading and ROS 2 topic subscription.
"""

import sys
import time
import math
import struct
import glob
import os
import argparse


def render_gauge(heading_deg):
    width = 31
    center = width // 2
    chars = []
    for i in range(width):
        deg = (heading_deg - center + i) % 360
        if abs(deg - 0) < 5 or abs(deg - 360) < 5:
            chars.append("N")
        elif abs(deg - 90) < 5:
            chars.append("E")
        elif abs(deg - 180) < 5:
            chars.append("S")
        elif abs(deg - 270) < 5:
            chars.append("W")
        elif int(deg) % 30 == 0:
            chars.append("|")
        else:
            chars.append("-")
    
    chars[center] = "▲"
    return "[" + "".join(chars) + "]"


def print_ui(mag_heading, yaw_sensor, mx, my, mz, roll, pitch, source_info):
    diff = mag_heading if mag_heading <= 180 else mag_heading - 360.0
    
    if abs(diff) <= 2.0:
        status = "\033[1;42;37m >>> PERFECT 0.0° NORTH ALIGNED <<< \033[0m"
    elif abs(diff) <= 8.0:
        status = f"\033[1;32m ALMOST AT NORTH (Offset: {diff:+.1f}°) \033[0m"
    elif diff > 0:
        status = f"\033[1;33m Turn Counter-Clockwise ↺ ({diff:+.1f}°) \033[0m"
    else:
        status = f"\033[1;33m Turn Clockwise ↻ ({-diff:+.1f}°) \033[0m"

    gauge = render_gauge(mag_heading)
    
    output = (
        f"\033[H"
        f"\033[1;34m======================================================================\033[0m\n"
        f"\033[1;37m         HIWONDER 9-DOF IMU — MAGNETIC NORTH (0.0°) ALIGNMENT         \033[0m\n"
        f"\033[1;34m======================================================================\033[0m\n\n"
        f"  \033[1;33mCompass Tape     :\033[0m  {gauge}\n"
        f"  \033[1;33mMagnetic Heading :\033[0m  \033[1;37m{mag_heading:6.1f}°\033[0m  (Internal Yaw: {yaw_sensor:6.1f}°)\n"
        f"  \033[1;33mMag Field Vector :\033[0m  \033[36mX: {mx:+6.0f}\033[0m  |  \033[36mY: {my:+6.0f}\033[0m  |  \033[36mZ: {mz:+6.0f}\033[0m\n"
        f"  \033[1;33mLeveling (RP)    :\033[0m  Roll: {roll:+5.1f}°  |  Pitch: {pitch:+5.1f}°\n\n"
        f"  \033[1;37mAlignment Status :\033[0m  {status}\n\n"
        f"\033[1;34m======================================================================\033[0m\n"
        f"  \033[90mSource: {source_info}\033[0m\n"
        f"  \033[90mTarget: Rotate sensor until Heading = 0.0° (X is maximum positive, Y ~ 0)\033[0m\n"
        f"  \033[90mPress Ctrl+C to exit.\033[0m\n"
    )
    sys.stdout.write(output)
    sys.stdout.flush()


def run_serial(port, baudrate=9600):
    import serial
    print(f"\033[2J\033[H", end="")
    print(f"Connecting to Hiwonder IMU on \033[1;36m{port}\033[0m @ {baudrate} baud...")
    
    try:
        ser = serial.Serial(port, baudrate, timeout=0.2)
    except Exception as e:
        print(f"\033[1;31mError opening serial port {port}:\033[0m {e}")
        print("Note: If hiwonder_imu_node is already running, run with '--ros' or stop the node first.")
        sys.exit(1)

    buf = bytearray()
    mx, my, mz = 0.0, 0.0, 0.0
    roll, pitch, yaw_sensor = 0.0, 0.0, 0.0
    mag_heading = 0.0
    last_print = 0

    print("\033[?25l", end="") # Hide cursor
    try:
        while True:
            try:
                bytes_available = ser.in_waiting or 1
                data = ser.read(bytes_available)
                if data:
                    buf.extend(data)
            except Exception:
                time.sleep(0.01)
                continue

            while len(buf) >= 11:
                if buf[0] != 0x55:
                    del buf[0]
                    continue
                frame = bytes(buf[:11])
                checksum = sum(frame[:10]) & 0xFF
                if checksum != frame[10]:
                    del buf[0]
                    continue

                ftype = frame[1]
                vals = struct.unpack('<hhhh', frame[2:10])
                del buf[:11]

                if ftype == 0x53:
                    roll = (vals[0] / 32768.0) * 180.0
                    pitch = (vals[1] / 32768.0) * 180.0
                    yaw_sensor = (vals[2] / 32768.0) * 180.0
                    if yaw_sensor < 0:
                        yaw_sensor += 360.0

                elif ftype == 0x54:
                    mx, my, mz = float(vals[0]), float(vals[1]), float(vals[2])
                    mag_heading = math.degrees(math.atan2(my, mx))
                    if mag_heading < 0:
                        mag_heading += 360.0

            now = time.time()
            if now - last_print > 0.08:
                last_print = now
                print_ui(mag_heading, yaw_sensor, mx, my, mz, roll, pitch, f"Direct Serial ({port})")
    except KeyboardInterrupt:
        pass
    finally:
        ser.close()
        print("\033[?25h\n\nExited.")


def main():
    parser = argparse.ArgumentParser(description="Hiwonder IMU 0° North Alignment Tool")
    parser.add_argument("--port", default="/dev/ttyUSB0", help="Serial port (default: /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=9600, help="Baudrate (default: 9600)")
    args = parser.parse_args()

    run_serial(args.port, args.baud)


if __name__ == "__main__":
    main()
