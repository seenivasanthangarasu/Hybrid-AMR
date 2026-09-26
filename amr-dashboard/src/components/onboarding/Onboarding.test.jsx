import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import Onboarding from './Onboarding.jsx';

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

it('advances after 2.6 seconds and moves focus to the new heading', () => {
  vi.useFakeTimers();
  render(<Onboarding />);
  expect(screen.getByRole('heading', { name: 'Welcome to Xtrmbly' })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(2600));
  expect(screen.getByRole('heading', { name: 'Where will you use Xtrmbly?' })).toHaveFocus();
});

it('supports keyboard selection, retains choices, and excludes mapping mode for outdoor', async () => {
  const user = userEvent.setup();
  render(<Onboarding />);
  await user.click(screen.getByRole('button', { name: /Skip introduction/ }));
  const indoor = screen.getByRole('button', { name: /Choose indoor/ });
  indoor.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: /Indoor · Change/ })).toBeInTheDocument();
  const mapping = screen.getByRole('button', { name: /Choose mapping mode/ });
  mapping.focus();
  await user.keyboard(' ');
  expect(screen.getByRole('heading', { name: 'Indoor · Mapping Mode' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: /Change mode/ }));
  expect(screen.getByRole('button', { name: /Mapping Mode.*Selected/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.click(screen.getByRole('button', { name: /Back to environments/ }));
  expect(screen.getByRole('button', { name: /Indoor.*Selected/ })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: /Choose outdoor/ }));

  // Outdoor environment MUST NOT have Mapping Mode
  expect(screen.queryByRole('button', { name: /Choose mapping mode/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Choose manual mode/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Choose navigation mode/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /Choose navigation mode/i }));
  expect(screen.getByRole('heading', { name: 'Outdoor · Navigation Mode' })).toBeInTheDocument();
});

it('supports all 3 modes with Indoor and the test skip URL', () => {
  window.history.replaceState({}, '', '/?skipWelcome=1');
  render(<Onboarding />);
  fireEvent.click(screen.getByRole('button', { name: /Choose indoor/i }));
  for (const mode of ['Manual Mode', 'Mapping Mode', 'Navigation Mode']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Choose ${mode}`, 'i') }));
    expect(screen.getByRole('heading', { name: `Indoor · ${mode}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Change mode/ }));
  }
});

it('disables the Hybrid environment option on setup', () => {
  window.history.replaceState({}, '', '/?skipWelcome=1');
  render(<Onboarding />);
  const hybridButton = screen.getByRole('button', { name: /Hybrid/i });
  expect(hybridButton).toBeDisabled();
  expect(hybridButton).toHaveAttribute('aria-disabled', 'true');
  expect(hybridButton).toHaveTextContent(/Disabled/i);
});

it('supports only manual and navigation modes for Outdoor, omitting Mapping Mode', () => {
  window.history.replaceState({}, '', '/?skipWelcome=1');
  render(<Onboarding />);
  fireEvent.click(screen.getByRole('button', { name: /Choose outdoor/i }));
  expect(screen.queryByRole('button', { name: /Choose mapping mode/i })).not.toBeInTheDocument();

  for (const mode of ['Manual Mode', 'Navigation Mode']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Choose ${mode}`, 'i') }));
    expect(screen.getByRole('heading', { name: `Outdoor · ${mode}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Change mode/ }));
  }
});

it('invokes onComplete with selected configuration when Open Workspace is clicked', async () => {
  const onComplete = vi.fn();
  window.history.replaceState({}, '', '/?skipWelcome=1');
  render(<Onboarding onComplete={onComplete} />);

  fireEvent.click(screen.getByRole('button', { name: /Choose indoor/i }));
  fireEvent.click(screen.getByRole('button', { name: /Choose navigation mode/i }));

  const openBtn = screen.getByRole('button', { name: /Open Navigation Mode/i });
  expect(openBtn).toBeInTheDocument();
  fireEvent.click(openBtn);

  expect(onComplete).toHaveBeenCalledWith({
    environment: 'indoor',
    mode: 'navigation',
    activeSegment: 'indoor',
  });
});
