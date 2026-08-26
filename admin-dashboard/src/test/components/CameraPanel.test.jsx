/**
 * CameraPanel.test.jsx
 *
 * Tests for the Camera panel:
 *  - Initial render with iframe stream viewer
 *  - Settings panel toggle & URL readout
 *  - Quick-switch topic pills
 *  - Player mode selection (iframe / img)
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CameraPanel from '../../components/CameraPanel.jsx';

describe('CameraPanel – rendering & player', () => {
  it('renders Live status badge and MJPEG stream image on initial render', () => {
    render(<CameraPanel backendConnected={true} />);
    const img = screen.getByAltText(/mjpeg camera stream/i);
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('/stream?topic=/camera/camera/color/image_raw');
  });

  it('renders quick switch topic buttons', () => {
    render(<CameraPanel backendConnected={true} />);
    expect(screen.getByRole('button', { name: '/camera/camera/color/image_raw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '/camera/camera/depth/image_rect_raw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '/camera/color/image_raw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '/image_raw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '/usb_cam/image_raw' })).toBeInTheDocument();
  });

  it('switches topic when a preset pill is clicked', () => {
    render(<CameraPanel backendConnected={true} />);
    const rawPill = screen.getByRole('button', { name: '/image_raw' });
    fireEvent.click(rawPill);
    const img = screen.getByAltText(/mjpeg camera stream/i);
    expect(img.getAttribute('src')).toContain('/stream?topic=/image_raw');
  });
});

describe('CameraPanel – settings panel', () => {
  it('settings panel is hidden initially and opens when button clicked', () => {
    render(<CameraPanel backendConnected={true} />);
    expect(screen.queryByText(/camera topic preset/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/stream settings/i));
    expect(screen.getByText(/camera topic preset/i)).toBeInTheDocument();
  });

  it('shows active stream URL and open in new tab link in settings', () => {
    render(<CameraPanel backendConnected={true} />);
    fireEvent.click(screen.getByTitle(/stream settings/i));
    expect(screen.getAllByText(/8080/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /open stream_viewer in new tab/i })).toBeInTheDocument();
  });
});
