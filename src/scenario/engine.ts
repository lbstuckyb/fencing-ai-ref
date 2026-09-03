/**
 * The scenario call phase, as a pure reducer — `signals/drill.ts`'s sibling for
 * Mode 2.
 *
 * t.63 requires each signal to be held 1–2 seconds, but a fencing phrase
 * resolves in well under a second: there is no room to signal live against a
 * playing clip. So Mode 2 does not try to. The loop is **watch → call →
 * grade**, exactly as the plan states it:
 *
 * 1. `watch` — the clip plays start to finish. Playback itself belongs to a
 *    `<video>` element and the page that hosts one; this file has nothing to
 *    say about it until the clip ends.
 * 2. `call` — the video is done, the camera is live, and the referee gives the
 *    *full sequence* of signals, each held properly. This is where this file's
 *    logic lives: every frame is graded freely against whichever weapon-legal
 *    signal it best matches — `evaluator.bestMatch` was written with exactly
 *    this free-recognition use in mind — and the same hold machine that
 *    enforces t.63 in the practice drill turns a stream of matches into
 *    discrete, held signals, appended to an ordered list as they complete.
 * 3. `graded` — submitting closes the phase and runs `grading.ts` once against
 *    the captured list.
 *
 * Unlike the practice drill there is no prompt to grade a frame against: the
 * referee is calling a whole phrase from memory, and the app's job is only to
 * notice what they did and hold it to account afterwards.
 */

import type { Measurements } from '../cv/measurements';
import type { Side } from '../cv/types';
import { advanceStability, bestMatch, idleStability } from '../signals/evaluator';
import type { Evaluation, SignalSpec, Stability } from '../signals/evaluator';
import {
  DEFAULT_HOLD_OPTIONS,
  advanceHold,
  finishHold,
  holdMatch,
  holdProgress,
  idleHold,
  justCompleted,
} from '../signals/holdMachine';
import type { HoldOutcome, HoldState } from '../signals/holdMachine';
import { gradeScenario } from './grading';
import type { ScenarioGrade } from './grading';
import type { Scenario } from './schema';

/* -------------------------------------------------------------------------- */
/* Captured calls                                                             */
/* -------------------------------------------------------------------------- */

/** One signal the referee completed during the call phase. */
export interface CapturedCall {
  signal: string;
  /** Resolved from the matching spec at capture time — see `drill.ts`'s `Attempt.label` for why. */
  label: string;
  side: Side;
  /** `quick` carries t.63's own hold-duration warning; grading does not fail on it. */
  outcome: HoldOutcome;
  heldMs: number;
  atMs: number;
}

function labelFor(pool: readonly SignalSpec[], signalId: string): string {
  return pool.find((spec) => spec.id === signalId)?.label ?? signalId;
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type EnginePhase = 'watch' | 'call' | 'graded';

export interface EngineState {
  scenario: Scenario;
  phase: EnginePhase;
  stability: Stability;
  hold: HoldState;
  /** This frame's best-matching signal, for live "here is what I see" feedback. `null` outside the call phase. */
  evaluation: Evaluation | null;
  /** Progress toward the hold requirement, 0–1, for the ring. */
  progress: number;
  calls: CapturedCall[];
  /** Set once the call phase has been submitted. */
  grade: ScenarioGrade | null;
}

/** A fresh engine, watching the clip. */
export function createEngine(scenario: Scenario): EngineState {
  return {
    scenario,
    phase: 'watch',
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
    calls: [],
    grade: null,
  };
}

/** The clip has finished: open the call phase. */
export function beginCall(state: EngineState): EngineState {
  return {
    ...state,
    phase: 'call',
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
    calls: [],
    grade: null,
  };
}

/**
 * The camera stopped mid-call. The calls already captured are kept — they are
 * complete, held signals, not affected by what happens after them — but a hold
 * in progress is dropped rather than concluded, for the same reason
 * `drill.ts`'s `stopDrill` drops one: crediting a signal because the camera was
 * switched off mid-gesture would be scoring the button press.
 */
export function cameraStopped(state: EngineState): EngineState {
  if (state.phase !== 'call') return state;
  return { ...state, stability: idleStability(), hold: idleHold(), evaluation: null, progress: 0 };
}

/* -------------------------------------------------------------------------- */
/* Per-frame                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Folds one detected frame into the call phase.
 *
 * `pool` is the weapon-legal, calibrated spec list — computed by the caller,
 * same as the practice drill's `options.pool`, so a signal épée does not
 * recognise is never offered to `bestMatch` in the first place rather than
 * being caught after the fact. `nowMs` is the frame's own timestamp, the same
 * monotonic clock the hold machine measures every drill against.
 */
export function advanceCall(
  state: EngineState,
  measurements: Measurements,
  nowMs: number,
  pool: readonly SignalSpec[]
): EngineState {
  if (state.phase !== 'call') return state;

  const evaluation = bestMatch(pool, measurements);
  const stability = advanceStability(state.stability, evaluation);
  const hold = advanceHold(state.hold, holdMatch(stability), nowMs, DEFAULT_HOLD_OPTIONS);

  let next: EngineState = {
    ...state,
    evaluation,
    stability,
    hold,
    progress: holdProgress(hold, DEFAULT_HOLD_OPTIONS),
  };

  const completed = justCompleted(state.hold, hold);
  if (completed) {
    next = {
      ...next,
      calls: [
        ...state.calls,
        {
          signal: completed.signal,
          label: labelFor(pool, completed.signal),
          side: completed.side,
          outcome: completed.outcome,
          heldMs: completed.heldMs,
          atMs: nowMs,
        },
      ],
    };
  }

  return next;
}

/** The referee misspoke and wants to drop the last captured call before submitting. */
export function undoLastCall(state: EngineState): EngineState {
  if (state.phase !== 'call' || state.calls.length === 0) return state;
  return { ...state, calls: state.calls.slice(0, -1) };
}

/**
 * Closes the call phase and grades what was captured.
 *
 * A hold still in progress is credited by `finishHold` — the same rule the
 * practice drill's camera-stop path uses — rather than being discarded for
 * want of a release the referee pre-empted by submitting.
 */
export function submitCall(state: EngineState, pool: readonly SignalSpec[]): EngineState {
  if (state.phase !== 'call') return state;

  const finished = finishHold(state.hold, DEFAULT_HOLD_OPTIONS);
  const completed = justCompleted(state.hold, finished);
  const calls = completed
    ? [
        ...state.calls,
        {
          signal: completed.signal,
          label: labelFor(pool, completed.signal),
          side: completed.side,
          outcome: completed.outcome,
          heldMs: completed.heldMs,
          atMs: finished.lastMs ?? state.hold.lastMs ?? 0,
        },
      ]
    : state.calls;

  return {
    ...state,
    phase: 'graded',
    hold: finished,
    evaluation: null,
    calls,
    grade: gradeScenario(state.scenario, calls),
  };
}

/** Back to the top of the clip, score discarded — a fresh attempt at the same scenario. */
export function restart(state: EngineState): EngineState {
  return createEngine(state.scenario);
}
