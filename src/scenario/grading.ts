/**
 * Ordered sequence grading — comparing what the referee called during the
 * call phase against a scenario's answer key.
 *
 * A phrase is not a set, it is a sequence: calling the right two signals in
 * the wrong order is a different mistake from calling the wrong signal
 * outright, and a referee trying to learn from this drill needs to be told
 * which one they made. So grading is not "does each expected signal appear
 * somewhere" — it is an alignment between two ordered lists, and the plan
 * names five distinct outcomes for a step in that alignment: correct, right
 * signal, wrong side, out of order, wrong signal entirely, and missing —
 * plus a sixth for a call that matches no step at all, extra.
 *
 * ## How the alignment works
 *
 * First, find the longest *ordered* run of calls that are fully correct
 * (right signal, right side) at their true position — a classic longest
 * common subsequence over the two lists. That run is what "correct" means:
 * not just present, but present in an order consistent with everything else
 * that is correct.
 *
 * Everything left over — expected steps the run did not claim, calls the run
 * did not use — is then reconciled step by step, in expected order, each
 * looking for the best unclaimed call: an exact match not picked by the run
 * (which can only mean it exists **out of order**), then the same signal on
 * the **wrong side**, then any other unclaimed call at all (the referee said
 * *something* here, just the **wrong signal**), and only once nothing is left
 * to claim does a step read as **missing**. Whatever calls still go unclaimed
 * after every step has had a turn are **extra** — calls with no step to
 * explain them.
 */

import type { Side } from '../cv/types';
import { signalLabel } from '../data/rules';
import type { CapturedCall } from './engine';
import { gestureSteps } from './schema';
import type { GestureStep, Scenario } from './schema';

export type StepStatus = 'correct' | 'out_of_order' | 'wrong_side' | 'wrong_signal' | 'missing';

export interface StepVerdict {
  /** Position in the gesture-graded sequence — `gestureSteps(scenario)`, not raw `expect`. */
  index: number;
  expected: GestureStep;
  status: StepStatus;
  /** The call this step was matched against, or `null` when nothing was left to claim. */
  call: CapturedCall | null;
  message: string;
}

export interface ExtraVerdict {
  call: CapturedCall;
  message: string;
}

export interface ScenarioGrade {
  steps: readonly StepVerdict[];
  /** Calls with no expected step behind them. */
  extra: readonly ExtraVerdict[];
  correct: number;
  /** Gesture-graded steps in the scenario — the denominator, not `expect.length`. */
  total: number;
  /** `correct / total`, 1 for a scenario with no gesture steps rather than a division by zero. */
  score: number;
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

function fullMatch(step: GestureStep, call: CapturedCall): boolean {
  return step.signal === call.signal && (step.side === null || step.side === call.side);
}

function sameSignal(step: GestureStep, call: CapturedCall): boolean {
  return step.signal === call.signal;
}

/**
 * The longest ordered run of full matches between `steps` and `calls`, as a
 * step-index → call-index map — the textbook longest-common-subsequence
 * table, read backwards from `dp[0][0]`. Small inputs (a phrase is a handful
 * of calls) make the O(n·m) table cheap enough not to think about.
 */
function alignInOrder(
  steps: readonly GestureStep[],
  calls: readonly CapturedCall[]
): Map<number, number> {
  const n = steps.length;
  const m = calls.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = fullMatch(steps[i], calls[j])
        ? 1 + dp[i + 1][j + 1]
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const aligned = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (fullMatch(steps[i], calls[j])) {
      aligned.set(i, j);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return aligned;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

function sideNote(side: Side | null): string {
  return side ? ` with your ${side} arm` : '';
}

function correctMessage(step: GestureStep): string {
  return `${signalLabel(step.signal)}${sideNote(step.side)} — correct.`;
}

function outOfOrderMessage(step: GestureStep): string {
  return `${signalLabel(step.signal)}${sideNote(step.side)} was made correctly, but out of order.`;
}

function wrongSideMessage(step: GestureStep, call: CapturedCall): string {
  return (
    `${signalLabel(step.signal)} was right, but made with your ${call.side} arm — ` +
    `this one names the fencer on your ${step.side}.`
  );
}

function wrongSignalMessage(step: GestureStep, call: CapturedCall): string {
  return `Expected ${signalLabel(step.signal)}${sideNote(step.side)}, but you called ${call.label} here instead.`;
}

function missingMessage(step: GestureStep): string {
  return `${signalLabel(step.signal)}${sideNote(step.side)} was never called.`;
}

function extraMessage(call: CapturedCall): string {
  return `You also called ${call.label}${sideNote(call.side)}, which was not part of this phrase.`;
}

/* -------------------------------------------------------------------------- */
/* Grading                                                                    */
/* -------------------------------------------------------------------------- */

export function gradeScenario(scenario: Scenario, calls: readonly CapturedCall[]): ScenarioGrade {
  const expected = gestureSteps(scenario);
  const aligned = alignInOrder(expected, calls);
  const claimed = new Set(aligned.values());

  const steps: StepVerdict[] = expected.map((step, index) => {
    const alignedCallIndex = aligned.get(index);
    if (alignedCallIndex !== undefined) {
      const call = calls[alignedCallIndex];
      return { index, expected: step, status: 'correct', call, message: correctMessage(step) };
    }

    // Right signal and side exist somewhere, just not part of the in-order
    // run above — that can only mean they came out of sequence.
    const outOfOrderIndex = calls.findIndex((call, j) => !claimed.has(j) && fullMatch(step, call));
    if (outOfOrderIndex !== -1) {
      claimed.add(outOfOrderIndex);
      const call = calls[outOfOrderIndex];
      return {
        index,
        expected: step,
        status: 'out_of_order',
        call,
        message: outOfOrderMessage(step),
      };
    }

    // Right signal, wrong arm.
    const wrongSideIndex = calls.findIndex((call, j) => !claimed.has(j) && sameSignal(step, call));
    if (wrongSideIndex !== -1) {
      claimed.add(wrongSideIndex);
      const call = calls[wrongSideIndex];
      return {
        index,
        expected: step,
        status: 'wrong_side',
        call,
        message: wrongSideMessage(step, call),
      };
    }

    // Nothing matching is left, but if the referee called *something* here
    // that no other step claims, that is a wrong call, not silence.
    const strayIndex = calls.findIndex((_call, j) => !claimed.has(j));
    if (strayIndex !== -1) {
      claimed.add(strayIndex);
      const call = calls[strayIndex];
      return {
        index,
        expected: step,
        status: 'wrong_signal',
        call,
        message: wrongSignalMessage(step, call),
      };
    }

    return { index, expected: step, status: 'missing', call: null, message: missingMessage(step) };
  });

  const extra: ExtraVerdict[] = calls
    .map((call, index) => ({ call, index }))
    .filter(({ index }) => !claimed.has(index))
    .map(({ call }) => ({ call, message: extraMessage(call) }));

  const correct = steps.filter((step) => step.status === 'correct').length;
  const total = expected.length;

  return { steps, extra, correct, total, score: total === 0 ? 1 : correct / total };
}
