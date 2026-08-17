import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CommandFeedback from './CommandFeedback.jsx';

describe('CommandFeedback', () => {
  it('renders nothing with no command status', () => {
    const { container } = render(<CommandFeedback />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the outcome politely to assistive tech', () => {
    render(<CommandFeedback status={{ state: 'SENDING', label: 'START' }} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('shows an in-flight command as sending', () => {
    render(<CommandFeedback status={{ state: 'SENDING', label: 'START' }} />);
    expect(screen.getByText(/Sending START/)).toBeInTheDocument();
  });

  // The load-bearing assertion for this component: no command topic has a
  // robot-side ack, so success copy must say so rather than imply the robot moved.
  it('states outright that a sent command is unconfirmed', () => {
    render(<CommandFeedback status={{ state: 'SENT_UNCONFIRMED', label: 'PAUSE' }} />);
    expect(screen.getByText(/PAUSE sent — unconfirmed \(no robot ack\)/)).toBeInTheDocument();
  });

  it.each(['START', 'PAUSE', 'RESUME', 'STOP', 'EMERGENCY STOP'])(
    'never claims the robot acted on %s',
    (label) => {
      render(<CommandFeedback status={{ state: 'SENT_UNCONFIRMED', label }} />);
      const text = screen.getByRole('status').textContent;
      expect(text).toMatch(/unconfirmed/i);
      expect(text).not.toMatch(/\b(confirmed by|acknowledged|complete|done|succeeded)\b/i);
    },
  );

  it('shows a failure with its detail', () => {
    render(
      <CommandFeedback
        status={{ state: 'FAILED', label: 'STOP', detail: 'Not connected to ROSBridge' }}
      />,
    );
    expect(screen.getByText(/STOP failed — Not connected to ROSBridge/)).toBeInTheDocument();
  });

  it('shows a failure without a trailing dash when there is no detail', () => {
    render(<CommandFeedback status={{ state: 'FAILED', label: 'STOP' }} />);
    expect(screen.getByRole('status').textContent.trim()).toBe('STOP failed');
  });

  it('appends a 24-hour timestamp when one is given', () => {
    const at = new Date('2026-01-01T13:45:07');
    render(<CommandFeedback status={{ state: 'SENT_UNCONFIRMED', label: 'START', at }} />);
    expect(screen.getByRole('status').textContent).toContain('13:45:07');
  });

  it('omits the timestamp when none is given', () => {
    render(<CommandFeedback status={{ state: 'SENT_UNCONFIRMED', label: 'START' }} />);
    expect(screen.getByRole('status').textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  // An unknown state must degrade to the neutral in-flight treatment, never to
  // a success-looking one.
  it('falls back to the sending treatment for an unrecognised state', () => {
    render(<CommandFeedback status={{ state: 'WAT', label: 'START' }} />);
    expect(screen.getByText(/Sending START/)).toBeInTheDocument();
  });
});
