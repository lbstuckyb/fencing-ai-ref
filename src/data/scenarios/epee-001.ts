import type { Scenario } from '../../scenario/schema';

/**
 * Épée has no priority, so there is nothing to analyse — only an outcome to
 * call. Two lights inside the lockout window are a hit for each, which is
 * `double_hit` here (distinct from the un-gestured "hit for each" reference
 * signal — see `data/rules.ts`).
 */
export const EPEE_001: Scenario = {
  id: 'epee-001',
  weapon: 'epee',
  video: '/scenarios/epee-001.mp4',
  title: 'Both lights, inside the lockout',
  difficulty: 1,
  expect: [{ signal: 'double_hit', side: null, say: ['hit for each', 'double touch'] }],
  explanation:
    'No priority in épée: both lights land within the lockout window, so it is a hit for each fencer.',
};
