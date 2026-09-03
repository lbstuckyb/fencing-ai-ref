import type { Scenario } from '../../scenario/schema';

/**
 * Sabre keeps the priority set but drops `not_valid` — there is no off-target
 * hit to signal. A clean, unopposed attack is the simplest phrase in the
 * bank, which is why it is the sabre entry point.
 */
export const SABRE_001: Scenario = {
  id: 'sabre-001',
  weapon: 'sabre',
  video: '/scenarios/sabre-001.mp4',
  title: 'Attack right, unopposed',
  difficulty: 1,
  expect: [
    { signal: 'attack', side: 'right', say: ['attack'] },
    { signal: 'hit_scored', side: 'right', say: ['touch right', 'hit right'] },
  ],
  explanation: 'The attack from the right meets no answer and lands. The touch is right’s.',
};
