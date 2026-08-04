import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Home from './Home';
import { FIE_RULES_INDEX, RULE_DOCUMENTS, RULE_DOCUMENTS_EDITION } from '../data/rules';

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe('home page', () => {
  it('states that processing is on-device', () => {
    renderHome();
    const privacy = screen.getByRole('region', { name: /on your device/i });
    expect(privacy).toHaveTextContent(/no backend/i);
    expect(privacy).toHaveTextContent(/no video, image or landmark ever leaves your machine/i);
  });

  it('cites the article the signals are graded against', () => {
    renderHome();
    expect(screen.getByText(/FIE Technical Rules, Article t\.63/i)).toBeVisible();
    expect(screen.getByText(/1–2 seconds/)).toBeVisible();
  });

  it('links into each of the three modes', () => {
    renderHome();
    for (const [name, path] of [
      ['Reference', '/reference'],
      ['Practice', '/practice'],
      ['Scenarios', '/scenarios'],
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(name, 'i') })).toHaveAttribute(
        'href',
        path
      );
    }
  });

  it('links the FIE index and every dated document', () => {
    renderHome();
    const rules = screen.getByRole('region', { name: /the rulebook/i });

    expect(
      within(rules).getByRole('link', { name: new RegExp(FIE_RULES_INDEX.title, 'i') })
    ).toHaveAttribute('href', FIE_RULES_INDEX.url);

    for (const doc of RULE_DOCUMENTS) {
      const link = within(rules).getByRole('link', { name: new RegExp(doc.title, 'i') });
      expect(link).toHaveAttribute('href', doc.url);
      // External PDFs; opening in place would lose the drill state.
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    }
  });

  it('labels the dated links with their edition so staleness is visible', () => {
    renderHome();
    const rules = screen.getByRole('region', { name: /the rulebook/i });
    for (const doc of RULE_DOCUMENTS) {
      const link = within(rules).getByRole('link', { name: new RegExp(doc.title, 'i') });
      expect(link).toHaveTextContent(`${RULE_DOCUMENTS_EDITION} edition`);
    }
    // And the note that says the dated links will rot.
    expect(rules).toHaveTextContent(/will break when the FIE publishes the next one/i);
  });

  it('shows, per weapon, which calls cannot occur', () => {
    renderHome();
    const weapons = screen.getByRole('region', { name: /what changes by weapon/i });

    expect(within(weapons).getByText('Épée')).toBeVisible();
    expect(within(weapons).getByText(/no right of way/i)).toBeVisible();
    // Épée excludes the whole priority set; foil and sabre exclude the hit for each.
    expect(within(weapons).getAllByTitle(/no right of way/i).length).toBeGreaterThan(0);
    expect(within(weapons).getAllByText('Double hit')).toHaveLength(2);
  });
});
