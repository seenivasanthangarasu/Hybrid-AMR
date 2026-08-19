/**
 * CameraPanel.test.jsx
 *
 * Tests for the MJPEG Camera panel:
 *  - Initial loading state
 *  - Error overlay when stream unavailable
 *  - "Live" state after image loads successfully
 *  - Settings panel toggle
 *  - Quick-switch topic pills
 *  - Reload button increments stream key (causes remount of <img>)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CameraPanel from '../../components/CameraPanel.jsx';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CameraPanel – initial loading state', () => {
  it('shows "Connecting..." status badge on initial render', () => {
    render(<CameraPanel backendConnected={true} />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('shows the connecting-to-stream overlay', () => {
    render(<CameraPanel backendConnected={true} />);
    expect(screen.getByText(/connecting to stream/i)).toBeInTheDocument();
  });
});

describe('CameraPanel – error state after timeout', () => {
  it('transitions to error after 6 second watchdog fires', async () => {
    render(<CameraPanel backendConnected={false} />);
    // Advance past the 6s load watchdog wrapped in act
    await act(async () => {
      vi.advanceTimersByTime(6100);
    });
    expect(screen.getByText(/stream unavailable/i)).toBeInTheDocument();
  });

  it('shows "Camera Stream Unavailable" error overlay after timeout', async () => {
    render(<CameraPanel backendConnected={false} />);
    vi.advanceTimersByTime(6100);
    await waitFor(() => {
      expect(screen.getByText(/camera stream unavailable/i)).toBeInTheDocument();
    });
  });

  it('shows "Retry Stream" button in error state', async () => {
    render(<CameraPanel backendConnected={false} />);
    vi.advanceTimersByTime(6100);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry stream/i })).toBeInTheDocument();
    });
  });
});

describe('CameraPanel – "live" state when image loads', () => {
  it('transitions to Live when img onLoad fires', async () => {
    render(<CameraPanel backendConnected={true} />);
    const img = screen.getByAltText(/mjpeg camera stream/i);
    fireEvent.load(img);
    await waitFor(() => {
      expect(screen.getByText(/live/i)).toBeInTheDocument();
    });
  });

  it('transitions to error when img onError fires', async () => {
    render(<CameraPanel backendConnected={true} />);
    const img = screen.getByAltText(/mjpeg camera stream/i);
    fireEvent.error(img);
    await waitFor(() => {
      expect(screen.getByText(/stream unavailable/i)).toBeInTheDocument();
    });
  });
});

describe('CameraPanel – settings panel', () => {
  it('settings panel is hidden initially', () => {
    render(<CameraPanel backendConnected={true} />);
    expect(screen.queryByText(/camera topic preset/i)).not.toBeInTheDocument();
  });

  it('opens settings panel when Settings button is clicked', () => {
    render(<CameraPanel backendConnected={true} />);
    fireEvent.click(screen.getByTitle(/stream settings/i));
    expect(screen.getByText(/camera topic preset/i)).toBeInTheDocument();
  });

  it('shows the active stream URL in settings panel', () => {
    render(<CameraPanel backendConnected={true} />);
    fireEvent.click(screen.getByTitle(/stream settings/i));
    // The URL code block should contain the base VIDEO_SERVER_URL
    expect(screen.getByText(/localhost:8080/)).toBeInTheDocument();
  });
});

describe('CameraPanel – topic preset pills', () => {
  it('renders all 4 preset topic pills', () => {
    render(<CameraPanel backendConnected={true} />);
    expect(screen.getByText('/camera/color/image_raw')).toBeInTheDocument();
    expect(screen.getByText('/camera/depth/image_raw')).toBeInTheDocument();
    expect(screen.getByText('/image_raw')).toBeInTheDocument();
    expect(screen.getByText('/usb_cam/image_raw')).toBeInTheDocument();
  });

  it('first preset pill is active by default', () => {
    render(<CameraPanel backendConnected={true} />);
    const firstPill = screen.getByRole('button', { name: '/camera/color/image_raw' });
    expect(firstPill.className).toMatch(/bg-cyan-500/);
  });
});

describe('CameraPanel – reload button', () => {
  it('resets to loading state when Reload button is clicked', async () => {
    render(<CameraPanel backendConnected={true} />);
    // First trigger error so we have something to reload from
    vi.advanceTimersByTime(6100);
    await waitFor(() => screen.getByText(/stream unavailable/i));

    fireEvent.click(screen.getByTitle(/reload stream/i));
    // Should go back to loading overlay
    await waitFor(() => {
      expect(screen.getByText(/connecting to stream/i)).toBeInTheDocument();
    });
  });
});
