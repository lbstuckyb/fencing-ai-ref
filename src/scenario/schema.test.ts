import { describe, expect, it } from 'vitest';
import { gestureSteps, validateScenario } from './schema';
import type { Scenario } from './schema';
import { SCENARIOS } from '../data/scenarios';

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test-001',
    weapon: 'foil',
    video: '/scenarios/test-001.mp4',
    title: 'Test scenario',
    difficulty: 1,
    expect: [{ signal: 'attack', side: 'right', say: ['attack'] }],
    explanation: 'A test scenario.',
    ...overrides,
  };
}

describe('gestureSteps', () => {
  it('drops the spoken-only steps', () => {
    const withRiposte = scenario({
      expect: [
        { signal: 'attack', side: 'right', say: ['attack'] },
        { signal: null, side: null, say: ['riposte'] },
        { signal: 'hit_scored', side: 'right', say: ['touch right'] },
      ],
    });
    expect(gestureSteps(withRiposte).map((step) => step.signal)).toEqual(['attack', 'hit_scored']);
  });
});

describe('validateScenario', () => {
  it('accepts a well-formed scenario', () => {
    expect(validateScenario(scenario())).toEqual([]);
  });

  it('catches an empty expected sequence', () => {
    expect(validateScenario(scenario({ expect: [] }))).toContain('test-001: has no expected steps');
  });

  it('catches a sequence with nothing gradeable in it', () => {
    const allSpoken = scenario({ expect: [{ signal: null, side: null, say: ['riposte'] }] });
    expect(validateScenario(allSpoken)).toContain(
      'test-001: has no gesture-graded steps, so it can never be called'
    );
  });

  it('catches a spoken-only step with nothing to say', () => {
    const mute = scenario({ expect: [{ signal: null, side: null, say: [] }] });
    expect(validateScenario(mute).some((p) => p.includes('no "say" text'))).toBe(true);
  });

  it('catches an unknown signal id', () => {
    const bogus = scenario({
      // @ts-expect-error deliberately invalid, to prove the check catches it
      expect: [{ signal: 'flourish', side: null, say: [] }],
    });
    expect(validateScenario(bogus)).toContain('test-001: references unknown signal "flourish"');
  });

  it('catches a call that is not legal for the scenario’s weapon', () => {
    // Épée has no priority: `attack` is excluded outright.
    const illegal = scenario({
      weapon: 'epee',
      expect: [{ signal: 'attack', side: 'right', say: ['attack'] }],
    });
    expect(validateScenario(illegal).some((p) => p.includes('not legal under epee rules'))).toBe(
      true
    );
  });

  it('catches a directional signal with no side named', () => {
    const noSide = scenario({ expect: [{ signal: 'attack', side: null, say: ['attack'] }] });
    expect(validateScenario(noSide)).toContain(
      'test-001: "attack" is directional but the step names no side'
    );
  });

  it('catches a non-directional signal with a side named anyway', () => {
    const strayside = scenario({
      expect: [{ signal: 'double_hit', side: 'right', say: ['hit for each'] }],
    });
    expect(validateScenario(strayside)).toContain(
      'test-001: "double_hit" is not directional, so the step should not name a side'
    );
  });

  it.each(SCENARIOS)('$id is well formed', (entry) => {
    expect(validateScenario(entry)).toEqual([]);
  });
});
