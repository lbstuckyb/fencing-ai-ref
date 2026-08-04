/**
 * Theme preference handling.
 *
 * Three states, not two: an explicit `light`/`dark` choice, or `system` (the
 * default) which follows the OS. Kept free of React so it can run from the
 * pre-paint inline script in index.html as well as from the toggle component —
 * the two must agree on the storage key and the class name or the page flashes
 * the wrong theme on load.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'far:theme';
export const DARK_CLASS = 'dark';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

/** Reads the stored preference, falling back to `system` for anything unusable. */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    // Storage can throw in private-mode / blocked-cookie contexts.
    return 'system';
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Preference simply does not persist; the session still works.
  }
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/** Applies the resolved theme to <html> and returns what it resolved to. */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle(DARK_CLASS, resolved === 'dark');
  return resolved;
}

/** Cycle order for the toggle button: system → light → dark → system. */
export function nextPreference(preference: ThemePreference): ThemePreference {
  const index = PREFERENCES.indexOf(preference);
  return PREFERENCES[(index + 1) % PREFERENCES.length];
}
