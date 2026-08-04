/**
 * The t.63 hold-duration state machine.
 *
 * > *"Each signal must last 1–2 seconds, be expressive and correctly made."*
 * > — FIE Technical Rules t.63
 *
 * That sentence is a grading requirement, not decoration, and it is the one part
 * of the rulebook the evaluator cannot see: `evaluate()` grades a single frame,
 * so as far as it knows a correct pose flashed for one frame and a correct pose
 * held for two seconds are the same thing. This file supplies the missing axis —
 * time — and turns a stream of per-frame verdicts into discrete, held signals.
 *
 * ```
 *                  ┌──────── new gesture ────────┐
 *                  ▼                             │
 *   IDLE ──match──▶ FORMING ──floor reached──▶ HELD
 *     ▲               │ released                 │ released
 *     │ too brief     ▼                          ▼
 *     └──────────  COMPLETE ◀─────────────────────
 *                  (carries the result until a new gesture starts)
 * ```
 *
 * ## What it does and does not fail
 *
 * The rule sets an **expressiveness floor, not a ceiling**. A referee who holds
 * Halt for four seconds has made a correct Halt; one who stabs at it for a fifth
 * of a second has not made a signal at all, they have moved their arm. So:
 *
 * - Reaching {@link HoldOptions.floorMs} passes, and the machine says so *while
 *   the pose is still held* — the ✓ appears at the moment the requirement is met
 *   rather than when the arm comes down.
 * - A release short of the floor but past {@link HoldOptions.creditMs} still
 *   passes. Nobody should lose a drill for releasing a tenth of a second early.
 * - A release shorter than that, but longer than
 *   {@link HoldOptions.minAttemptMs}, **passes with a warning** — it was the
 *   right signal, made too fast to be a signal.
 * - Anything briefer is not scored at all. It is an arm passing through the pose
 *   on its way somewhere else, and reporting it would punish the referee for
 *   gestures they never made.
 * - Long holds are never failed, only completed.
 *
 * ## Why the thresholds sit under the rule's own numbers
 *
 * t.63 says one second; the default floor is 900 ms. `heldMs` accumulates the
 * intervals *between matching samples*, and at the loop's ~22 fps the true hold
 * extends up to one sample interval beyond the first match and one before the
 * last — so a genuine one-second hold measures as roughly 910 ms. Grading the
 * measurement against 1000 ms would fail correct signals for a sampling
 * artefact. See {@link SAMPLE_SLACK_MS}.
 *
 * ## Layering
 *
 * This sits on top of the evaluator's jitter rejection, not instead of it. Feed
 * it only matches the stability streak has confirmed — {@link holdMatch} is the
 * adapter — so that single-frame flickers are gone before duration is measured.
 * The machine adds a second, coarser tolerance of its own: a **dropout grace**,
 * so that losing tracking for a frame or two mid-signal costs the referee those
 * milliseconds rather than the whole hold.
 *
 * Everything here is a pure reducer over `(state, match, nowMs)`, so the whole
 * timing story is testable with a synthetic timeline and no camera.
 */

import type { Side } from '../cv/types';
import type { Stability } from './evaluator';

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

/** t.63's own band: a signal lasts one to two seconds. */
export const T63_HOLD_MS = [1000, 2000] as const;

/**
 * How much `heldMs` under-reports a real hold, and therefore how far under the
 * rule's numbers the machine's own thresholds sit.
 *
 * Two detection intervals at ~22 fps is ~90 ms; 100 ms is that rounded up. It is
 * subtracted twice — once to place the pass floor under the rule's floor, once
 * more to place the release credit under the pass floor — for two different
 * reasons, measurement error and then human slop.
 */
export const SAMPLE_SLACK_MS = 100;

/**
 * Below this, a correct pose is not treated as an attempt at all.
 *
 * The stability streak has already discarded ~135 ms of flicker before anything
 * reaches this file, so what this catches is the arm sweeping through a pose in
 * transit to another one. Warning about those would produce a stream of
 * corrections for signals the referee never intended to make.
 */
export const MIN_ATTEMPT_MS = 250;

/**
 * How long tracking may be lost before the hold is considered released.
 *
 * Pose estimation drops a limb occasionally — a hand crossing the torso, a bad
 * exposure frame — and at ~22 fps this is four or five frames of slack. Time
 * inside a dropout never counts toward `heldMs`: a gap forgives, it does not
 * credit.
 *
 * It applies only when *nothing* matched. A different signal is a decision, not
 * a dropout, and ends the current hold immediately.
 */
export const DROPOUT_GRACE_MS = 200;

export interface HoldOptions {
  /** The spec's band, used for the warning's wording. */
  holdMs: readonly [number, number];
  /** Measured hold at which the signal passes outright, mid-hold. */
  floorMs: number;
  /** Measured hold at which a *release* still counts as a clean pass. */
  creditMs: number;
  /** Shortest hold reported at all; below this the pose is ignored. */
  minAttemptMs: number;
  /** Lost-tracking tolerance. */
  graceMs: number;
}

/**
 * Timings for a spec, derived from its `holdMs` band so that a spec asking for
 * something other than t.63's default is honoured without a second source of
 * truth. Everything is clamped non-negative: a nonsensical band produces a
 * permissive machine rather than one that can never complete.
 */
export function holdOptionsFor(spec: { holdMs: readonly [number, number] }): HoldOptions {
  const floorMs = Math.max(spec.holdMs[0] - SAMPLE_SLACK_MS, 0);
  const creditMs = Math.max(floorMs - SAMPLE_SLACK_MS, 0);
  return {
    holdMs: spec.holdMs,
    floorMs,
    creditMs,
    minAttemptMs: Math.min(MIN_ATTEMPT_MS, creditMs),
    graceMs: DROPOUT_GRACE_MS,
  };
}

/** t.63's band as the machine measures it: pass at 900 ms, credit from 800 ms. */
export const DEFAULT_HOLD_OPTIONS: HoldOptions = holdOptionsFor({ holdMs: T63_HOLD_MS });

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type HoldPhase =
  /** Nothing is being held. */
  | 'idle'
  /** A signal is being held but has not yet lasted long enough. */
  | 'forming'
  /** The duration requirement is met and the pose is still being held. */
  | 'held'
  /** The hold ended; `result` describes it, and stays until a new gesture starts. */
  | 'complete';

/** Why a completed hold is being reported. Both outcomes are passes. */
export type HoldOutcome =
  /** Held long enough. */
  | 'pass'
  /** Correct, but released too quickly to satisfy t.63. */
  | 'quick';

export interface HoldResult {
  signal: string;
  side: Side;
  outcome: HoldOutcome;
  /** Measured duration — see {@link SAMPLE_SLACK_MS} on why it reads short. */
  heldMs: number;
  /** Ready to display, or `null` on a clean pass. */
  warning: string | null;
}

/** What a frame is offering the machine: a confirmed signal, or nothing. */
export interface HoldMatch {
  signal: string;
  side: Side;
}

export interface HoldState {
  phase: HoldPhase;
  /** What is being held, or was just completed. */
  signal: string | null;
  side: Side | null;
  /** Accumulated matching time. Keeps rising while a completed pose lingers. */
  heldMs: number;
  /**
   * Set at the completing transition and kept until the pose changes. Its object
   * identity changes only on a *new* completion, so a caller collecting a
   * sequence should use {@link justCompleted} rather than testing for non-null
   * every frame.
   */
  result: HoldResult | null;
  /** Timestamp of the last sample processed. Bookkeeping. */
  lastMs: number | null;
  /** Timestamp of the last *matching* sample. Bookkeeping. */
  lastMatchMs: number | null;
}

export function idleHold(): HoldState {
  return {
    phase: 'idle',
    signal: null,
    side: null,
    heldMs: 0,
    result: null,
    lastMs: null,
    lastMatchMs: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                */
/* -------------------------------------------------------------------------- */

function seconds(ms: number): string {
  const value = ms / 1000;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function tooQuick(heldMs: number, [min, max]: readonly [number, number]): string {
  return (
    `Held for ${seconds(heldMs)} s — too quick: a signal must last ` +
    `${seconds(min)}–${seconds(max)} seconds and be expressive.`
  );
}

/**
 * Ends the current hold: either a completion carrying a result, or — for a pose
 * too brief to have been meant — a return to idle with nothing reported.
 */
function conclude(state: HoldState, options: HoldOptions): HoldState {
  if (state.signal === null || state.side === null) return idleHold();
  if (state.heldMs < options.minAttemptMs) return { ...idleHold(), lastMs: state.lastMs };

  const outcome: HoldOutcome = state.heldMs >= options.creditMs ? 'pass' : 'quick';
  return {
    ...state,
    phase: 'complete',
    result: {
      signal: state.signal,
      side: state.side,
      outcome,
      heldMs: state.heldMs,
      warning: outcome === 'quick' ? tooQuick(state.heldMs, options.holdMs) : null,
    },
  };
}

function begin(match: HoldMatch, nowMs: number): HoldState {
  return {
    phase: 'forming',
    signal: match.signal,
    side: match.side,
    heldMs: 0,
    result: null,
    lastMs: nowMs,
    lastMatchMs: nowMs,
  };
}

function isSameHold(state: HoldState, match: HoldMatch | null): boolean {
  return match !== null && state.signal === match.signal && state.side === match.side;
}

/**
 * Folds one frame into the hold.
 *
 * `match` is the signal the frame confirmed, or `null` for a frame that matched
 * nothing; `nowMs` is any monotonic clock — `performance.now()` live, integers in
 * tests. Call it every detection frame, including the ones that match nothing:
 * releases are what complete a hold, and a machine that only hears about matches
 * never sees one.
 *
 * A gesture change ends the old hold and starts the new one on the *following*
 * frame rather than the same one, so that a completing result is never
 * overwritten in the tick it is produced. At detection rates that costs ~45 ms of
 * the new signal's duration, which is inside the slack the floor already carries.
 */
export function advanceHold(
  state: HoldState,
  match: HoldMatch | null,
  nowMs: number,
  options: HoldOptions = DEFAULT_HOLD_OPTIONS
): HoldState {
  if (!Number.isFinite(nowMs)) return state;

  // A regressing clock — a remounted video element, a reset timeline — would
  // otherwise credit a negative interval or freeze the grace window open.
  const current = state.lastMs !== null && nowMs < state.lastMs ? idleHold() : state;

  if (current.phase === 'complete') {
    // A completed hold is a resting state that carries its result, so the UI can
    // keep showing the verdict for as long as nothing else happens.
    if (match === null) return { ...current, lastMs: nowMs };

    // One gesture is one report, however long the arm stays up — but only while
    // the pose is *continuous* with the one already reported. A referee who drops
    // their arm and gives the same signal again has given it twice, and the
    // scenario call phase has to capture both.
    const gap = current.lastMatchMs === null ? Infinity : nowMs - current.lastMatchMs;
    if (isSameHold(current, match) && gap <= options.graceMs) {
      return { ...current, lastMs: nowMs, lastMatchMs: nowMs };
    }
    return begin(match, nowMs);
  }

  if (isSameHold(current, match)) {
    // Only an interval bounded by two matching samples counts. After a dropout
    // the clock restarts from the frame tracking came back, so the gap is
    // forgiven rather than paid out.
    const since = current.lastMatchMs;
    const heldMs =
      current.heldMs + (since !== null && since === current.lastMs ? nowMs - since : 0);

    return {
      ...current,
      phase: heldMs >= options.floorMs ? 'held' : 'forming',
      heldMs,
      lastMs: nowMs,
      lastMatchMs: nowMs,
    };
  }

  if (current.signal !== null) {
    const gap = current.lastMatchMs === null ? Infinity : nowMs - current.lastMatchMs;
    if (match === null && gap <= options.graceMs) {
      // Lost tracking, not a release. Hold the state, bank no time.
      return { ...current, lastMs: nowMs };
    }

    const ended = conclude(current, options);
    if (ended.phase === 'complete') return { ...ended, lastMs: nowMs };
    // Too brief to report: nothing to hand back, so fall through and let this
    // frame start whatever is happening now.
  }

  if (match === null) return { ...idleHold(), lastMs: nowMs };
  return begin(match, nowMs);
}

/**
 * Ends a hold in progress without waiting for a release — for the scenario call
 * phase closing, or the practice page moving to the next prompt. A hold past the
 * attempt floor is credited by the same rules as a release; anything shorter is
 * discarded.
 */
export function finishHold(
  state: HoldState,
  options: HoldOptions = DEFAULT_HOLD_OPTIONS
): HoldState {
  if (state.phase === 'complete' || state.phase === 'idle') return state;
  return conclude(state, options);
}

/**
 * The result of a hold that completed on *this* transition, or `null`.
 *
 * The completed state persists while the referee keeps their arm up, so this
 * identity comparison is what keeps one gesture from being appended to a captured
 * sequence forty times.
 */
export function justCompleted(previous: HoldState, next: HoldState): HoldResult | null {
  if (next.result === null || next.result === previous.result) return null;
  return next.result;
}

/** Progress toward the duration requirement, 0–1, for a ring or bar. */
export function holdProgress(
  state: HoldState,
  options: HoldOptions = DEFAULT_HOLD_OPTIONS
): number {
  if (state.phase === 'idle') return 0;
  if (state.phase !== 'forming') return 1;
  if (!(options.floorMs > 0)) return 1;
  return Math.min(1, Math.max(0, state.heldMs / options.floorMs));
}

/**
 * Adapter from the evaluator's jitter rejection: a match only once the streak has
 * confirmed it. This is the intended way to drive the machine from a live frame.
 */
export function holdMatch(stability: Stability): HoldMatch | null {
  if (!stability.stable || stability.signal === null || stability.side === null) return null;
  return { signal: stability.signal, side: stability.side };
}
