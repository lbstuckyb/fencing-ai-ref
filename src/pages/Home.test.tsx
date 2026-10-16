import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Home from './Home';

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe('home page', () => {
  it('offers exactly one way in, to the first step', () => {
    renderHome();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(/enter/i);
    expect(links[0]).toHaveAttribute('href', '/reference');
  });

  it('sums the app up in three figures', () => {
    renderHome();
    const figure = (label: string) => screen.getByText(label).parentElement;
    expect(figure('Signals')).toHaveTextContent('20');
    // The t.63 duration criterion: the reason hold time is graded at all.
    expect(figure('Hold')).toHaveTextContent('1–2 s');
    expect(figure('Weapons')).toHaveTextContent('3');
  });
});
