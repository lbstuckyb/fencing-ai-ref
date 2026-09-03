/**
 * FIE rules data: where the rulebook lives, and what each weapon changes about
 * the calls a referee can legally make.
 *
 * Two things live here rather than in the pages, because later stages consume
 * them as data: the document links (Home, stage 3) and the weapon table
 * (scenario bank + call-phase signal palette, stage 16).
 */

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
  title: 'FIE rules & documents',
  url: 'https://fie.org/fie/documents/rules',
  description: 'The official index — always points at the edition currently in force.',
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
    title: 'Technical rules',
    url: 'https://static.fie.org/uploads/40/204138-Technical%20rules%20August%202026%20ang.pdf',
    description: 'Conduct of the bout, right of way, and the referee signals in Article t.63.',
  },
  {
    id: 'organisation',
    title: 'Organisation rules',
    url: 'https://static.fie.org/uploads/40/204123-Organisation%20rules%20August%202026%20ang.pdf',
    description: 'Competition formats, seeding, and the conduct of events.',
  },
  {
    id: 'material',
    title: 'Material rules',
    url: 'https://static.fie.org/uploads/40/204157-book%20material%20August%202026%20ang.pdf',
    description: 'Weapons, clothing, and scoring apparatus specifications.',
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

/**
 * The core 10 of the 20 t.63 signals — the scope this app grades by gesture.
 * The ids are the canonical spec ids: `signals/specs.ts` (stage 11) authors one
 * SignalSpec per id, and the weapon table below refers to the same ids, so the
 * two can never drift.
 */
export const CORE_SIGNALS = [
  { id: 'halt', label: 'Halt' },
  { id: 'attack', label: 'Attack' },
  { id: 'parry', label: 'Parry' },
  { id: 'point_in_line', label: 'Point in line' },
  { id: 'hit_scored', label: 'Hit scored' },
  { id: 'hit_against', label: 'Hit against' },
  { id: 'not_valid', label: 'Not valid' },
  { id: 'double_hit', label: 'Double hit' },
  { id: 'simultaneous', label: 'Simultaneous' },
  { id: 'nothing', label: 'Nothing' },
] as const;

export type CoreSignalId = (typeof CORE_SIGNALS)[number]['id'];

const SIGNAL_LABELS: Record<CoreSignalId, string> = Object.fromEntries(
  CORE_SIGNALS.map((signal) => [signal.id, signal.label])
) as Record<CoreSignalId, string>;

export function signalLabel(id: CoreSignalId): string {
  return SIGNAL_LABELS[id];
}

/* -------------------------------------------------------------------------- */
/* All twenty t.63 signals — reference page                                   */
/* -------------------------------------------------------------------------- */

/** The four groupings t.63/Figure 3 itself uses, in rulebook order. */
export type SignalGroup = 'preparatory' | 'phrase_analysis' | 'awarding' | 'administrative';

export const SIGNAL_GROUP_LABELS: Record<SignalGroup, string> = {
  preparatory: 'Preparatory',
  phrase_analysis: 'Phrase analysis',
  awarding: 'Awarding',
  administrative: 'Administrative',
};

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

export const REFERENCE_SIGNALS: readonly ReferenceSignal[] = [
  {
    id: 'on_guard',
    label: 'On guard',
    description: 'Signals the fencers to take the on-guard position before the phrase begins.',
  },
  {
    id: 'ready',
    label: 'Ready?',
    description: 'Asks both fencers whether they are ready to fence.',
  },
  {
    id: 'play',
    label: 'Play',
    description: 'Starts the phrase: the fencers may now fence.',
  },
  {
    id: 'incorrect',
    label: 'Incorrect',
    description:
      "Marks that a fencer's action was incorrectly performed, without awarding a touch.",
  },
  {
    id: 'no',
    label: 'No',
    description:
      "Rejects a fencer's request — for example, an appeal to stop the phrase or claim a touch.",
  },
  {
    id: 'hit_for_each',
    label: 'Hit for each',
    description:
      'Awards the touch to both fencers, distinct from the priority-resolved Double hit call.',
  },
  {
    id: 'technical_touch',
    label: 'Technical touch',
    description:
      'Awards a touch caused by a material or apparatus fault rather than a fencing action.',
  },
  {
    id: 'changing_decision',
    label: 'Changing decision',
    description:
      'Reverses a previous call, typically after consulting the jury or reviewing video.',
  },
  {
    id: 'card',
    label: 'Card',
    description:
      'Shows a yellow, red or black card: a warning, a penalty touch, or exclusion from the competition.',
  },
  {
    id: 'winner',
    label: 'Winner',
    description: 'Declares the winner of the bout.',
  },
] as const;

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

export const WEAPON_RULES: readonly WeaponRule[] = [
  {
    id: 'epee',
    label: 'Épée',
    rightOfWay: false,
    target: 'The whole body, mask to feet.',
    hasOffTarget: false,
    summary:
      'No priority: whoever lands first scores, and two lights inside the lockout give a hit to each. The referee calls the outcome, never the phrase.',
    excluded: {
      attack: 'Épée has no right of way, so the phrase is never analysed for priority.',
      parry: 'Parry is a priority call, and épée does not use priority.',
      point_in_line: 'A line only matters because it takes priority — which épée does not award.',
      not_valid: 'The whole body is target, so no hit can land off-target.',
      simultaneous:
        'Simultaneous is a priority call. In épée, two lights inside the lockout are a hit for each.',
    },
  },
  {
    id: 'foil',
    label: 'Foil',
    rightOfWay: true,
    target: 'The trunk, front and back, plus the lower part of the mask bib.',
    hasOffTarget: true,
    summary:
      'Full priority set. Both lights resolve to one fencer, to no touch when the actions are genuinely simultaneous, or to an off-target hit that stops the bout without scoring.',
    excluded: {
      double_hit:
        'Priority resolves both lights to one fencer or to no touch — foil never awards a hit to each.',
    },
  },
  {
    id: 'sabre',
    label: 'Sabre',
    rightOfWay: true,
    target: 'Everything above the waist except the hands — mask, arms and trunk.',
    hasOffTarget: false,
    summary:
      'Full priority set, and no off-target: a blow outside the target area simply does not register, so there is nothing to signal.',
    excluded: {
      double_hit:
        'Priority resolves both lights to one fencer or to no touch — sabre never awards a hit to each.',
      not_valid: 'Sabre has no off-target hit, so there is no invalid hit to signal.',
    },
  },
] as const;

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
