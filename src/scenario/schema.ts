/**
 * The scenario schema — Mode 2's answer key.
 *
 * A scenario names a clip and the sequence of calls a referee should make once
 * it finishes, per the plan's "watch → call → grade" flow: the gesture the
 * referee is graded on lives in `signals/specs.ts` already, so a step here is
 * just a pointer at one of those ids, plus which fencer it names.
 *
 * `say` is carried from day one but never graded — v2.0 is speech grading, and
 * this is the schema change that migration will not need to make. A step with
 * `signal: null` is one of the five spoken-only actions t.63 gives no gesture
 * for (Riposte, Counter-riposte, Remise, Reprise, Redouble): it belongs in the
 * displayed sequence, so the referee learns the whole call, but
 * `gestureSteps` drops it before grading ever sees it.
 */

import type { Side } from '../cv/types';
import { isSignalAllowed, signalLabel } from '../data/rules';
import type { CoreSignalId, Weapon } from '../data/rules';
import { signalSpec } from '../signals/specs';

export interface ScenarioStep {
  /** A core signal id, or `null` for a spoken-only action. */
  signal: CoreSignalId | null;
  /** The fencer this call names — `null` when the signal is not directional, or the step is spoken-only. */
  side: Side | null;
  /** Displayed but not graded. See the module comment. */
  say: readonly string[];
}

export interface Scenario {
  id: string;
  weapon: Weapon;
  /** Path under `public/`, e.g. `/scenarios/foil-001.mp4`. */
  video: string;
  title: string;
  /** 1 (easiest) upward — no fixed ceiling, just a relative ordering for the bank. */
  difficulty: number;
  expect: readonly ScenarioStep[];
  /** Shown after grading, so the drill teaches rather than just scores. */
  explanation: string;
}

/** A step known at the type level to carry a gradeable signal. */
export type GestureStep = ScenarioStep & { signal: CoreSignalId };

/** `scenario.expect`, spoken-only steps dropped — what the call phase is actually graded against. */
export function gestureSteps(scenario: Scenario): readonly GestureStep[] {
  return scenario.expect.filter((step): step is GestureStep => step.signal !== null);
}

/**
 * Authoring mistakes that would otherwise fail silently or confusingly at
 * runtime — the scenario-bank equivalent of `evaluator.ts`'s `validateSpec`.
 * A scenario is hand-authored data with no compiler check tying `signal` to a
 * real spec, `side` to whether that spec is directional, or `weapon` to
 * whether the call is even legal, so a test running this over the bank is
 * what catches an answer key that could never be passed.
 */
export function validateScenario(scenario: Scenario): string[] {
  const problems: string[] = [];
  const push = (problem: string) => problems.push(`${scenario.id}: ${problem}`);

  if (scenario.expect.length === 0) push('has no expected steps');
  if (gestureSteps(scenario).length === 0) {
    push('has no gesture-graded steps, so it can never be called');
  }

  for (const step of scenario.expect) {
    if (step.signal === null) {
      if (step.say.length === 0) push('has a spoken-only step with no "say" text');
      continue;
    }

    const spec = signalSpec(step.signal);
    if (!spec) {
      push(`references unknown signal "${step.signal}"`);
      continue;
    }
    if (!isSignalAllowed(scenario.weapon, step.signal)) {
      push(
        `expects "${step.signal}" (${signalLabel(step.signal)}), which is not legal under ${scenario.weapon} rules`
      );
    }
    if (spec.directional && step.side === null) {
      push(`"${step.signal}" is directional but the step names no side`);
    }
    if (!spec.directional && step.side !== null) {
      push(`"${step.signal}" is not directional, so the step should not name a side`);
    }
  }

  if (scenario.difficulty < 1) push(`has a nonsensical difficulty ${scenario.difficulty}`);

  return problems;
}
