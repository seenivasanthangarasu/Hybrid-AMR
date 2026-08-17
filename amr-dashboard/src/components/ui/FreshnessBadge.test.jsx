import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FreshnessBadge from './FreshnessBadge.jsx';

describe('FreshnessBadge', () => {
  it('renders nothing without a freshness object', () => {
    const { container } = render(<FreshnessBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows LIVE for fresh data', () => {
    render(<FreshnessBadge freshness={{ state: 'LIVE', tone: 'live', ageSec: 0 }} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('appends the age to a STALE badge', () => {
    render(<FreshnessBadge freshness={{ state: 'STALE', tone: 'stale', ageSec: 8 }} />);
    expect(screen.getByText(/STALE\s*8s/)).toBeInTheDocument();
  });

  it('omits the age when a stale topic has no known receive time', () => {
    render(<FreshnessBadge freshness={{ state: 'STALE', tone: 'stale', ageSec: null }} />);
    expect(screen.getByText('STALE')).toBeInTheDocument();
  });

  // NO_DATA carries no age — showing "NO DATA 0s" would imply a reading.
  it('renders NO_DATA as a spaced "NO DATA" label with no age', () => {
    render(<FreshnessBadge freshness={{ state: 'NO_DATA', tone: 'idle', ageSec: null }} />);
    expect(screen.getByText('NO DATA')).toBeInTheDocument();
    expect(screen.queryByText(/\d+s/)).not.toBeInTheDocument();
  });

  it('falls back to the raw state string for an unmapped state', () => {
    render(<FreshnessBadge freshness={{ state: 'DEGRADED', tone: 'warn', ageSec: null }} />);
    expect(screen.getByText('DEGRADED')).toBeInTheDocument();
  });

  it('renders only the dot, with no label, in dotOnly mode', () => {
    render(<FreshnessBadge freshness={{ state: 'LIVE', tone: 'live', ageSec: 0 }} dotOnly />);
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('passes an extra className through to the wrapper', () => {
    const { container } = render(
      <FreshnessBadge freshness={{ state: 'LIVE', tone: 'live', ageSec: 0 }} className="ml-2" />,
    );
    expect(container.firstChild).toHaveClass('ml-2');
  });
});
