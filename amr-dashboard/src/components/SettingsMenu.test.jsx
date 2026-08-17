import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SettingsMenu from './SettingsMenu.jsx';

const open = () => userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));

// The popover unmounts through an AnimatePresence exit transition, so "closed"
// is only observable once that animation has run.
const expectClosed = () =>
  waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

describe('SettingsMenu', () => {
  it('starts closed and reports it via aria-expanded', () => {
    render(<SettingsMenu />);
    expect(screen.getByRole('button', { name: 'Dashboard settings' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens and closes on repeated presses', async () => {
    render(<SettingsMenu />);
    await open();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await open();
    await expectClosed();
  });

  it('reflects edit mode on the layout toggle', async () => {
    render(<SettingsMenu editMode />);
    await open();
    expect(screen.getByRole('menuitemcheckbox', { name: /Edit layout/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('invokes the edit-mode handler', async () => {
    const onToggleEdit = vi.fn();
    render(<SettingsMenu onToggleEdit={onToggleEdit} />);
    await open();
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Edit layout/ }));
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
  });

  it('invokes the layout reset handler', async () => {
    const onReset = vi.fn();
    render(<SettingsMenu onReset={onReset} />);
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Reset to default/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('closes itself when opening the error reference', async () => {
    const onOpenErrorReference = vi.fn();
    render(<SettingsMenu onOpenErrorReference={onOpenErrorReference} />);
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Error reference/ }));
    expect(onOpenErrorReference).toHaveBeenCalledTimes(1);
    await expectClosed();
  });

  it('does not throw when the error-reference handler is not wired', async () => {
    render(<SettingsMenu />);
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Error reference/ }));
    await expectClosed();
  });

  it('closes on Escape', async () => {
    render(<SettingsMenu />);
    await open();
    await userEvent.keyboard('{Escape}');
    await expectClosed();
  });

  it('closes on an outside click', async () => {
    render(
      <div>
        <SettingsMenu />
        <button type="button">elsewhere</button>
      </div>,
    );
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    await expectClosed();
  });

  it('stays open when clicking inside the menu', async () => {
    render(<SettingsMenu />);
    await open();
    await userEvent.click(screen.getByText('DASHBOARD LAYOUT'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  // The listeners are only attached while open; leaving them bound would make
  // every stray click and keypress on the dashboard run this component's code.
  it('detaches its document listeners once closed', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    render(<SettingsMenu />);
    await open();
    const added = add.mock.calls.filter(([e]) => e === 'mousedown' || e === 'keydown').length;
    await open();
    const removed = remove.mock.calls.filter(([e]) => e === 'mousedown' || e === 'keydown').length;
    expect(removed).toBe(added);
    add.mockRestore();
    remove.mockRestore();
  });
});
