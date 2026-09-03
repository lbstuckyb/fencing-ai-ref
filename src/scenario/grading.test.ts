import { describe, expect, it } from 'vitest';
import { gradeScenario } from './grading';
import type { Scenario, ScenarioStep } from './schema';
import type { CapturedCall } from './engine';

function scenario(steps: ScenarioStep[]): Scenario {
  return {
    id: 'grading-test',
    weapon: 'foil',
    video: '/scenarios/grading-test.mp4',
    title: 'Grading test',
    difficulty: 1,
    expect: steps,
    explanation: 'A scenario built for grading tests.',
  };
}

function step(signal: ScenarioStep['signal'], side: ScenarioStep['side']): ScenarioStep {
  return { signal, side, say: [] };
}

let nextAtMs = 0;

/** A captured call, defaulting to a clean pass — most tests do not care about the hold outcome. */
function call(
  signal: string,
  side: CapturedCall['side'],
  overrides: Partial<CapturedCall> = {}
): CapturedCall {
  nextAtMs += 1000;
  return {
    signal,
    label: signal,
    side,
    outcome: 'pass',
    heldMs: 1200,
    atMs: nextAtMs,
    ...overrides,
  };
}

const ATTACK_RIGHT = step('attack', 'right');
const PARRY_LEFT = step('parry', 'left');
const HIT_LEFT = step('hit_scored', 'left');

describe('gradeScenario', () => {
  it('grades an exact call as correct, step by step', () => {
    const grade = gradeScenario(scenario([ATTACK_RIGHT, PARRY_LEFT]), [
      call('attack', 'right'),
      call('parry', 'left'),
    ]);

    expect(grade.steps.map((s) => s.status)).toEqual(['correct', 'correct']);
    expect(grade.correct).toBe(2);
    expect(grade.total).toBe(2);
    expect(grade.score).toBe(1);
    expect(grade.extra).toEqual([]);
  });

  it('does not grade the spoken-only steps', () => {
    const withRiposte = scenario([ATTACK_RIGHT, step(null, null), HIT_LEFT]);
    const grade = gradeScenario(withRiposte, [call('attack', 'right'), call('hit_scored', 'left')]);

    expect(grade.total).toBe(2);
    expect(grade.steps.map((s) => s.expected.signal)).toEqual(['attack', 'hit_scored']);
  });

  it('flags the right signal made on the wrong arm', () => {
    const grade = gradeScenario(scenario([ATTACK_RIGHT]), [call('attack', 'left')]);

    expect(grade.steps[0].status).toBe('wrong_side');
    expect(grade.steps[0].call?.side).toBe('left');
    expect(grade.correct).toBe(0);
  });

  it('flags a call made out of sequence as out_of_order, not wrong_signal', () => {
    // The referee named both fencers correctly but in the wrong order.
    const grade = gradeScenario(scenario([ATTACK_RIGHT, PARRY_LEFT]), [
      call('parry', 'left'),
      call('attack', 'right'),
    ]);

    const byExpected = Object.fromEntries(grade.steps.map((s) => [s.expected.signal, s.status]));
    // Exactly one of the two is the anchor the LCS keeps in order; the other
    // reads as having arrived out of sequence relative to it. Which one is the
    // anchor is an implementation detail — that neither reads as wrong_signal
    // or missing is the property under test.
    expect(Object.values(byExpected).sort()).toEqual(['correct', 'out_of_order']);
    expect(grade.steps.every((s) => s.call !== null)).toBe(true);
  });

  it('flags a call that matches no expected signal as wrong_signal', () => {
    const grade = gradeScenario(scenario([ATTACK_RIGHT]), [call('halt', 'right')]);

    expect(grade.steps[0].status).toBe('wrong_signal');
    expect(grade.steps[0].call?.signal).toBe('halt');
  });

  it('flags a step with nothing at all offered for it as missing', () => {
    const grade = gradeScenario(scenario([ATTACK_RIGHT, PARRY_LEFT]), [call('attack', 'right')]);

    expect(grade.steps[0].status).toBe('correct');
    expect(grade.steps[1].status).toBe('missing');
    expect(grade.steps[1].call).toBeNull();
  });

  it('flags a leftover call with no expected step behind it as extra', () => {
    const grade = gradeScenario(scenario([ATTACK_RIGHT]), [
      call('attack', 'right'),
      call('hit_scored', 'right'),
    ]);

    expect(grade.extra).toHaveLength(1);
    expect(grade.extra[0].call.signal).toBe('hit_scored');
  });

  it('scores a scenario with no gesture steps as perfect rather than dividing by zero', () => {
    const allSpoken = scenario([step(null, null)]);
    const grade = gradeScenario(allSpoken, []);

    expect(grade.total).toBe(0);
    expect(grade.score).toBe(1);
  });

  it('never claims the same call for two different steps', () => {
    // Only one `attack` was made; only one step should be able to claim it.
    const grade = gradeScenario(scenario([ATTACK_RIGHT, step('attack', 'right')]), [
      call('attack', 'right'),
    ]);

    const claimedCalls = grade.steps.filter((s) => s.call !== null);
    expect(claimedCalls).toHaveLength(1);
    expect(grade.steps.filter((s) => s.status === 'missing')).toHaveLength(1);
  });
});
