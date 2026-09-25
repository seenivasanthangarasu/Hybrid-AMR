#!/usr/bin/env python3
"""
HIWONDER 9-DOF IMU — Interactive Calibration Utility
Calibrates:
 1. Accelerometer & Gyroscope (Level / Zero bias calibration)
 2. Magnetometer (3D Magnetic field sphere calibration)
 3. Yaw Zero Reset
 4. Save to Flash EEPROM
"""

import sys
import time
import struct
import math
import glob
import os
import argparse

try:
    import serial
except ImportError:
    print("Error: pyserial is required. Run: pip install pyserial")
    sys.exit(1)


CMD_SAVE = bytes([0xFF, 0xAA, 0x00, 0x00, 0x00])
CMD_CALIB_ACC_GYRO = bytes([0xFF, 0xAA, 0x01, 0x01, 0x00])
CMD_CALIB_MAG = bytes([0xFF, 0xAA, 0x01, 0x02, 0x00])
CMD_RESET_YAW = bytes([0xFF, 0xAA, 0x01, 0x04, 0x00])
CMD_CALIB_EXIT = bytes([0xFF, 0xAA, 0x01, 0x00, 0x00])
CMD_FACTORY_RESET = bytes([0xFF, 0xAA, 0x00, 0x01, 0x00])


def find_imu_port():
    candidates = [
        "/dev/hiwonder_imu",
        "/dev/amr_imu",
        "/dev/ttyUSB0",
        "/dev/ttyUSB1",
        "/dev/ttyUSB2",
        "/dev/ttyUSB3",
    ] + glob.glob("/dev/serial/by-id/*")
    
    for port in candidates:
        if os.path.exists(port):
            try:
                s = serial.Serial(port, 9600, timeout=0.2)
                buf = s.read(100)
                s.close()
                if 0x55 in buf:
                    return port
            except Exception:
                continue
    return "/dev/ttyUSB0"


def send_cmd(ser, cmd, name="Command"):
    ser.write(cmd)
    ser.flush()
    time.sleep(0.1)


def calibrate_accel_gyro(ser):
    print("\n" + "=" * 65)
    print(" STEP 1: ACCELEROMETER & GYROSCOPE ZERO CALIBRATION")
    print("=" * 65)
    print(" -> Place the IMU on a FLAT, HORIZONTAL surface.")
    print(" -> Make sure the sensor is COMPLETELY STILL (DO NOT TOUCH IT).")
    input("\n Press [ENTER] when the sensor is still and ready to calibrate...")

    print("\n Sending Accelerometer/Gyroscope calibration command...")
    send_cmd(ser, CMD_CALIB_ACC_GYRO, "Start Acc/Gyro Calib")
    
    for remaining in range(5, 0, -1):
        print(f" Calibrating zero bias... {remaining}s remaining (DO NOT MOVE)", end="\r")
        time.sleep(1.0)
    print("\n Finished sampling!")

    send_cmd(ser, CMD_CALIB_EXIT, "Exit Calib")
    send_cmd(ser, CMD_SAVE, "Save to Flash")
    time.sleep(0.2)
    print(" \033[1;32m✓ Accel & Gyroscope calibration saved to Flash successfully!\033[0m\n")


def calibrate_magnetometer(ser):
    print("\n" + "=" * 65)
    print(" STEP 2: MAGNETOMETER (COMPASS) 3D CALIBRATION")
    print("=" * 65)
    print(" -> Keep sensor AWAY from large metal/magnetic objects.")
    print(" -> When prompted, rotate the sensor slowly in ALL directions:")
    print("      1. Rotate 360° around Horizontal Plane (Yaw)")
    print("      2. Rotate 360° around Pitch (Front-to-Back)")
    print("      3. Rotate 360° around Roll (Side-to-Side)")
    print("      4. Draw an 8-figure in the air.")
    input("\n Press [ENTER] to start 20-second magnetic sampling...")

    send_cmd(ser, CMD_CALIB_MAG, "Start Mag Calib")
    print("\n \033[1;33m>>> ROTATING NOW: Rotate sensor in all 3 axes! <<<\033[0m\n")

    buf = bytearray()
    min_x, max_x = 99999, -99999
    min_y, max_y = 99999, -99999
    min_z, max_z = 99999, -99999

    start_time = time.time()
    duration = 20.0

    while time.time() - start_time < duration:
        remaining = duration - (time.time() - start_time)
        data = ser.read(ser.in_waiting or 1)
        if data:
            buf.extend(data)

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

            if ftype == 0x54: # Mag
                mx, my, mz = vals[0], vals[1], vals[2]
                min_x, max_x = min(min_x, mx), max(max_x, mx)
                min_y, max_y = min(min_y, my), max(max_y, my)
                min_z, max_z = min(min_z, mz), max(max_z, mz)

        print(f" Sampling: {remaining:4.1f}s | Mag X: [{min_x:+5d} to {max_x:+5d}] | Y: [{min_y:+5d} to {max_y:+5d}] | Z: [{min_z:+5d} to {max_z:+5d}]", end="\r")
        time.sleep(0.05)

    print("\n\n Finalizing and saving magnetic calibration...")
    send_cmd(ser, CMD_CALIB_EXIT, "Exit Calib")
    send_cmd(ser, CMD_SAVE, "Save to Flash")
    time.sleep(0.2)
    print(" \033[1;32m✓ Magnetometer calibration saved to Flash successfully!\033[0m\n")


def reset_yaw(ser):
    print("\n Resetting Z-axis (Yaw) angle to 0°...")
    send_cmd(ser, CMD_RESET_YAW, "Reset Yaw")
    send_cmd(ser, CMD_SAVE, "Save to Flash")
    time.sleep(0.2)
    print(" \033[1;32m✓ Yaw angle reset to 0°!\033[0m\n")


def main():
    parser = argparse.ArgumentParser(description="Hiwonder IMU Calibration Suite")
    parser.add_argument("--port", default="/dev/ttyUSB0", help="Serial port (default: /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=9600, help="Baudrate (default: 9600)")
    args = parser.parse_args()

    port = args.port or find_imu_port()

    # Ensure no node is hogging the port
    os.system("pkill -f hiwonder_imu_node 2>/dev/null")

    print("\033[1;34m" + "=" * 65 + "\033[0m")
    print("\033[1;37m        HIWONDER 9-DOF IMU — FULL CALIBRATION TOOL        \033[0m")
    print("\033[1;34m" + "=" * 65 + "\033[0m")
    print(f" Port: \033[1;36m{port}\033[0m @ {args.baud} baud\n")

    try:
        ser = serial.Serial(port, args.baud, timeout=0.1)
    except Exception as e:
        print(f"\033[1;31mError opening serial port {port}:\033[0m {e}")
        sys.exit(1)

    try:
        print(" Choose calibration option:")
        print("   [1] Full Calibration (Accel/Gyro + Magnetometer) [Recommended]")
        print("   [2] Accel / Gyro Level Zero Calibration only")
        print("   [3] Magnetometer 3D Compass Calibration only")
        print("   [4] Reset Yaw (Z-axis) to 0°")
        print("   [5] Exit")
        
        choice = input("\n Enter choice [1-5]: ").strip()

        if choice == "1":
            calibrate_accel_gyro(ser)
            calibrate_magnetometer(ser)
            print("\033[1;32m======================================================================\033[0m")
            print("\033[1;32m  ALL CALIBRATIONS COMPLETE & SAVED TO IMU FLASH EEPROM!\033[0m")
            print("\033[1;32m======================================================================\033[0m\n")
            print(" Next step: Run 'python3 scripts/find_north.py' to find North (0.0°).")
        elif choice == "2":
            calibrate_accel_gyro(ser)
        elif choice == "3":
            calibrate_magnetometer(ser)
        elif choice == "4":
            reset_yaw(ser)
        else:
            print("Exiting.")

    except KeyboardInterrupt:
        print("\nCalibration aborted.")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
