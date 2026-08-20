import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Sidebar from './Sidebar.jsx';

describe('Sidebar', () => {
  it('renders nothing when closed', () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders as a modal dialog when open, with every nav section', () => {
    render(<Sidebar open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('DASHBOARD LAYOUT')).toBeInTheDocument();
    expect(screen.getByText('PANELS')).toBeInTheDocument();
    expect(screen.getByText('DATA')).toBeInTheDocument();
    expect(screen.getByText('HELP')).toBeInTheDocument();
  });

  it('reflects edit mode on the layout toggle', () => {
    render(<Sidebar open editMode onClose={() => {}} />);
    expect(screen.getByRole('menuitemcheckbox', { name: /Edit layout/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('invokes the edit-mode handler without closing the sidebar', async () => {
    const onToggleEdit = vi.fn();
    render(<Sidebar open onClose={() => {}} onToggleEdit={onToggleEdit} />);
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Edit layout/ }));
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('invokes the layout reset handler without closing the sidebar', async () => {
    const onResetLayout = vi.fn();
    render(<Sidebar open onClose={() => {}} onResetLayout={onResetLayout} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Reset to default/ }));
    expect(onResetLayout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each([
    ['GNSS quality', 'onOpenGnssQuality'],
    ['Nav2 threshold tuning', 'onOpenNav2Threshold'],
    ['Data & backups', 'onOpenDataHandling'],
    ['Error reference', 'onOpenErrorReference'],
  ])('opening "%s" closes the sidebar and invokes its handler', async (label, propName) => {
    const onClose = vi.fn();
    const handler = vi.fn();
    render(<Sidebar open onClose={onClose} {...{ [propName]: handler }} />);
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(label) }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a nav handler is not wired', async () => {
    render(<Sidebar open onClose={() => {}} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Data & backups/ }));
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<Sidebar open onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click', async () => {
    const onClose = vi.fn();
    const { container } = render(<Sidebar open onClose={onClose} />);
    const backdrop = container.querySelector('[aria-hidden="true"]');
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus inside the panel', async () => {
    render(<Sidebar open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable[focusable.length - 1];
    last.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(focusable[0]);
  });
});
