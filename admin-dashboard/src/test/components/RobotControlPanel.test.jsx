import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RobotControlPanel from '../../components/RobotControlPanel';

const MOCK_STATUS_DATA = {
  status: 'ok',
  battery: { voltage: 14.2 },
  hardware: {
    sabertooth: { exists: true, accessible: true, battery_voltage: 14.2 },
    esp32: { exists: true, accessible: true },
  },
  managed_processes: {
    session_proc: { running: true, pid: 1000, cpu_percent: 0.5, memory_percent: 0.2, uptime_seconds: 60 },
    urdf_proc: { running: true, pid: 1001, cpu_percent: 1.2, memory_percent: 0.5, uptime_seconds: 60 },
    joint_state_proc: { running: true, pid: 1002, cpu_percent: 0.8, memory_percent: 0.4, uptime_seconds: 60 },
    odom_proc: { running: true, pid: 1003, cpu_percent: 2.1, memory_percent: 0.6, uptime_seconds: 60 },
    imu_proc: { running: true, pid: 1004, cpu_percent: 1.5, memory_percent: 0.5, uptime_seconds: 60 },
    lidar_proc: { running: true, pid: 1005, cpu_percent: 3.4, memory_percent: 0.8, uptime_seconds: 60 },
    slam_proc: { running: true, pid: 1006, cpu_percent: 4.2, memory_percent: 1.2, uptime_seconds: 60 },
    gps_proc: { running: true, pid: 1007, cpu_percent: 0.9, memory_percent: 0.3, uptime_seconds: 60 },
    sabertooth_proc: { running: true, pid: 1008, cpu_percent: 1.1, memory_percent: 0.4, uptime_seconds: 60 },
    radio_proc: { running: true, pid: 1009, cpu_percent: 0.7, memory_percent: 0.3, uptime_seconds: 60 },
    camera_proc: { running: false },
  }
};

describe('RobotControlPanel Component', () => {
  it('renders header, battery voltage, and online node counts', () => {
    render(
      <RobotControlPanel
        statusData={MOCK_STATUS_DATA}
        batteryVoltage={14.2}
        startStack={vi.fn()}
        stopStack={vi.fn()}
        toggleCamera={vi.fn()}
        toggleTeleop={vi.fn()}
        toggleMotor={vi.fn()}
        toggleRadio={vi.fn()}
        fetchStackLogs={vi.fn().mockResolvedValue([])}
        backendConnected={true}
      />
    );

    expect(screen.getByText(/Robot Startup & Bringup Control/i)).toBeInTheDocument();
    expect(screen.getByText(/10\/10 Nodes Active/i)).toBeInTheDocument();
    expect(screen.getByText(/14.2V/i)).toBeInTheDocument();
  });

  it('renders both Sabertooth Motor Driver and HOT RC Radio Receiver in module cards', () => {
    render(
      <RobotControlPanel
        statusData={MOCK_STATUS_DATA}
        batteryVoltage={14.2}
        startStack={vi.fn()}
        stopStack={vi.fn()}
        toggleCamera={vi.fn()}
        toggleTeleop={vi.fn()}
        toggleMotor={vi.fn()}
        toggleRadio={vi.fn()}
        fetchStackLogs={vi.fn().mockResolvedValue([])}
        backendConnected={true}
      />
    );

    expect(screen.getByText(/Sabertooth 2x32 Motor Driver/i)).toBeInTheDocument();
    expect(screen.getByText(/HOT RC DS-600 Radio Receiver/i)).toBeInTheDocument();
  });

  it('triggers startStack with default idle options', async () => {
    const startStackMock = vi.fn().mockResolvedValue({ status: 'ok', pid: 9999 });

    render(
      <RobotControlPanel
        statusData={MOCK_STATUS_DATA}
        batteryVoltage={14.2}
        startStack={startStackMock}
        stopStack={vi.fn()}
        toggleCamera={vi.fn()}
        toggleTeleop={vi.fn()}
        toggleMotor={vi.fn()}
        toggleRadio={vi.fn()}
        fetchStackLogs={vi.fn().mockResolvedValue([])}
        backendConnected={true}
      />
    );

    const launchBtn = screen.getByRole('button', { name: /Launch Core Stack/i });
    fireEvent.click(launchBtn);

    expect(startStackMock).toHaveBeenCalledWith({
      includeCamera: false,
      includeMotors: false,
      includeRadio: false,
    });
  });

  it('triggers teleop toggle to OFF when running', async () => {
    const toggleTeleopMock = vi.fn().mockResolvedValue({ status: 'ok' });

    render(
      <RobotControlPanel
        statusData={MOCK_STATUS_DATA}
        batteryVoltage={14.2}
        startStack={vi.fn()}
        stopStack={vi.fn()}
        toggleCamera={vi.fn()}
        toggleTeleop={toggleTeleopMock}
        toggleMotor={vi.fn()}
        toggleRadio={vi.fn()}
        fetchStackLogs={vi.fn().mockResolvedValue([])}
        backendConnected={true}
      />
    );

    const stopTeleopBtn = screen.getByRole('button', { name: /Turn OFF Radio Teleop Drive/i });
    fireEvent.click(stopTeleopBtn);
    expect(toggleTeleopMock).toHaveBeenCalledWith(false);
  });

  it('triggers teleop toggle to ON when idle', async () => {
    const toggleTeleopMock = vi.fn().mockResolvedValue({ status: 'ok' });
    const idleStatus = {
      ...MOCK_STATUS_DATA,
      managed_processes: {
        ...MOCK_STATUS_DATA.managed_processes,
        sabertooth_proc: { running: false },
        radio_proc: { running: false },
      }
    };

    render(
      <RobotControlPanel
        statusData={idleStatus}
        batteryVoltage={14.2}
        startStack={vi.fn()}
        stopStack={vi.fn()}
        toggleCamera={vi.fn()}
        toggleTeleop={toggleTeleopMock}
        toggleMotor={vi.fn()}
        toggleRadio={vi.fn()}
        fetchStackLogs={vi.fn().mockResolvedValue([])}
        backendConnected={true}
      />
    );

    const startTeleopBtn = screen.getByRole('button', { name: /Turn ON Radio Teleop Drive/i });
    fireEvent.click(startTeleopBtn);
    expect(toggleTeleopMock).toHaveBeenCalledWith(true);
  });
});
