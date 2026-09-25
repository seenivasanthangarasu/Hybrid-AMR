import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
it('supports keyboard selection and retains both choices when revisiting steps', async () => {
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
  await user.click(screen.getByRole('button', { name: /Mapping Mode.*Selected/ }));
  expect(screen.getByRole('heading', { name: 'Outdoor · Mapping Mode' })).toBeInTheDocument();
});
it.each(['Indoor', 'Outdoor', 'Hybrid'])(
  'supports all modes with %s and the test skip URL',
  (environment) => {
    window.history.replaceState({}, '', '/?skipWelcome=1');
    render(<Onboarding />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Choose ${environment}`, 'i') }));
    for (const mode of ['Manual Mode', 'Mapping Mode', 'Navigation Mode']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Choose ${mode}`, 'i') }));
      expect(screen.getByRole('heading', { name: `${environment} · ${mode}` })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Change mode/ }));
    }
  },
);
