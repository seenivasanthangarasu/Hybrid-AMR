import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CameraView from './CameraView.jsx';

describe('CameraView component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders live stream mode by default with resolution options', () => {
    render(<CameraView />);

    expect(screen.getByText('LIVE STREAM')).toBeInTheDocument();
    expect(screen.getByText('SNAPSHOT')).toBeInTheDocument();

    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('360p')).toBeInTheDocument();
    expect(screen.getByText('720p')).toBeInTheDocument();
    expect(screen.getByText('1080p')).toBeInTheDocument();

    const img = screen.getByAltText('Live camera stream');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('width=1280');
    expect(img.getAttribute('src')).toContain('height=720');
  });

  it('switches resolution when clicking 360p or 1080p button', () => {
    render(<CameraView />);

    const btn360 = screen.getByText('360p');
    fireEvent.click(btn360);

    let img = screen.getByAltText('Live camera stream');
    expect(img.getAttribute('src')).toContain('width=640');
    expect(img.getAttribute('src')).toContain('height=360');

    const btn1080 = screen.getByText('1080p');
    fireEvent.click(btn1080);

    img = screen.getByAltText('Live camera stream');
    expect(img.getAttribute('src')).toContain('width=1920');
    expect(img.getAttribute('src')).toContain('height=1080');
  });

  it('switches to snapshot mode and displays interval presets and controls', () => {
    render(<CameraView />);

    const snapModeBtn = screen.getByText('SNAPSHOT');
    fireEvent.click(snapModeBtn);

    expect(screen.getByAltText('Camera snapshot')).toBeInTheDocument();

    // Check presets are rendered
    expect(screen.getByText('1f / 1s')).toBeInTheDocument();
    expect(screen.getByText('1f / 2s')).toBeInTheDocument();
    expect(screen.getByText('1f / 5s')).toBeInTheDocument();
    expect(screen.getByText('1f / 10s')).toBeInTheDocument();
    expect(screen.getByText('Custom...')).toBeInTheDocument();

    // Controls
    expect(screen.getByText('Snap')).toBeInTheDocument();
    expect(screen.getByText('⏸')).toBeInTheDocument();
    expect(screen.getByText('↓ Save')).toBeInTheDocument();
  });

  it('configures custom snapshot interval', () => {
    render(<CameraView />);

    fireEvent.click(screen.getByText('SNAPSHOT'));
    fireEvent.click(screen.getByText('Custom...'));

    const framesInput = screen.getByTitle('Number of frames');
    const secondsInput = screen.getByTitle('Seconds');
    const setBtn = screen.getByText('Set');

    fireEvent.change(framesInput, { target: { value: '2' } });
    fireEvent.change(secondsInput, { target: { value: '10' } });
    fireEvent.click(setBtn);

    expect(screen.getByText(/2 frames \/ 10s/i)).toBeInTheDocument();
  });

  it('triggers manual snapshot when Snap button is clicked', () => {
    render(<CameraView />);

    fireEvent.click(screen.getByText('SNAPSHOT'));
    const initialSrc = screen.getByAltText('Camera snapshot').getAttribute('src');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const snapBtn = screen.getByText('Snap');
    fireEvent.click(snapBtn);

    const newSrc = screen.getByAltText('Camera snapshot').getAttribute('src');
    expect(newSrc).not.toBe(initialSrc);
  });

  it('reports error on image failure and displays fallback', () => {
    const onStreamState = vi.fn();
    render(<CameraView onStreamState={onStreamState} />);

    const img = screen.getByAltText('Live camera stream');
    fireEvent.error(img);

    expect(screen.getByText('NO CAMERA STREAM')).toBeInTheDocument();
    expect(onStreamState).toHaveBeenCalledWith(false);

    // On reload recovery
    fireEvent.load(img);
    expect(onStreamState).toHaveBeenCalledWith(true);
  });

  it('stops event propagation on compact view controls', () => {
    const onPanelClick = vi.fn();
    render(
      <div onClick={onPanelClick}>
        <CameraView compact />
      </div>
    );

    const btn360 = screen.getByText('360p');
    fireEvent.click(btn360);

    expect(onPanelClick).not.toHaveBeenCalled();
  });
});
