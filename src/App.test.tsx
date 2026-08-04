import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';
import { NAV_ITEMS } from './nav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

/** Route path → the <h1> that route is expected to render. */
const HEADINGS: Record<string, RegExp> = {
  '/': /fencing referee trainer/i,
  '/reference': /signal reference/i,
  '/practice': /signal practice/i,
  '/scenarios': /^scenarios$/i,
  '/calibrate': /^calibrate$/i,
};

describe('routing', () => {
  it.each(NAV_ITEMS.map((item) => [item.path, item.label]))('renders %s directly', async (path) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: HEADINGS[path] })).toBeVisible();
  });

  it('renders a not-found page for an unknown route', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByRole('heading', { level: 1, name: /page not found/i })).toBeVisible();
  });
});

describe('navigation', () => {
  it('links to every route from the header nav', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: /main/i });
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
    }
    expect(nav).toBeInTheDocument();
  });

  it('moves between pages when a nav link is clicked', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Calibrate' }));
    expect(await screen.findByRole('heading', { level: 1, name: /^calibrate$/i })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Practice' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /signal practice/i })
    ).toBeVisible();
  });

  it('marks the current route as the active page', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Scenarios' }));
    expect(screen.getByRole('link', { name: 'Scenarios' })).toHaveAttribute('aria-current', 'page');
    // The Home link must not stay active on a child route.
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});

describe('layout', () => {
  it('states the on-device processing guarantee in the footer', () => {
    renderAt('/');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/no video leaves the browser/i);
  });
});
