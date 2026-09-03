import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Reference from './Reference';
import { CORE_SIGNALS, REFERENCE_SIGNALS, SIGNAL_GROUPS } from '../data/rules';

function renderReference() {
  return render(
    <MemoryRouter>
      <Reference />
    </MemoryRouter>
  );
}

describe('reference page', () => {
  it('lists all twenty t.63 signals exactly once', () => {
    expect(SIGNAL_GROUPS).toHaveLength(20);
    renderReference();
    for (const { id } of SIGNAL_GROUPS) {
      const core = CORE_SIGNALS.find((signal) => signal.id === id);
      const reference = REFERENCE_SIGNALS.find((signal) => signal.id === id);
      const label = (core ?? reference)!.label;
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  it('links every core signal into the practice drill pinned to it', () => {
    renderReference();
    for (const { id, label } of CORE_SIGNALS) {
      const card = screen.getByText(label).closest('li')!;
      const link = within(card).getByRole('link', { name: /practice this one/i });
      expect(link).toHaveAttribute('href', `/practice?signal=${id}`);
    }
  });

  it('marks the ten not-yet-graded signals and gives them no practice link', () => {
    renderReference();
    for (const { label } of REFERENCE_SIGNALS) {
      const card = screen.getByText(label).closest('li')!;
      expect(within(card).getByText(/not graded/i)).toBeVisible();
      expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    }
  });

  it('groups signals under their rulebook headings', () => {
    renderReference();
    const preparatory = screen.getByRole('region', { name: /^preparatory$/i });
    for (const label of ['On guard', 'Ready?', 'Play', 'Halt']) {
      expect(within(preparatory).getByText(label)).toBeVisible();
    }

    const administrative = screen.getByRole('region', { name: /^administrative$/i });
    for (const label of ['Technical touch', 'Changing decision', 'Card', 'Winner']) {
      expect(within(administrative).getByText(label)).toBeVisible();
    }
  });
});
