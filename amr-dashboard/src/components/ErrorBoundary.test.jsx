import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

function Boom() {
  throw new Error('malformed ROS message');
}

describe('ErrorBoundary', () => {
  let consoleError;
  beforeEach(() => {
    // React logs the caught error itself; silence it so the run stays readable.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders its children untouched while nothing throws', () => {
    render(
      <ErrorBoundary label="LIDAR">
        <p>scan ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('scan ok')).toBeInTheDocument();
  });

  it('renders a labelled crash placeholder when a child throws', () => {
    render(
      <ErrorBoundary label="LIDAR">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('LIDAR CRASHED')).toBeInTheDocument();
  });

  it('falls back to a generic label when none is given', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('PANEL CRASHED')).toBeInTheDocument();
  });

  it('replaces the crashed subtree rather than rendering alongside it', () => {
    render(
      <ErrorBoundary label="LIDAR">
        <p>scan ok</p>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByText('scan ok')).not.toBeInTheDocument();
    expect(screen.getByText('LIDAR CRASHED')).toBeInTheDocument();
  });

  // The whole point of per-panel boundaries: a crashed telemetry widget must
  // not take the emergency stop down with it.
  it('isolates the crash so sibling panels stay mounted', () => {
    render(
      <div>
        <ErrorBoundary label="LIDAR">
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary label="CONTROL">
          <button type="button">EMERGENCY STOP</button>
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('LIDAR CRASHED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EMERGENCY STOP' })).toBeInTheDocument();
  });

  it('logs the failure with the panel label for diagnosis', () => {
    render(
      <ErrorBoundary label="SLAM">
        <Boom />
      </ErrorBoundary>,
    );
    const logged = consoleError.mock.calls.find((c) => c[0] === '[ErrorBoundary]');
    expect(logged).toBeTruthy();
    expect(logged[1]).toBe('SLAM');
    expect(logged[2]).toBeInstanceOf(Error);
    expect(logged[2].message).toBe('malformed ROS message');
  });

  it('stays in the crashed state on re-render rather than looping the throw', () => {
    const { rerender } = render(
      <ErrorBoundary label="LIDAR">
        <Boom />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary label="LIDAR">
        <p>recovered</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('LIDAR CRASHED')).toBeInTheDocument();
    expect(screen.queryByText('recovered')).not.toBeInTheDocument();
  });
});
