import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Reference from './Reference';
import {
  CORE_SIGNALS,
  FIE_RULES_INDEX,
  REFERENCE_SIGNALS,
  RULE_DOCUMENTS,
  SIGNAL_GROUPS,
} from '../data/rules';

function renderReference() {
  return render(
    <MemoryRouter>
      <Reference />
    </MemoryRouter>
  );
}

/** The panel showing whichever signal is picked in the index. */
function detail(): HTMLElement {
  return screen.getByRole('region', { name: /selected signal/i });
}

describe('reference page', () => {
  it('lists all twenty t.63 signals exactly once', () => {
    expect(SIGNAL_GROUPS).toHaveLength(20);
    renderReference();
    for (const { id } of SIGNAL_GROUPS) {
      const core = CORE_SIGNALS.find((signal) => signal.id === id);
      const reference = REFERENCE_SIGNALS.find((signal) => signal.id === id);
      const label = (core ?? reference)!.label;
      expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);
    }
  });

  it('opens on a signal that can be drilled', () => {
    renderReference();
    expect(within(detail()).getByRole('link', { name: /^drill halt/i })).toHaveAttribute(
      'href',
      '/practice?signal=halt'
    );
  });

  it('links every core signal into the practice drill pinned to it', async () => {
    renderReference();
    for (const { id, label } of CORE_SIGNALS) {
      await userEvent.click(screen.getByRole('button', { name: label }));
      const link = within(detail()).getByRole('link', { name: `Drill ${label} ›` });
      expect(link).toHaveAttribute('href', `/practice?signal=${id}`);
    }
  });

  it('marks the ten not-yet-graded signals and gives them no pinned drill', async () => {
    renderReference();
    for (const { label } of REFERENCE_SIGNALS) {
      await userEvent.click(screen.getByRole('button', { name: label }));
      expect(within(detail()).getByText(/not graded/i)).toBeVisible();
      expect(within(detail()).queryByRole('link', { name: `Drill ${label} ›` })).toBeNull();
    }
  });

  it('groups signals under their rulebook headings', () => {
    renderReference();
    const preparatory = screen.getByRole('region', { name: /^preparatory$/i });
    for (const label of ['On guard', 'Ready?', 'Play', 'Halt']) {
      expect(within(preparatory).getByRole('button', { name: label })).toBeVisible();
    }

    const administrative = screen.getByRole('region', { name: /^administrative$/i });
    for (const label of ['Technical touch', 'Changing decision', 'Card', 'Winner']) {
      expect(within(administrative).getByRole('button', { name: label })).toBeVisible();
    }
  });

  it('narrows the index to one group', async () => {
    renderReference();
    await userEvent.click(screen.getByRole('button', { name: 'Awarding' }));
    expect(screen.getByRole('button', { name: 'Hit scored' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'On guard' })).not.toBeInTheDocument();
  });

  it('links the FIE index and every dated rulebook', () => {
    renderReference();
    for (const doc of [FIE_RULES_INDEX, ...RULE_DOCUMENTS]) {
      const link = document.querySelector(`a[href="${doc.url}"]`);
      expect(link).toHaveTextContent(doc.title);
      expect(link).toHaveAttribute('target', '_blank');
    }
  });
});
