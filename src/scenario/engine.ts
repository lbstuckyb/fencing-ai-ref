/**
 * The scenario call phase, as a pure reducer — `signals/drill.ts`'s sibling for
 * Mode 2.
 *
 * The loop is **ready → countdown → live → graded**:
 *
 * 1. `ready` — the camera is already up and showing a self-view, and the clip
 *    is loaded but not playing. Nothing is captured. Playback itself belongs to
 *    a `<video>` element and the page that hosts one; this file has nothing to
 *    say about it.
 * 2. `countdown` — a five-second get-ready window, ticked by the detection
 *    frames themselves rather than a timer, so it runs on the same clock the
 *    holds are measured against and stops dead if the camera does.
 * 3. `live` — the capture window, open from the end of the countdown until the
 *    referee submits. Every frame is graded freely against whichever
 *    weapon-legal signal it best matches — `evaluator.bestMatch` was written
 *    with exactly this free-recognition use in mind — and the same hold machine
 *    that enforces t.63 in the practice drill turns a stream of matches into
 *    discrete, held signals, appended to an ordered list as they complete.
 * 4. `graded` — submitting closes the window and runs `grading.ts` once against
 *    the captured list.
 *
 * t.63 requires each signal to be held 1–2 seconds while a fencing phrase
 * resolves in well under a second, so the capture window is deliberately open
 * *during* playback rather than gated behind it: a call started as the action
 * happens still takes about a second to complete, which means in practice most
 * calls land after the action — which is exactly how a referee works. Replaying
 * the clip changes nothing here; the window stays open either way.
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

export type EnginePhase = 'ready' | 'countdown' | 'live' | 'graded';

/** The get-ready window between pressing play and the capture window opening. */
export const COUNTDOWN_MS = 5000;

export interface EngineState {
  scenario: Scenario;
  phase: EnginePhase;
  stability: Stability;
  hold: HoldState;
  /** This frame's best-matching signal, for live "here is what I see" feedback. `null` outside the live phase. */
  evaluation: Evaluation | null;
  /** Progress toward the hold requirement, 0–1, for the ring. */
  progress: number;
  /**
   * The frame timestamp the countdown was anchored to, set by its first frame.
   * Held in state rather than a ref so the countdown stays part of the pure
   * reducer — and therefore testable — instead of living in the page.
   */
  countdownStartMs: number | null;
  /** What the countdown overlay renders, in milliseconds. */
  countdownRemainingMs: number;
  calls: CapturedCall[];
  /** Set once the capture window has been submitted. */
  grade: ScenarioGrade | null;
}

/** A fresh engine: camera warming up, clip loaded, nothing captured. */
export function createEngine(scenario: Scenario): EngineState {
  return {
    scenario,
    phase: 'ready',
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
    countdownStartMs: null,
    countdownRemainingMs: COUNTDOWN_MS,
    calls: [],
    grade: null,
  };
}

/**
 * The referee pressed play: start the get-ready countdown.
 *
 * The clock is left unanchored — `advanceFrame` anchors it to the first frame
 * that arrives, so a countdown started before the camera has produced a frame
 * simply waits rather than losing time it never got to show.
 */
export function beginCountdown(state: EngineState): EngineState {
  if (state.phase !== 'ready') return state;
  return {
    ...state,
    phase: 'countdown',
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
    countdownStartMs: null,
    countdownRemainingMs: COUNTDOWN_MS,
    calls: [],
    grade: null,
  };
}

/**
 * The camera stopped.
 *
 * A countdown whose clock has stopped is not a countdown, so it drops back to
 * `ready` and is pressed again. Mid-capture, the calls already captured are
 * kept — they are complete, held signals, not affected by what happens after
 * them — but a hold in progress is dropped rather than concluded, for the same
 * reason `drill.ts`'s `stopDrill` drops one: crediting a signal because the
 * camera was switched off mid-gesture would be scoring the button press.
 */
export function cameraStopped(state: EngineState): EngineState {
  if (state.phase === 'countdown') {
    return {
      ...state,
      phase: 'ready',
      stability: idleStability(),
      hold: idleHold(),
      evaluation: null,
      progress: 0,
      countdownStartMs: null,
      countdownRemainingMs: COUNTDOWN_MS,
    };
  }
  if (state.phase !== 'live') return state;
  return { ...state, stability: idleStability(), hold: idleHold(), evaluation: null, progress: 0 };
}

/* -------------------------------------------------------------------------- */
/* Per-frame                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Folds one detected frame into the countdown or the capture window.
 *
 * `pool` is the weapon-legal, calibrated spec list — computed by the caller,
 * same as the practice drill's `options.pool`, so a signal épée does not
 * recognise is never offered to `bestMatch` in the first place rather than
 * being caught after the fact. `nowMs` is the frame's own timestamp, the same
 * monotonic clock the hold machine measures every drill against.
 *
 * Outside those two phases the state is returned *by reference*, so the page's
 * `setEngine` gets an identical object and React bails out rather than
 * re-rendering twenty times a second while nothing is being captured.
 */
export function advanceFrame(
  state: EngineState,
  measurements: Measurements,
  nowMs: number,
  pool: readonly SignalSpec[]
): EngineState {
  if (state.phase === 'countdown') {
    // Anchored to the frame's own timestamp, not wall-clock, exactly as
    // CalibrateSignals anchors its record countdown.
    const startMs = state.countdownStartMs ?? nowMs;
    const remainingMs = COUNTDOWN_MS - (nowMs - startMs);

    if (remainingMs > 0) {
      return { ...state, countdownStartMs: startMs, countdownRemainingMs: remainingMs };
    }

    // Idle hold and stability, so a gesture made while getting into place
    // cannot bleed into the first call.
    return {
      ...state,
      phase: 'live',
      stability: idleStability(),
      hold: idleHold(),
      evaluation: null,
      progress: 0,
      countdownStartMs: null,
      countdownRemainingMs: 0,
    };
  }

  if (state.phase !== 'live') return state;

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
  if (state.phase !== 'live' || state.calls.length === 0) return state;
  return { ...state, calls: state.calls.slice(0, -1) };
}

/**
 * Closes the capture window and grades what was captured.
 *
 * A hold still in progress is credited by `finishHold` — the same rule the
 * practice drill's camera-stop path uses — rather than being discarded for
 * want of a release the referee pre-empted by submitting.
 */
export function submitCall(state: EngineState, pool: readonly SignalSpec[]): EngineState {
  if (state.phase !== 'live') return state;

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

/**
 * Back to `ready`, score discarded — a fresh attempt at the same scenario. The
 * camera is not touched: it is the page's, and stays live across a retry.
 */
export function restart(state: EngineState): EngineState {
  return createEngine(state.scenario);
}
