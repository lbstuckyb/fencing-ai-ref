/**
 * Single source of truth for the five routes — consumed by both the router in
 * App.tsx and the header nav, so a route can never exist without a way to reach
 * it (or vice versa).
 */

export interface NavItem {
  path: string;
  label: string;
  /** One-line description, used on the Home mode cards in stage 3. */
  blurb: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'Home',
    blurb: 'What this is, and the FIE rules it grades against.',
  },
  {
    path: '/reference',
    label: 'Reference',
    blurb: 'The t.63 signal library — every official signal, described.',
  },
  {
    path: '/practice',
    label: 'Practice',
    blurb: 'Drill a single signal; graded live on shape and hold duration.',
  },
  {
    path: '/scenarios',
    label: 'Scenarios',
    blurb: 'Referee a clip live: call the phrase as it happens and get graded per weapon.',
  },
  {
    path: '/calibrate',
    label: 'Calibrate',
    blurb: 'Live joint readouts — the numbers the signal specs are tuned against.',
  },
  {
    path: '/calibrate-signals',
    label: 'Expert calibration',
    blurb: 'Record yourself making each signal correctly, and grade against that instead.',
  },
] as const;
