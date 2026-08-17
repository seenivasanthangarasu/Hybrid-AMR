import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Control the ROS link state directly; DataFallback's whole job is deriving
// *why* data is missing from that state (spec REQ-20).
vi.mock('../hooks/useRosConnection.js', () => ({ default: vi.fn() }));
import useRosConnection from '../hooks/useRosConnection.js';
import DataFallback from './DataFallback.jsx';

function link({ status, attempt = 0, exhausted = false }) {
  useRosConnection.mockReturnValue({
    status,
    isConnected: status === 'connected',
    retry: { attempt, maxAttempts: 5, nextAttemptAt: null, exhausted },
    epoch: 0,
    reconnect: vi.fn(),
  });
}

describe('DataFallback cause resolution', () => {
  beforeEach(() => {
    useRosConnection.mockReset();
  });

  it('shows CONNECTING while the link is negotiating', () => {
    link({ status: 'connecting' });
    render(<DataFallback topic="/scan" />);
    expect(screen.getByText('CONNECTING')).toBeInTheDocument();
  });

  // A dropped link with a reconnect already scheduled must not read as OFFLINE,
  // or the operator will press RECONNECT for no reason.
  it('shows RETRYING when an automatic reconnect is pending', () => {
    link({ status: 'closed', attempt: 2 });
    render(<DataFallback topic="/scan" />);
    expect(screen.getByText('RETRYING')).toBeInTheDocument();
  });

  it('shows OFFLINE once the retry budget is exhausted', () => {
    link({ status: 'closed', attempt: 5, exhausted: true });
    render(<DataFallback topic="/scan" />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  it('shows OFFLINE when disconnected with no retry in flight', () => {
    link({ status: 'disconnected' });
    render(<DataFallback topic="/scan" />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  // Connected but silent is a robot/topic problem, not a link problem.
  it('shows NO SIGNAL when linked but the topic has never published', () => {
    link({ status: 'connected' });
    render(<DataFallback topic="/scan" hasEverData={false} />);
    expect(screen.getByText('NO SIGNAL')).toBeInTheDocument();
  });

  it('shows STALE with an age when the topic was live and went quiet', () => {
    link({ status: 'connected' });
    const eightSecondsAgo = Date.now() - 8000;
    render(<DataFallback topic="/scan" hasEverData lastReceivedAt={eightSecondsAgo} />);
    expect(screen.getByText('STALE · 8s')).toBeInTheDocument();
  });

  it('shows a bare STALE when the receive time is unknown', () => {
    link({ status: 'connected' });
    render(<DataFallback topic="/scan" hasEverData lastReceivedAt={null} />);
    expect(screen.getByText('STALE')).toBeInTheDocument();
  });

  it('renders the topic name alongside the cause when given', () => {
    link({ status: 'connected' });
    render(<DataFallback topic="/camera/image_raw" hasEverData={false} />);
    expect(screen.getByText('/camera/image_raw')).toBeInTheDocument();
  });

  it('omits the topic line entirely when no topic is given', () => {
    link({ status: 'connected' });
    render(<DataFallback hasEverData={false} />);
    expect(screen.getByText('NO SIGNAL')).toBeInTheDocument();
    expect(screen.queryByText(/^\//)).not.toBeInTheDocument();
  });

  // Non-ROS sources (the HTTP camera stream) bypass link derivation entirely.
  it('uses an explicit label verbatim and skips ROS-link derivation', () => {
    link({ status: 'disconnected' });
    render(<DataFallback topic="/camera" label="STREAM ERROR" tone="critical" />);
    expect(screen.getByText('STREAM ERROR')).toBeInTheDocument();
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument();
  });
});
