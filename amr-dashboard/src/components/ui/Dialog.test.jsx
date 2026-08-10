import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dialog from './Dialog.jsx';

function open(props = {}) {
  return render(
    <Dialog open title="Link lost" onClose={props.onClose ?? (() => {})} {...props}>
      <p>body text</p>
      <button type="button">Action</button>
    </Dialog>,
  );
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} title="Link lost" onClose={() => {}}>
        <p>body text</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes an accessible, labelled modal', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The title must be the accessible name, not just visible text.
    expect(dialog).toHaveAccessibleName('Link lost');
    expect(screen.getByText('body text')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the close button', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog so keyboard users land inside it', () => {
    open();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('keeps Tab inside the dialog', () => {
    open();
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll('button');
    const last = focusable[focusable.length - 1];
    last.focus();
    // Tabbing off the last control wraps to the first instead of escaping.
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(focusable[0]).toHaveFocus();
  });
});
