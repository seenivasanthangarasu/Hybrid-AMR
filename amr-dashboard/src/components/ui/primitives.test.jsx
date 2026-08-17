import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SignalDot from './SignalDot.jsx';
import SignalChip from './SignalChip.jsx';
import PanelHeader from './PanelHeader.jsx';
import NoDataBadge from '../NoDataBadge.jsx';
import { TONES } from './signalTones.js';

describe('SignalDot', () => {
  it.each(Object.keys(TONES))('applies the %s tone class', (tone) => {
    const { container } = render(<SignalDot tone={tone} />);
    expect(container.firstChild.className).toContain(TONES[tone].dot);
  });

  it('defaults to the idle tone', () => {
    const { container } = render(<SignalDot />);
    expect(container.firstChild.className).toContain(TONES.idle.dot);
  });

  // The pulse is reserved for attention-worthy states; a permanently pulsing
  // dashboard trains the operator to ignore it.
  it('pulses only when asked', () => {
    const { container: quiet } = render(<SignalDot tone="live" />);
    expect(quiet.firstChild.className).not.toContain('animate-pulse-slow');
    const { container: pulsing } = render(<SignalDot tone="live" pulse />);
    expect(pulsing.firstChild.className).toContain('animate-pulse-slow');
  });

  it('passes an extra className through', () => {
    const { container } = render(<SignalDot className="mr-1" />);
    expect(container.firstChild).toHaveClass('mr-1');
  });
});

describe('SignalChip', () => {
  it('renders its label', () => {
    render(<SignalChip tone="live" label="ROSBRIDGE LINKED" />);
    expect(screen.getByText('ROSBRIDGE LINKED')).toBeInTheDocument();
  });

  // Same state, same colour, wherever it appears — the dot and the label must
  // not drift onto different tones.
  it.each(Object.keys(TONES))('renders the dot and label in the same %s tone', (tone) => {
    const { container } = render(<SignalChip tone={tone} label="STATE" />);
    expect(container.querySelector('span > span').className).toContain(TONES[tone].dot);
    expect(screen.getByText('STATE').className).toContain(TONES[tone].text);
  });

  it('forwards the pulse to its dot', () => {
    const { container } = render(<SignalChip tone="warn" label="CONNECTING" pulse />);
    expect(container.querySelector('span > span').className).toContain('animate-pulse-slow');
  });

  it('degrades an unknown tone to idle rather than dropping the label', () => {
    render(<SignalChip tone="chartreuse" label="STATE" />);
    expect(screen.getByText('STATE').className).toContain(TONES.idle.text);
  });
});

describe('PanelHeader', () => {
  it('renders the title as a heading', () => {
    render(<PanelHeader title="STATUS" />);
    expect(screen.getByRole('heading', { name: 'STATUS' })).toBeInTheDocument();
  });

  it('renders a right-slot node alongside the title', () => {
    render(<PanelHeader title="LIDAR" right={<span>badge</span>} />);
    expect(screen.getByRole('heading', { name: 'LIDAR' })).toBeInTheDocument();
    expect(screen.getByText('badge')).toBeInTheDocument();
  });

  it('renders without a right slot', () => {
    const { container } = render(<PanelHeader title="MAP" />);
    expect(container.firstChild.childNodes).toHaveLength(1);
  });
});

describe('NoDataBadge', () => {
  it('defaults to the NO DATA label', () => {
    render(<NoDataBadge />);
    expect(screen.getByText('NO DATA')).toBeInTheDocument();
  });

  it('accepts a more specific label', () => {
    render(<NoDataBadge label="NO CAMERA STREAM" />);
    expect(screen.getByText('NO CAMERA STREAM')).toBeInTheDocument();
    expect(screen.queryByText('NO DATA')).not.toBeInTheDocument();
  });
});
