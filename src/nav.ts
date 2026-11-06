/**
 * The path through the app, and the tools beside it. Consumed by the router's
 * tests and the top bar, so a step can never exist without a way to reach it.
 */

import { t } from './i18n';
import type { MessageKey } from './i18n';

export interface Step {
  path: string;
  label: string;
  /** Shown beside the label: the order the steps are meant to be taken in. */
  number: string;
}

/** The label is looked up each time it is read, so it follows the language. */
function step(path: string, key: MessageKey, number: string): Step {
  return {
    path,
    get label() {
      return t(key);
    },
    number,
  };
}

export const STEPS: readonly Step[] = [
  step('/reference', 'nav.learn', '01'),
  step('/practice', 'nav.practice', '02'),
  step('/scenarios', 'nav.referee', '03'),
];

export interface Tool {
  path: string;
  label: string;
}

/** Tuning pages: reachable from the gear, not part of the path. */
export const TOOLS: readonly Tool[] = [
  {
    path: '/calibrate-signals',
    get label() {
      return t('nav.yourSignals');
    },
  },
  {
    path: '/calibrate',
    get label() {
      return t('nav.readouts');
    },
  },
];
