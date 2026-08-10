import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the command service so no real ROS publish happens; we only assert the
// two-click confirm/timeout state machine (spec REQ-09).
vi.mock('../services/RobotCommandService.js', () => {
  class CommandError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  return {
    default: {
      emergencyStop: vi.fn(() => ({ state: 'SENT_UNCONFIRMED' })),
    },
    CommandError,
  };
});

import ControlPanel from './ControlPanel.jsx';
import RobotCommandService from '../services/RobotCommandService.js';

describe('ControlPanel e-stop two-click confirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arms on the first click and dispatches only on the second', () => {
    render(<ControlPanel connectionStatus="connected" />);

    fireEvent.click(screen.getByRole('button', { name: 'EMERGENCY STOP' }));
    expect(screen.getByRole('button', { name: 'CONFIRM EMERGENCY STOP' })).toBeInTheDocument();
    expect(RobotCommandService.emergencyStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM EMERGENCY STOP' }));
    expect(RobotCommandService.emergencyStop).toHaveBeenCalledTimes(1);
  });

  it('disarms after the confirm window elapses without a second click', () => {
    render(<ControlPanel connectionStatus="connected" />);

    fireEvent.click(screen.getByRole('button', { name: 'EMERGENCY STOP' }));
    expect(screen.getByRole('button', { name: 'CONFIRM EMERGENCY STOP' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('button', { name: 'EMERGENCY STOP' })).toBeInTheDocument();
    expect(RobotCommandService.emergencyStop).not.toHaveBeenCalled();
  });

  it('disables commands with a visible reason when disconnected', () => {
    render(<ControlPanel connectionStatus="disconnected" />);
    expect(screen.getByRole('button', { name: 'EMERGENCY STOP' })).toBeDisabled();
    expect(screen.getByText(/commands unavailable/i)).toBeInTheDocument();
  });
});
