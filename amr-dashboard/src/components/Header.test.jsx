import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Header from './Header.jsx';

const idleRetry = { attempt: 0, maxAttempts: 6, nextAttemptAt: null, exhausted: false };

function renderHeader(props = {}) {
  return render(
    <Header
      connectionStatus="connected"
      mode="OUTDOOR"
      isModeDefault={false}
      retry={idleRetry}
      {...props}
    />,
  );
}

describe('Header link status', () => {
  it.each([
    ['connected', 'ROSBRIDGE LINKED'],
    ['connecting', 'CONNECTING'],
    ['error', 'CONNECTION ERROR'],
    ['closed', 'LINK CLOSED'],
    ['disconnected', 'DISCONNECTED'],
  ])('labels %s as "%s"', (status, label) => {
    renderHeader({ connectionStatus: status });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // An unknown status must not render a blank chip — the operator would read
  // an empty indicator as "nothing wrong".
  it('falls back to DISCONNECTED for an unrecognised status', () => {
    renderHeader({ connectionStatus: 'wat' });
    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
  });

  it('announces the link state politely to assistive tech', () => {
    renderHeader({ connectionStatus: 'closed' });
    const region = screen.getByLabelText('Connection: LINK CLOSED');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});

describe('Header reconnect control', () => {
  it.each(['error', 'closed', 'disconnected'])('offers RECONNECT when the link is %s', (status) => {
    renderHeader({ connectionStatus: status, onReconnect: vi.fn() });
    expect(screen.getByRole('button', { name: /RECONNECT/ })).toBeInTheDocument();
  });

  it.each(['connected', 'connecting'])('hides RECONNECT while the link is %s', (status) => {
    renderHeader({ connectionStatus: status, onReconnect: vi.fn() });
    expect(screen.queryByRole('button', { name: /RECONNECT/ })).not.toBeInTheDocument();
  });

  it('hides RECONNECT when no handler is wired', () => {
    renderHeader({ connectionStatus: 'closed' });
    expect(screen.queryByRole('button', { name: /RECONNECT/ })).not.toBeInTheDocument();
  });

  it('invokes the handler when pressed', async () => {
    const onReconnect = vi.fn();
    renderHeader({ connectionStatus: 'closed', onReconnect });
    await userEvent.click(screen.getByRole('button', { name: /RECONNECT/ }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('explains that a press starts a fresh attempt once retries are spent', () => {
    renderHeader({
      connectionStatus: 'closed',
      onReconnect: vi.fn(),
      retry: { attempt: 6, maxAttempts: 6, nextAttemptAt: null, exhausted: true },
    });
    expect(screen.getByRole('button', { name: /RECONNECT/ })).toHaveAttribute(
      'title',
      expect.stringContaining('fresh attempt'),
    );
  });
});

describe('Header retry indicator', () => {
  it('shows nothing while no automatic retry is in flight', () => {
    renderHeader({ connectionStatus: 'connected' });
    expect(screen.queryByText(/AUTO-RETRY/)).not.toBeInTheDocument();
  });

  // A silent retry is worse than none: the operator cannot tell whether the
  // dashboard is recovering or has stalled.
  it('counts down to the next attempt', () => {
    renderHeader({
      connectionStatus: 'closed',
      retry: { attempt: 2, maxAttempts: 6, nextAttemptAt: Date.now() + 5000, exhausted: false },
    });
    expect(screen.getByText('AUTO-RETRY 2/6 · 5s')).toBeInTheDocument();
  });

  it('clamps the countdown at zero rather than going negative', () => {
    renderHeader({
      connectionStatus: 'closed',
      retry: { attempt: 3, maxAttempts: 6, nextAttemptAt: Date.now() - 4000, exhausted: false },
    });
    expect(screen.getByText('AUTO-RETRY 3/6 · 0s')).toBeInTheDocument();
  });

  // Running out of attempts is stated outright, not signalled by the chip
  // quietly disappearing.
  it('says so loudly when the retry budget is spent', () => {
    renderHeader({
      connectionStatus: 'closed',
      retry: { attempt: 6, maxAttempts: 6, nextAttemptAt: null, exhausted: true },
    });
    expect(screen.getByText('AUTO-RETRY GAVE UP (6)')).toBeInTheDocument();
    expect(screen.queryByText(/AUTO-RETRY \d\/6/)).not.toBeInTheDocument();
  });

  it('tolerates a missing retry object', () => {
    renderHeader({ connectionStatus: 'closed', retry: undefined });
    expect(screen.queryByText(/AUTO-RETRY/)).not.toBeInTheDocument();
  });
});

describe('Header mode display', () => {
  it.each(['INDOOR', 'OUTDOOR'])('shows the %s mode', (mode) => {
    renderHeader({ mode });
    expect(screen.getByText(mode)).toBeInTheDocument();
  });

  // A UI-default view selection must be marked as such so it is never read as
  // a sensor reading from /robot_mode.
  it('marks a defaulted mode as "(default)"', () => {
    renderHeader({ mode: 'OUTDOOR', isModeDefault: true });
    expect(screen.getByText('(default)')).toBeInTheDocument();
  });

  it('does not mark a mode that came from the topic', () => {
    renderHeader({ mode: 'INDOOR', isModeDefault: false });
    expect(screen.queryByText('(default)')).not.toBeInTheDocument();
  });
});

describe('Header theme toggle', () => {
  it('exposes its pressed state and flips the label on click', async () => {
    renderHeader();
    const button = screen.getByRole('button', { name: /Switch to (dark|light) theme/ });
    const wasPressed = button.getAttribute('aria-pressed');
    await userEvent.click(button);
    expect(button.getAttribute('aria-pressed')).not.toBe(wasPressed);
  });

  it('drives the document data-theme attribute', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: /Switch to (dark|light) theme/ }));
    expect(['dark', 'light']).toContain(document.documentElement.getAttribute('data-theme'));
  });
});
