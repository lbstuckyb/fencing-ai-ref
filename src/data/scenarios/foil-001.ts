import type { Scenario } from '../../scenario/schema';

/**
 * Foil exercises the full priority set: an attack, a parry-riposte answering
 * it, and the award. The riposte itself carries no gesture — see the schema's
 * `signal: null` — so it appears in the sequence for the referee to learn but
 * is skipped when the call phase is graded.
 */
export const FOIL_001: Scenario = {
  id: 'foil-001',
  weapon: 'foil',
  video: '/scenarios/foil-001.mp4',
  title: 'Attack right, parry-riposte left',
  difficulty: 2,
  expect: [
    { signal: 'attack', side: 'right', say: ['attack'] },
    { signal: 'parry', side: 'left', say: ['parry'] },
    { signal: null, side: null, say: ['riposte'] },
    { signal: 'hit_scored', side: 'left', say: ['touch left', 'hit left'] },
  ],
  explanation:
    'The attack from the right has priority; left parries it and the riposte lands. The touch is left’s.',
};
