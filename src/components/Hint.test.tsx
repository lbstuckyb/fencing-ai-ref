import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Hint from './Hint';

function renderHint() {
  render(<Hint>Held for one to two seconds.</Hint>);
  return screen.getByRole('button', { name: 'More info' });
}

describe('Hint', () => {
  it('keeps its text out of the page until asked', () => {
    renderHint();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on hover and hides when the pointer leaves', async () => {
    const button = renderHint();

    await userEvent.hover(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Held for one to two seconds.');
    expect(button).toHaveAccessibleDescription('Held for one to two seconds.');

    await userEvent.unhover(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on keyboard focus and closes on Escape', async () => {
    renderHint();

    await userEvent.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('toggles on a tap, where there is no hover', () => {
    const button = renderHint();

    // A touch press: pointer down, focus, then the click — and no hover at all.
    const tap = () => {
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      fireEvent.focus(button);
      fireEvent.click(button);
    };

    tap();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    tap();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
