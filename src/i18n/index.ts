import { useSyncExternalStore } from 'react';
import en from './en';
import es from './es';
import fr from './fr';

/**
 * The app's language, and the one function every string goes through.
 *
 * The current language lives in this module rather than in React state, so
 * code outside components — the evaluator's coaching lines, the grader's
 * verdicts, the data files' labels — can translate at the moment it builds a
 * string. Components read it with `t()` while rendering; `Layout` re-mounts the
 * page whenever it changes, so nothing has to subscribe one by one.
 */

export type Lang = 'en' | 'es' | 'fr';
export const LANGS: readonly Lang[] = ['en', 'es', 'fr'];

/** A dictionary with the same keys as English, any wording. */
export type Dictionary = DeepStrings<typeof en>;
type DeepStrings<T> = { readonly [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** Every dotted path to a string in the dictionary, e.g. `nav.learn`. */
export type MessageKey = Leaves<typeof en>;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Lang, Dictionary> = { en, es, fr };
const STORAGE_KEY = 'far-lang';

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/** Saved choice, then the browser's language, then English. */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Storage blocked: fall through to the browser's preference.
  }
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language.slice(0, 2);
  return isLang(preferred) ? preferred : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not remembered across visits, but still applied now.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language, re-rendering the caller when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

function lookup(dictionary: Dictionary, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** The string for `key` in the current language. */
export function t(key: MessageKey, vars?: Vars): string {
  return tx(key, vars);
}

/**
 * `t` for keys built at runtime (`signals.${id}.label`). Falls back to English,
 * then to the key itself — so plain text passed in comes back unchanged.
 */
export function tx(key: string, vars?: Vars): string {
  const text = lookup(DICTIONARIES[current], key) ?? lookup(en, key) ?? key;
  return fill(text, vars);
}

/** Whether a runtime-built key exists, for text that may or may not be translated. */
export function has(key: string): boolean {
  return lookup(en, key) !== undefined;
}

/** First letter upper-cased, for a phrase that opens a sentence in one language and not another. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
