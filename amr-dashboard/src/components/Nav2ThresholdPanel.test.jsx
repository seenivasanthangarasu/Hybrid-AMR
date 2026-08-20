import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Only the service's methods are faked — Nav2ParameterError is imported for
// real so its message-building logic (REJECTED uses `cause` as the message)
// matches production exactly, rather than a second, drifting copy here.
vi.mock('../services/Nav2ParameterService.js', async () => {
  const actual = await vi.importActual('../services/Nav2ParameterService.js');
  return {
    ...actual,
    default: {
      getParameters: vi.fn().mockResolvedValue(new Map()),
      setParameter: vi.fn(),
    },
  };
});

import Nav2ThresholdPanel from './Nav2ThresholdPanel.jsx';
import Nav2ParameterService, { Nav2ParameterError } from '../services/Nav2ParameterService.js';
import { NAV2_THRESHOLDS } from '../config/nav2Thresholds.js';

const maxVelX = NAV2_THRESHOLDS.find((t) => t.id === 'controller_server.FollowPath.max_vel_x');

describe('Nav2ThresholdPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Nav2ParameterService.getParameters.mockResolvedValue(new Map());
  });

  it('disables every APPLY button with a visible reason when disconnected', () => {
    render(<Nav2ThresholdPanel connectionStatus="disconnected" />);
    const applyButtons = screen.getAllByRole('button', { name: 'APPLY' });
    expect(applyButtons).toHaveLength(NAV2_THRESHOLDS.length);
    for (const btn of applyButtons) expect(btn).toBeDisabled();
    expect(screen.getByText(/parameter tuning unavailable/i)).toBeInTheDocument();
    expect(Nav2ParameterService.getParameters).not.toHaveBeenCalled();
  });

  it('fetches current values on mount when connected and shows the NAV2_UNAVAILABLE banner if none come back', async () => {
    render(<Nav2ThresholdPanel connectionStatus="connected" />);
    await waitFor(() => expect(Nav2ParameterService.getParameters).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/no nav2 parameter server responding/i)).toBeInTheDocument();
    expect(screen.getAllByText('NO LIVE VALUE', { exact: false })).toHaveLength(NAV2_THRESHOLDS.length);
  });

  it('populates live values and hides the unavailable banner when the gatekeeper responds', async () => {
    Nav2ParameterService.getParameters.mockResolvedValue(new Map([[maxVelX.id, 0.6]]));
    render(<Nav2ThresholdPanel connectionStatus="connected" />);
    await waitFor(() => expect(screen.getByText(/LIVE 0.6 m\/s/)).toBeInTheDocument());
    expect(screen.queryByText(/no nav2 parameter server responding/i)).not.toBeInTheDocument();
  });

  it('rejects an out-of-range value locally and never calls setParameter', async () => {
    render(<Nav2ThresholdPanel connectionStatus="connected" />);
    await waitFor(() => expect(Nav2ParameterService.getParameters).toHaveBeenCalled());

    const input = screen.getByLabelText(new RegExp(`${maxVelX.label} \\(${maxVelX.unit}`, 'i'));
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.click(within(input.closest('li')).getByRole('button', { name: 'APPLY' }));

    expect(await screen.findByText(/must be 0\.05–1\.5 m\/s/)).toBeInTheDocument();
    expect(Nav2ParameterService.setParameter).not.toHaveBeenCalled();
  });

  it('shows SENT_UNCONFIRMED (never a false "confirmed") after a successful apply', async () => {
    Nav2ParameterService.setParameter.mockResolvedValue(undefined);
    render(<Nav2ThresholdPanel connectionStatus="connected" />);
    await waitFor(() => expect(Nav2ParameterService.getParameters).toHaveBeenCalled());

    const input = screen.getByLabelText(new RegExp(`${maxVelX.label} \\(${maxVelX.unit}`, 'i'));
    fireEvent.change(input, { target: { value: '0.6' } });
    fireEvent.click(within(input.closest('li')).getByRole('button', { name: 'APPLY' }));

    expect(await screen.findByText(/sent — unconfirmed/i)).toBeInTheDocument();
    expect(screen.queryByText(/confirmed/i, { exact: false })).not.toHaveTextContent('CONFIRMED');
    expect(Nav2ParameterService.setParameter).toHaveBeenCalledWith(maxVelX.id, 0.6);
  });

  it('shows FAILED with a visible message when the gatekeeper rejects the value server-side', async () => {
    Nav2ParameterService.setParameter.mockRejectedValue(
      new Nav2ParameterError('REJECTED', 'outside allowed range [0.05, 1.5]'),
    );
    render(<Nav2ThresholdPanel connectionStatus="connected" />);
    await waitFor(() => expect(Nav2ParameterService.getParameters).toHaveBeenCalled());

    const input = screen.getByLabelText(new RegExp(`${maxVelX.label} \\(${maxVelX.unit}`, 'i'));
    fireEvent.change(input, { target: { value: '1.4' } }); // in-range client-side, but the server declines
    fireEvent.click(within(input.closest('li')).getByRole('button', { name: 'APPLY' }));

    expect(await screen.findByText(/failed — outside allowed range/i)).toBeInTheDocument();
  });

  it('shows FAILED with "no response" when the gatekeeper never answers', async () => {
    Nav2ParameterService.setParameter.mockRejectedValue(new Nav2ParameterError('NO_RESPONSE'));
    render(<Nav2ThresholdPanel connectionStatus="connected" />);
    await waitFor(() => expect(Nav2ParameterService.getParameters).toHaveBeenCalled());

    const input = screen.getByLabelText(new RegExp(`${maxVelX.label} \\(${maxVelX.unit}`, 'i'));
    fireEvent.change(input, { target: { value: '0.6' } });
    fireEvent.click(within(input.closest('li')).getByRole('button', { name: 'APPLY' }));

    expect(await screen.findByText(/failed — no response/i)).toBeInTheDocument();
  });
});
