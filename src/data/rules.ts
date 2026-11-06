/**
 * FIE rules data: where the rulebook lives, and what each weapon changes about
 * the calls a referee can legally make.
 *
 * Two things live here rather than in the pages, because later stages consume
 * them as data: the document links (Home, stage 3) and the weapon table
 * (scenario bank + call-phase signal palette, stage 16).
 */

import { tx } from '../i18n';

/* -------------------------------------------------------------------------- */
/* Rule documents                                                             */
/* -------------------------------------------------------------------------- */

export interface RuleDocument {
  id: string;
  title: string;
  url: string;
  description: string;
}

/**
 * The durable link. The FIE reorganises its uploads between editions, but this
 * index page always resolves to whatever the current rulebook is — so it is the
 * primary link everywhere in the UI, and the dated PDFs below are secondary.
 */
export const FIE_RULES_INDEX: RuleDocument = {
  id: 'fie-rules-index',
  get title() {
    return tx('rules.index.title');
  },
  url: 'https://fie.org/fie/documents/rules',
  get description() {
    return tx('rules.index.description');
  },
};

/**
 * Edition the deep links below were captured from. These URLs are
 * version-stamped and *will* rot at the next revision, so the edition is shown
 * next to every link: a stale label is visible, a stale link is not.
 */
export const RULE_DOCUMENTS_EDITION = 'August 2026';

export const RULE_DOCUMENTS: readonly RuleDocument[] = [
  {
    id: 'technical',
    get title() {
      return tx('rules.technical.title');
    },
    url: 'https://static.fie.org/uploads/40/204138-Technical%20rules%20August%202026%20ang.pdf',
    get description() {
      return tx('rules.technical.description');
    },
  },
  {
    id: 'organisation',
    get title() {
      return tx('rules.organisation.title');
    },
    url: 'https://static.fie.org/uploads/40/204123-Organisation%20rules%20August%202026%20ang.pdf',
    get description() {
      return tx('rules.organisation.description');
    },
  },
  {
    id: 'material',
    get title() {
      return tx('rules.material.title');
    },
    url: 'https://static.fie.org/uploads/40/204157-book%20material%20August%202026%20ang.pdf',
    get description() {
      return tx('rules.material.description');
    },
  },
] as const;

/** The article this app grades against — cited throughout the UI. */
export const SIGNAL_ARTICLE = {
  article: 't.63',
  figure: 'Figure 3',
  pages: '21–24',
  /** Quoted criterion that makes hold duration part of the grade, not a UX choice. */
  durationRule: 'Each signal must last 1–2 seconds, be expressive and correctly made.',
} as const;

/* -------------------------------------------------------------------------- */
/* Core signals                                                               */
/* -------------------------------------------------------------------------- */

/** A signal id whose label is read in the current language each time it is asked for. */
function coreSignal<const Id extends string>(id: Id): { readonly id: Id; readonly label: string } {
  return {
    id,
    get label() {
      return tx(`signals.${id}.label`);
    },
  };
}

/**
 * The core 10 of the 20 t.63 signals — the scope this app grades by gesture.
 * The ids are the canonical spec ids: `signals/specs.ts` (stage 11) authors one
 * SignalSpec per id, and the weapon table below refers to the same ids, so the
 * two can never drift.
 */
export const CORE_SIGNALS = [
  coreSignal('halt'),
  coreSignal('attack'),
  coreSignal('parry'),
  coreSignal('point_in_line'),
  coreSignal('hit_scored'),
  coreSignal('hit_against'),
  coreSignal('not_valid'),
  coreSignal('double_hit'),
  coreSignal('simultaneous'),
  coreSignal('nothing'),
] as const;

export type CoreSignalId = (typeof CORE_SIGNALS)[number]['id'];

export function signalLabel(id: CoreSignalId): string {
  return tx(`signals.${id}.label`);
}

/* -------------------------------------------------------------------------- */
/* All twenty t.63 signals — reference page                                   */
/* -------------------------------------------------------------------------- */

/** The four groupings t.63/Figure 3 itself uses, in rulebook order. */
export type SignalGroup = 'preparatory' | 'phrase_analysis' | 'awarding' | 'administrative';

export function signalGroupLabel(group: SignalGroup): string {
  return tx(`groups.${group}`);
}

/**
 * The ten signals outside the graded core: procedural calls (On guard, Ready?,
 * Play), phrase-analysis calls with no distinct gesture to grade yet (Incorrect,
 * No), and administrative signals (a shown card, a declared winner). Reference
 * page only — `signals/specs.ts` has no `SignalSpec` for any of these, so
 * `/practice` cannot drill them.
 */
export interface ReferenceSignal {
  id: string;
  label: string;
  description: string;
}

function referenceSignal(id: string): ReferenceSignal {
  return {
    id,
    get label() {
      return tx(`signals.${id}.label`);
    },
    get description() {
      return tx(`signals.${id}.description`);
    },
  };
}

export const REFERENCE_SIGNALS: readonly ReferenceSignal[] = [
  referenceSignal('on_guard'),
  referenceSignal('ready'),
  referenceSignal('play'),
  referenceSignal('incorrect'),
  referenceSignal('no'),
  referenceSignal('hit_for_each'),
  referenceSignal('technical_touch'),
  referenceSignal('changing_decision'),
  referenceSignal('card'),
  referenceSignal('winner'),
];

/**
 * All twenty t.63 signals, grouped and in rulebook order — the spine of the
 * reference page. An id resolves against `signals/specs.ts` (graded) or
 * `REFERENCE_SIGNALS` above (not graded), never both.
 */
export const SIGNAL_GROUPS: readonly { id: string; group: SignalGroup }[] = [
  { id: 'on_guard', group: 'preparatory' },
  { id: 'ready', group: 'preparatory' },
  { id: 'play', group: 'preparatory' },
  { id: 'halt', group: 'preparatory' },
  { id: 'point_in_line', group: 'phrase_analysis' },
  { id: 'attack', group: 'phrase_analysis' },
  { id: 'parry', group: 'phrase_analysis' },
  { id: 'incorrect', group: 'phrase_analysis' },
  { id: 'no', group: 'phrase_analysis' },
  { id: 'hit_scored', group: 'awarding' },
  { id: 'hit_against', group: 'awarding' },
  { id: 'not_valid', group: 'awarding' },
  { id: 'double_hit', group: 'awarding' },
  { id: 'hit_for_each', group: 'awarding' },
  { id: 'simultaneous', group: 'awarding' },
  { id: 'nothing', group: 'awarding' },
  { id: 'technical_touch', group: 'administrative' },
  { id: 'changing_decision', group: 'administrative' },
  { id: 'card', group: 'administrative' },
  { id: 'winner', group: 'administrative' },
] as const;

/* -------------------------------------------------------------------------- */
/* Weapon rules                                                               */
/* -------------------------------------------------------------------------- */

export type Weapon = 'epee' | 'foil' | 'sabre';

export interface WeaponRule {
  id: Weapon;
  label: string;
  /** Whether priority decides both lights. */
  rightOfWay: boolean;
  /** Target area, in plain words. */
  target: string;
  /** Whether an off-target hit exists — this is what makes `not_valid` callable. */
  hasOffTarget: boolean;
  summary: string;
  /**
   * Calls that cannot occur under this weapon's rules, each with the reason.
   * This is the authored side of the table; `allowedSignals()` derives the
   * legal palette from it, so adding an exclusion cannot leave a stale list.
   */
  excluded: Partial<Record<CoreSignalId, string>>;
}

/**
 * A weapon's rules, with its words read in the current language. `excluded` is
 * keyed by the calls the weapon rules out; each value is the reason, in words.
 */
function weaponRuleFor(
  id: Weapon,
  flags: { rightOfWay: boolean; hasOffTarget: boolean },
  excludedIds: readonly CoreSignalId[]
): WeaponRule {
  const excluded: Partial<Record<CoreSignalId, string>> = {};
  for (const signal of excludedIds) {
    Object.defineProperty(excluded, signal, {
      enumerable: true,
      get: () => tx(`weapons.${id}.excluded.${signal}`),
    });
  }
  return {
    id,
    ...flags,
    get label() {
      return tx(`weapons.${id}.label`);
    },
    get target() {
      return tx(`weapons.${id}.target`);
    },
    get summary() {
      return tx(`weapons.${id}.summary`);
    },
    excluded,
  };
}

export const WEAPON_RULES: readonly WeaponRule[] = [
  weaponRuleFor('epee', { rightOfWay: false, hasOffTarget: false }, [
    'attack',
    'parry',
    'point_in_line',
    'not_valid',
    'simultaneous',
  ]),
  weaponRuleFor('foil', { rightOfWay: true, hasOffTarget: true }, ['double_hit']),
  weaponRuleFor('sabre', { rightOfWay: true, hasOffTarget: false }, ['double_hit', 'not_valid']),
];

const WEAPON_BY_ID: Record<Weapon, WeaponRule> = Object.fromEntries(
  WEAPON_RULES.map((weapon) => [weapon.id, weapon])
) as Record<Weapon, WeaponRule>;

export function weaponRule(weapon: Weapon): WeaponRule {
  return WEAPON_BY_ID[weapon];
}

/** The core signals a referee may call for this weapon, in canonical order. */
export function allowedSignals(weapon: Weapon): readonly CoreSignalId[] {
  const { excluded } = weaponRule(weapon);
  return CORE_SIGNALS.map((signal) => signal.id).filter((id) => !(id in excluded));
}

export function isSignalAllowed(weapon: Weapon, id: CoreSignalId): boolean {
  return !(id in weaponRule(weapon).excluded);
}

/** Why this call cannot occur under this weapon, or `undefined` if it can. */
export function exclusionReason(weapon: Weapon, id: CoreSignalId): string | undefined {
  return weaponRule(weapon).excluded[id];
}
