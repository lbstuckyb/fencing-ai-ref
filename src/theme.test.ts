import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  DARK_CLASS,
  isThemePreference,
  nextPreference,
  readStoredPreference,
  resolveTheme,
  storePreference,
  THEME_STORAGE_KEY,
} from './theme';

/** jsdom has no real matchMedia; stub it with a fixed answer. */
function stubSystemDark(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove(DARK_CLASS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preference storage', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readStoredPreference()).toBe('system');
  });

  it('round-trips a stored preference', () => {
    storePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredPreference()).toBe('dark');
  });

  it('falls back to system for a corrupted value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
    expect(readStoredPreference()).toBe('system');
  });

  it('recognises only the three valid preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('honours an explicit choice regardless of the system setting', () => {
    stubSystemDark(true);
    expect(resolveTheme('light')).toBe('light');
    stubSystemDark(false);
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('follows the system setting when set to system', () => {
    stubSystemDark(true);
    expect(resolveTheme('system')).toBe('dark');
    stubSystemDark(false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme', () => {
  it('adds and removes the dark class on <html>', () => {
    stubSystemDark(false);

    applyTheme('dark');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);

    applyTheme('light');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);

    applyTheme('system');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });
});

describe('nextPreference', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });
});
