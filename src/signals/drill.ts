/**
 * The signal-practice drill, as a pure reducer.
 *
 * Everything the drill does between one detected frame and the next lives here:
 * grade the frame against the prompted signal, fold it into the jitter streak
 * and the t.63 hold machine, decide when an attempt has finished, and keep the
 * score. `pages/PracticeSignals.tsx` supplies frames and renders the result; it
 * makes no decisions of its own.
 *
 * That split is worth the file. The drill is the first thing in the app whose
 * behaviour is genuinely temporal — a pass depends on what the last two seconds
 * looked like, not on this frame — and testing that through a rendered page and
 * a mocked camera would mean asserting on timing through three layers of React.
 * As a reducer over `(state, measurements, nowMs)` the whole of it, including
 * the awkward cases (right signal on the wrong arm, a signal stabbed at for a
 * fifth of a second, the camera stopping mid-hold), is a synthetic timeline.
 *
 * ## The three verdicts
 *
 * An attempt ends in one of three ways, and they are deliberately not two:
 *
 * - **pass** — held for the duration t.63 asks for.
 * - **quick** — the right signal, released too fast. Still a pass, still counts
 *   for the streak, but carries the rule's own wording as a warning. The
 *   rulebook sets an expressiveness floor; missing it is a fault to correct, not
 *   a failed rep.
 * - **wrong_side** — a correctly made signal on the wrong arm. This is the only
 *   verdict that breaks the streak, and it is the reason the drill prompts a
 *   *side* rather than just a signal. A directional signal denotes the fencer on
 *   the referee's right or left; making a beautiful Attack with the wrong arm
 *   awards the phrase to the wrong fencer, so it cannot read as a pass.
 *
 * A gesture that simply is not the prompted signal ends nothing at all. It
 * produces live coaching — the specific constraint that is wrong — and the
 * referee stays on the same prompt until they get it.
 *
 * ## Why the wrong arm is graded at the end rather than rejected per frame
 *
 * The hold machine is fed matches on *either* arm, and the side is judged when
 * the hold completes. Filtering wrong-arm frames out earlier would be simpler
 * and much worse: the referee would hold a perfect signal, watch the progress
 * ring sit at zero, and be told nothing. Letting the hold run and then failing
 * it is what turns a silent non-response into "correct Attack, wrong arm".
 */

import type { Measurements } from '../cv/measurements';
import type { Side } from '../cv/types';
import { advanceStability, evaluate, idleStability } from './evaluator';
import type { Evaluation, SignalSpec, Stability } from './evaluator';
import {
  advanceHold,
  holdMatch,
  holdOptionsFor,
  holdProgress,
  idleHold,
  justCompleted,
} from './holdMachine';
import type { HoldResult, HoldState } from './holdMachine';
import { SIGNAL_SPECS } from './specs';

/* -------------------------------------------------------------------------- */
/* Prompts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the drill is asking for: a signal, and — for the six that denote a fencer
 * — which arm to make it with. `side` is `null` for the four that name no one,
 * and for those the arm used is never judged.
 */
export interface DrillPrompt {
  spec: SignalSpec;
  side: Side | null;
}

/**
 * Whether the drill moves on by itself.
 *
 * `random` is the drill proper: signals come up unannounced, which is the only
 * way to practise recognising a prompt rather than rehearsing one. `fixed` is
 * what a user gets by picking a signal from the list or arriving from the
 * reference page — they are working on that one gesture and the app should stay
 * out of the way.
 */
export type DrillMode = 'random' | 'fixed';

export interface DrillOptions {
  /** Signals the random mode draws from. */
  pool: readonly SignalSpec[];
  /** Injected so tests can pin the prompt sequence. */
  random: () => number;
  /**
   * Quiet time after a passed attempt before the next prompt appears. The
   * referee also has to have left the pose — see {@link advanceDrill} — so this
   * is a floor on how long the ✓ is readable, not a timer racing them.
   */
  autoAdvanceMs: number;
}

export const AUTO_ADVANCE_MS = 1200;

export const DEFAULT_DRILL_OPTIONS: DrillOptions = {
  pool: SIGNAL_SPECS,
  random: Math.random,
  autoAdvanceMs: AUTO_ADVANCE_MS,
};

function withDefaults(options: Partial<DrillOptions>): DrillOptions {
  return { ...DEFAULT_DRILL_OPTIONS, ...options };
}

/** A prompt for one spec, with an arm chosen if the signal names a fencer. */
export function promptFor(spec: SignalSpec, random: () => number = Math.random): DrillPrompt {
  return { spec, side: spec.directional ? (random() < 0.5 ? 'left' : 'right') : null };
}

/**
 * A prompt drawn from the pool, avoiding `avoid` where there is anything else to
 * pick — the same signal twice running reads as the drill having frozen. The
 * *side* is redrawn regardless, so a directional signal can and should come back
 * on the other arm.
 */
export function randomPrompt(options: Partial<DrillOptions> = {}, avoid?: SignalSpec): DrillPrompt {
  const { pool, random } = withDefaults(options);
  const choices = pool.length > 1 && avoid ? pool.filter((spec) => spec !== avoid) : pool;
  const spec = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  return promptFor(spec, random);
}

/* -------------------------------------------------------------------------- */
/* Attempts                                                                   */
/* -------------------------------------------------------------------------- */

export type AttemptOutcome = 'pass' | 'quick' | 'wrong_side';

/** One completed attempt at the prompted signal — the drill's unit of scoring. */
export interface Attempt {
  signal: string;
  label: string;
  /** The arm asked for, or `null` where the signal names no fencer. */
  promptedSide: Side | null;
  /** The arm it was actually made with. */
  side: Side;
  outcome: AttemptOutcome;
  /** Measured hold; reads slightly short by design — see `SAMPLE_SLACK_MS`. */
  heldMs: number;
  /** The t.63 warning, or the wrong-arm correction. `null` on a clean pass. */
  message: string | null;
  /** When it completed, on the same clock the frames carry. */
  atMs: number;
}

/** Whether this attempt counts toward the streak. Only the wrong arm does not. */
export function attemptPassed(attempt: Attempt): boolean {
  return attempt.outcome !== 'wrong_side';
}

function wrongSideMessage(prompt: DrillPrompt, side: Side): string {
  return (
    `That is a correct ${prompt.spec.label}, but made with your ${side} arm. ` +
    `The signal names the fencer on that side, so this one has to be your ${prompt.side} arm.`
  );
}

function attemptFrom(result: HoldResult, prompt: DrillPrompt, atMs: number): Attempt {
  const wrongSide = prompt.side !== null && result.side !== prompt.side;
  return {
    signal: result.signal,
    label: prompt.spec.label,
    promptedSide: prompt.side,
    side: result.side,
    outcome: wrongSide ? 'wrong_side' : result.outcome,
    heldMs: result.heldMs,
    message: wrongSide ? wrongSideMessage(prompt, result.side) : result.warning,
    atMs,
  };
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export interface DrillState {
  mode: DrillMode;
  prompt: DrillPrompt;
  /** Jitter streak over the prompted spec. */
  stability: Stability;
  hold: HoldState;
  /** This frame's grading of the prompted spec; `null` before any frame. */
  evaluation: Evaluation | null;
  /** Progress toward the duration requirement, 0–1, for the ring. */
  progress: number;
  /** The last completed attempt, kept until the next one starts. */
  attempt: Attempt | null;
  /** Consecutive attempts that counted. */
  streak: number;
  bestStreak: number;
  attempts: number;
  passes: number;
}

/** A fresh drill in random mode, prompting its first signal. */
export function createDrill(options: Partial<DrillOptions> = {}): DrillState {
  return atPrompt(randomPrompt(options), 'random');
}

function atPrompt(prompt: DrillPrompt, mode: DrillMode): DrillState {
  return {
    mode,
    prompt,
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
    attempt: null,
    streak: 0,
    bestStreak: 0,
    attempts: 0,
    passes: 0,
  };
}

/**
 * Moves to a new prompt, keeping the score.
 *
 * Everything time-shaped is discarded: a hold half-formed against the previous
 * signal must not be credited to this one, and a verdict left on screen after
 * the prompt changed would read as being about the new signal.
 */
export function setPrompt(state: DrillState, prompt: DrillPrompt, mode: DrillMode): DrillState {
  return {
    ...state,
    mode,
    prompt,
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
    attempt: null,
  };
}

/** Work on one signal, chosen from the list or linked to from the reference. */
export function chooseSignal(
  state: DrillState,
  spec: SignalSpec,
  options: Partial<DrillOptions> = {}
): DrillState {
  return setPrompt(state, promptFor(spec, withDefaults(options).random), 'fixed');
}

/** Skip to another random signal — also how the drill returns to random mode. */
export function nextSignal(state: DrillState, options: Partial<DrillOptions> = {}): DrillState {
  return setPrompt(state, randomPrompt(options, state.prompt.spec), 'random');
}

/**
 * The camera stopped, so the session the numbers came from has ended.
 *
 * The score survives — it is the user's, not the camera's — but a hold in
 * progress is dropped rather than concluded. Crediting a signal because the
 * camera was switched off mid-gesture would be scoring the button press.
 */
export function stopDrill(state: DrillState): DrillState {
  return {
    ...state,
    stability: idleStability(),
    hold: idleHold(),
    evaluation: null,
    progress: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Per-frame                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether the referee is making the prompted signal right now, on the wrong arm.
 *
 * Live coaching only — the verdict is decided when the hold completes. Shown
 * while it is happening so a referee who is about to lose the rep can fix it
 * before the ring fills.
 */
export function wrongArm(state: DrillState): boolean {
  const { evaluation, prompt } = state;
  return (
    evaluation !== null &&
    evaluation.pass &&
    prompt.side !== null &&
    evaluation.side !== prompt.side
  );
}

/**
 * Folds one detected frame into the drill.
 *
 * `nowMs` is the frame's timestamp — the same monotonic clock the hold machine
 * measures against. Call it for every frame that produced a pose, including the
 * ones where nothing matches: releases are what complete a hold.
 */
export function advanceDrill(
  state: DrillState,
  measurements: Measurements,
  nowMs: number,
  options: Partial<DrillOptions> = {}
): DrillState {
  const settings = withDefaults(options);
  const holdOptions = holdOptionsFor(state.prompt.spec);

  const evaluation = evaluate(state.prompt.spec, measurements);
  // The side is deliberately not filtered here; see the module comment.
  const stability = advanceStability(state.stability, evaluation.pass ? evaluation : null);
  const hold = advanceHold(state.hold, holdMatch(stability), nowMs, holdOptions);

  let next: DrillState = {
    ...state,
    evaluation,
    stability,
    hold,
    progress: holdProgress(hold, holdOptions),
  };

  const completed = justCompleted(state.hold, hold);
  if (completed) {
    const attempt = attemptFrom(completed, state.prompt, nowMs);
    const counted = attemptPassed(attempt);
    const streak = counted ? state.streak + 1 : 0;
    next = {
      ...next,
      attempt,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      attempts: state.attempts + 1,
      passes: state.passes + (counted ? 1 : 0),
    };
  }

  // Auto-advance waits on the referee as well as the clock: the prompt changes
  // once they have had time to read the ✓ *and* come out of the pose, so a new
  // signal never appears under an arm still held up for the last one. A missed
  // attempt keeps its prompt — the point is to get that signal right.
  if (
    next.mode === 'random' &&
    next.attempt !== null &&
    attemptPassed(next.attempt) &&
    !evaluation.pass &&
    nowMs - next.attempt.atMs >= settings.autoAdvanceMs
  ) {
    return setPrompt(next, randomPrompt(settings, next.prompt.spec), 'random');
  }

  return next;
}
