import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { setLang } from './i18n';
import { STEPS, TOOLS } from './nav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

/** Route path → the <h1> that route is expected to render. */
const HEADINGS: Record<string, RegExp> = {
  '/': /make\s*the call/i,
  '/reference': /^learn$/i,
  '/practice': /^drill$/i,
  '/scenarios': /^referee$/i,
  '/about': /^about$/i,
  '/calibrate': /^calibrate$/i,
  '/calibrate-signals': /^expert calibration$/i,
};

describe('routing', () => {
  it.each(Object.keys(HEADINGS))('renders %s directly', async (path) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: HEADINGS[path] })).toBeVisible();
  });

  it('renders a not-found page for an unknown route', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByRole('heading', { level: 1, name: /page not found/i })).toBeVisible();
  });
});

describe('navigation', () => {
  it('offers the three steps, in order, and nothing else in the main nav', () => {
    renderAt('/');
    const links = screen
      .getByRole('navigation', { name: /main/i })
      .querySelectorAll<HTMLAnchorElement>('a');
    expect([...links].map((link) => link.getAttribute('href'))).toEqual(
      STEPS.map((step) => step.path)
    );
  });

  it('walks the path from home: enter, then step to step', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: /enter/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^learn$/i })).toBeVisible();

    await user.click(screen.getByRole('link', { name: /drill halt/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^drill$/i })).toBeVisible();

    await user.click(screen.getByRole('link', { name: /^referee ›$/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^referee$/i })).toBeVisible();
  });

  it('marks the current step as the active page', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Referee' }));
    expect(screen.getByRole('link', { name: 'Referee' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Learn' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the tuning pages behind the gear, with a way between them', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Tuning' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /expert calibration/i })
    ).toBeVisible();

    const tabs = screen.getByRole('navigation', { name: /tuning/i });
    for (const tool of TOOLS) {
      expect(tabs.querySelector(`a[href="${tool.path}"]`)).toHaveTextContent(tool.label);
    }
  });
});

describe('layout', () => {
  it('links to the About page, which states the on-device processing guarantee', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: 'About' }));
    expect(await screen.findByRole('heading', { level: 1, name: /^about$/i })).toBeVisible();
    expect(screen.getByText(/no video ever leaves your browser/i)).toBeVisible();
  });
});

describe('language', () => {
  afterEach(() => setLang('en'));

  it('switches the whole app from the selector', async () => {
    const user = userEvent.setup();
    renderAt('/about');

    await user.click(screen.getByRole('button', { name: 'es' }));
    expect(screen.getByRole('button', { name: 'es' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /aprender/i })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: /acerca de/i })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'fr' }));
    expect(screen.getByRole('link', { name: /apprendre/i })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: /à propos/i })).toBeVisible();
  });
});
