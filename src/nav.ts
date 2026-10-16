/**
 * The path through the app, and the tools beside it. Consumed by the router's
 * tests and the top bar, so a step can never exist without a way to reach it.
 */

export interface Step {
  path: string;
  label: string;
  /** Shown beside the label: the order the steps are meant to be taken in. */
  number: string;
}

export const STEPS: readonly Step[] = [
  { path: '/reference', label: 'Learn', number: '01' },
  { path: '/practice', label: 'Practice', number: '02' },
  { path: '/scenarios', label: 'Referee', number: '03' },
] as const;

export interface Tool {
  path: string;
  label: string;
}

/** Tuning pages: reachable from the gear, not part of the path. */
export const TOOLS: readonly Tool[] = [
  { path: '/calibrate-signals', label: 'Your signals' },
  { path: '/calibrate', label: 'Readouts' },
] as const;
