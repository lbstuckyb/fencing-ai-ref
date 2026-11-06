import { afterEach, describe, expect, it } from 'vitest';
import en from './en';
import es from './es';
import fr from './fr';
import { getLang, setLang, t, tx } from './index';

/** Every [path, text] pair in a dictionary. */
function entries(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    entries(value, path ? `${path}.${key}` : key)
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const english = new Map(entries(en));

describe.each([
  ['es', es],
  ['fr', fr],
] as const)('%s dictionary', (_, dictionary) => {
  const translated = entries(dictionary);

  it('has every English key and no others', () => {
    expect(translated.map(([path]) => path).sort()).toEqual([...english.keys()].sort());
  });

  it('fills in the same values as English', () => {
    for (const [path, text] of translated) {
      expect(placeholders(text), path).toEqual(placeholders(english.get(path) ?? ''));
    }
  });

  it('leaves nothing blank that English fills', () => {
    for (const [path, text] of translated) {
      if (english.get(path)) expect(text.trim(), path).not.toBe('');
    }
  });
});

describe('t', () => {
  afterEach(() => setLang('en'));

  it('reads the current language and fills values', () => {
    setLang('fr');
    expect(getLang()).toBe('fr');
    expect(t('nav.learn')).toBe('Apprendre');
    expect(t('common.startsIn', { n: 3 })).toBe('Début dans 3…');
  });

  it('remembers the choice and labels the document with it', () => {
    setLang('es');
    expect(localStorage.getItem('far-lang')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('passes text that is not a key through unchanged', () => {
    expect(tx('Open your hand fully')).toBe('Open your hand fully');
  });
});
