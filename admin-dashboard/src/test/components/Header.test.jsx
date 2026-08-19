/**
 * Header.test.jsx
 *
 * Tests for the sticky Header component.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../../components/Header.jsx';

const baseProps = {
  rosStatus: 'disconnected',
  backendConnected: false,
  systemData: null,
  activeTab: 'graph',
  setActiveTab: vi.fn(),
};

describe('Header – ROS status badge', () => {
  it('shows "disconnected" badge when rosStatus is disconnected', () => {
    render(<Header {...baseProps} rosStatus="disconnected" />);
    expect(screen.getByText(/ROS WS: disconnected/i)).toBeInTheDocument();
  });

  it('shows "connecting" badge when rosStatus is connecting', () => {
    render(<Header {...baseProps} rosStatus="connecting" />);
    expect(screen.getByText(/ROS WS: connecting/i)).toBeInTheDocument();
  });

  it('shows "connected" badge when rosStatus is connected', () => {
    render(<Header {...baseProps} rosStatus="connected" />);
    expect(screen.getByText(/ROS WS: connected/i)).toBeInTheDocument();
  });

  it('shows "error" badge when rosStatus is error', () => {
    render(<Header {...baseProps} rosStatus="error" />);
    expect(screen.getByText(/ROS WS: error/i)).toBeInTheDocument();
  });

  it('shows "closed" badge when rosStatus is closed', () => {
    render(<Header {...baseProps} rosStatus="closed" />);
    expect(screen.getByText(/ROS WS: closed/i)).toBeInTheDocument();
  });
});

describe('Header – backend API badge', () => {
  it('shows "Offline" when backendConnected is false', () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText(/API: Offline/i)).toBeInTheDocument();
  });

  it('shows "Connected" when backendConnected is true', () => {
    render(<Header {...baseProps} backendConnected={true} />);
    expect(screen.getByText(/API: Connected/i)).toBeInTheDocument();
  });
});

describe('Header – CPU/Temp info strip', () => {
  it('does not render CPU strip when systemData is null', () => {
    render(<Header {...baseProps} systemData={null} />);
    expect(screen.queryByText(/cpu:/i)).not.toBeInTheDocument();
  });

  it('renders CPU percentage and temp when systemData is provided', () => {
    const sys = {
      cpu: { total_percent: 42.0, temp_c: 58 },
    };
    render(<Header {...baseProps} systemData={sys} />);
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/58°C/)).toBeInTheDocument();
  });
});

describe('Header – tab navigation', () => {
  const tabs = ['control', 'graph', 'process', 'system', 'logs', 'camera'];

  tabs.forEach((tab) => {
    it(`calls setActiveTab("${tab}") when that tab button is clicked`, () => {
      const setActiveTab = vi.fn();
      render(<Header {...baseProps} setActiveTab={setActiveTab} />);

      const tabLabels = {
        control: /robot control/i,
        graph: /ros graph/i,
        process: /processes/i,
        system: /pi system/i,
        logs: /logs/i,
        camera: /camera/i,
      };

      const btn = screen.getByRole('button', { name: tabLabels[tab] });
      fireEvent.click(btn);
      expect(setActiveTab).toHaveBeenCalledWith(tab);
    });
  });

  it('applies active style to the currently selected tab', () => {
    render(<Header {...baseProps} activeTab="process" />);
    // The active tab button has the "font-bold" class applied
    const processBtn = screen.getByRole('button', { name: /processes/i });
    expect(processBtn.className).toMatch(/bg-cyan-500/);
  });
});
