/**
 * Signal specs and the constraint evaluator — the grading core.
 *
 * A spec is a list of constraints over the measurements in `cv/measurements.ts`,
 * and evaluating one answers three questions at once: did the referee make this
 * signal, how close were they, and if not — which part was wrong. The third is
 * the reason this is a rule-based classifier rather than a learned one. A model
 * can say "not a Halt"; only a constraint list can say "straighten your raised
 * arm", which is the entire pedagogical value of the drill.
 *
 * Nothing here touches landmarks. `measure()` has already reduced a frame to
 * torso-frame numbers, so this file is pure arithmetic over a `Record<string,
 * number | null>` and is testable without a camera, a model, or a DOM.
 *
 * ## Three properties worth stating before the code
 *
 * **Soft margins.** Each constraint has a band it must land in and a tolerance
 * zone outside it. Inside the band scores 1; outside, the score falls linearly to
 * 0 across the tolerance. Pass/fail is still the band — the tolerance changes no
 * verdict — but it turns "wrong" into "how wrong", which is what drives a
 * progress ring and what lets stage 11's near-miss fixtures assert that a signal
 * fails *narrowly* on the constraint it should.
 *
 * **Jitter rejection.** Pose estimation flickers. A single passing frame means
 * nothing, so `advanceStability` requires {@link STABLE_FRAMES} consecutive
 * passing frames of the *same* signal on the *same* arm before a match counts.
 * The hold machine (stage 10) sits on top of that and adds t.63's duration rule.
 *
 * **Directional mirroring.** Specs are authored once, for the right arm, and
 * `.R` in a constraint means "the signalling arm" rather than "the anatomical
 * right". `evaluate` tries both arms and reports which one matched, so a
 * left-handed Halt and a right-handed Halt are the same spec, and a directional
 * signal given on the wrong arm fails as a *side* error rather than as a
 * mysteriously low score. The mirroring itself is one id swap — see
 * `mirrorMeasurementId`.
 */

import {
  MEASUREMENT_BY_ID,
  SIDE_KEY,
  formatMeasurement,
  formatShape,
  mirrorMeasurementId,
  sideOfMeasurementId,
} from '../cv/measurements';
import type { MeasurementInfo, MeasurementUnit, Measurements } from '../cv/measurements';
import { otherSide } from '../cv/types';
import type { HandShape, Side } from '../cv/types';

/* -------------------------------------------------------------------------- */
/* Constraints                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A side as written in a spec: `R` is the **signalling** arm, `L` the other one.
 * Which physical arm each denotes depends on the side being evaluated.
 */
export type SpecSide = 'R' | 'L';

/**
 * An inclusive band in the measurement's own unit. `null` is unbounded, so
 * `[0, null]` reads "at or above zero" — the form the plan's `rel` constraints
 * ("wrist above nose") take once the quantity itself is a signed difference.
 */
export type Band = readonly [min: number | null, max: number | null];

interface ConstraintBase {
  /**
   * Distance outside the band at which the score reaches 0. Defaults per unit —
   * see {@link DEFAULT_TOLERANCE}. Only affects scoring, never the verdict.
   */
  tolerance?: number;
  /**
   * What to tell the referee when this fails, in the imperative: "Straighten
   * your raised arm". Falls back to a readout generated from the band, which is
   * accurate but is not coaching — author this for anything a user will meet.
   */
  feedback?: string;
}

/** A measurement that must land inside a band. Most constraints are these. */
export interface RangeConstraint extends ConstraintBase {
  kind: 'range';
  /** A measurement id as authored, i.e. with `.R` meaning the signalling arm. */
  measure: string;
  band: Band;
}

/** A hand shape, for the three signals that read fingers at all. */
export interface HandConstraint extends ConstraintBase {
  kind: 'hand';
  side: SpecSide;
  shape: HandShape;
}

/**
 * Both arms doing the same thing, within a tolerance — the two-armed signals'
 * "symmetric" requirement. Being a comparison between the arms it is mirror-
 * invariant, so it evaluates identically on either side.
 */
export interface SymmetryConstraint extends ConstraintBase {
  kind: 'symmetry';
  /** A sided measurement *base*, e.g. `wrist.height`; both arms are read. */
  measure: string;
  /** Largest acceptable difference between the two arms. */
  maxDelta: number;
}

export type Constraint = RangeConstraint | HandConstraint | SymmetryConstraint;

/**
 * How far outside its band a measurement may stray before it scores zero.
 *
 * These are falloff widths, not pass bands: 15° is roughly the spread between
 * two referees making the same signal correctly, so a gesture a quarter of that
 * outside its band reads as 0.75 rather than as a cliff. Nothing passes because
 * of them.
 */
export const DEFAULT_TOLERANCE: Record<MeasurementUnit, number> = {
  deg: 15,
  torso: 0.15,
  ratio: 0.3,
  m: 0.1,
};

/* -------------------------------------------------------------------------- */
/* Authoring helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Constructors in the vocabulary t.63 is read in, so a spec says
 * `abduction('R', [60, 100])` rather than repeating measurement ids. They are
 * the typo barrier too: a hand-written id compiles whatever it says, and
 * `validateSpec` would only catch it once a test ran.
 */

type Options = ConstraintBase;

export function range(measure: string, band: Band, options: Options = {}): RangeConstraint {
  return { kind: 'range', measure, band, ...options };
}

/** Interior elbow angle: 180 straight, 90 square. */
export function elbow(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`elbow.${side}`, band, options);
}

/** Upper-arm angle from hanging at the side: 0 down, 90 lateral, 180 overhead. */
export function abduction(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`upper.abduction.${side}`, band, options);
}

/** Which part of the arm an angle is measured on. Parry is a forearm gesture. */
export type Segment = 'upper' | 'forearm';

/** Angle above the torso's horizontal: −90 down, 0 level, +90 overhead. */
export function elevation(
  side: SpecSide,
  band: Band,
  segment: Segment = 'upper',
  options?: Options
): RangeConstraint {
  return range(`${segment}.elevation.${side}`, band, options);
}

/**
 * Horizontal direction from straight ahead toward that arm's own side: 0
 * forward, +90 lateral. Degenerate for a near-vertical limb, so a spec reading
 * azimuth must bound elevation as well.
 */
export function azimuth(
  side: SpecSide,
  band: Band,
  segment: Segment = 'upper',
  options?: Options
): RangeConstraint {
  return range(`${segment}.azimuth.${side}`, band, options);
}

/** Wrist height in torso lengths: 0 at the hips, 1 at the shoulders. */
export function wristHeight(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`wrist.height.${side}`, band, options);
}

/** Wrist height relative to that shoulder; 0 is level with it. */
export function wristVsShoulder(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`wrist.vsShoulder.${side}`, band, options);
}

/** Wrist height relative to the nose; positive is above it, as Halt requires. */
export function wristVsNose(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`wrist.vsNose.${side}`, band, options);
}

/** Wrist offset from the midline, toward that arm's own side, in torso lengths. */
export function wristLateral(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`wrist.lateral.${side}`, band, options);
}

/** Wrist offset in front of the chest, in torso lengths. */
export function wristForward(side: SpecSide, band: Band, options?: Options): RangeConstraint {
  return range(`wrist.forward.${side}`, band, options);
}

/** Wrist separation as a multiple of shoulder width; under 1 is converged. */
export function wristGap(band: Band, options?: Options): RangeConstraint {
  return range('wrists.gap', band, options);
}

export function hand(side: SpecSide, shape: HandShape, options?: Options): HandConstraint {
  return { kind: 'hand', side, shape, ...options };
}

/** Both arms alike: `symmetry('wrist.height', 0.12)` wants them level. */
export function symmetry(measure: string, maxDelta: number, options?: Options): SymmetryConstraint {
  return { kind: 'symmetry', measure, maxDelta, ...options };
}

/* -------------------------------------------------------------------------- */
/* Specs                                                                      */
/* -------------------------------------------------------------------------- */

export interface SignalSpec {
  /** Stable key; scenario answer keys reference it. */
  id: string;
  label: string;
  /** Rulebook article, e.g. `t.63`. */
  rule: string;
  /** The official description, quoted for the reference page. */
  description: string;
  /**
   * t.63's "each signal must last 1–2 seconds": `[1000, 2000]`. The hold machine
   * (stage 10) enforces the floor; the ceiling is expressiveness guidance, not a
   * failure condition.
   */
  holdMs: readonly [number, number];
  /**
   * Whether the hand landmarker must run. It roughly doubles per-frame cost and
   * only Halt, Point in line and Nothing need it, so it is per-spec rather than
   * always-on.
   */
  needsHands: boolean;
  /**
   * Whether the arm used denotes a fencer. When true the matched `side` is part
   * of the answer and stage 16 grades it; when false it is informational — a
   * referee may Halt with either hand.
   */
  directional: boolean;
  constraints: readonly Constraint[];
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export type ReasonCode =
  /** A measurement outside its band. */
  | 'out_of_range'
  /** The right hand shape was not the one asked for. */
  | 'wrong_shape'
  /** The arms were not alike enough. */
  | 'asymmetric'
  /** Nothing to compare against: the landmark or the hand was not tracked. */
  | 'unmeasured';

/** One failed constraint, in the form the UI shows it. */
export interface Reason {
  code: ReasonCode;
  /** The measurement id actually read — mirrored, so it names the real arm. */
  measure: string;
  /** Ready to display, either the spec's `feedback` or a generated readout. */
  message: string;
  /** This constraint's score, 0–1. */
  score: number;
}

/** One constraint's verdict, kept in spec order for debugging views. */
export interface Check {
  constraint: Constraint;
  measure: string;
  /** The value read, or `null` where it could not be measured. */
  value: number | null;
  pass: boolean;
  score: number;
  reason: Reason | null;
}

export interface Evaluation {
  /** The spec's id. */
  signal: string;
  /**
   * The arm the spec was mirrored onto. Meaningful only when the spec is
   * `directional`; symmetric two-armed signals report `right` by convention.
   */
  side: Side;
  /** True only when every constraint landed inside its band. */
  pass: boolean;
  /**
   * Mean constraint score, 0–1. Rises as more of the gesture comes right, which
   * is what makes it usable as a progress bar rather than a second verdict.
   */
  score: number;
  /** Failed constraints, worst first. Empty when `pass`. */
  failures: Reason[];
  checks: Check[];
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

const FALLBACK_UNIT: MeasurementUnit = 'ratio';

/**
 * Description of a measurement id. Unknown ids get a usable stand-in rather than
 * throwing: a typo should surface as a failing check with the id in the message,
 * and as a `validateSpec` error in the test suite — not as an exception in the
 * middle of a live frame.
 */
function infoFor(id: string): MeasurementInfo {
  return (
    MEASUREMENT_BY_ID.get(id) ?? {
      id,
      label: id,
      unit: FALLBACK_UNIT,
      hint: '',
      side: sideOfMeasurementId(id),
      group: 'unknown',
    }
  );
}

/**
 * A measurement id as read for a given signalling side.
 *
 * Exported for `calibration.ts`, which needs the exact same `.R`/`.L` mirroring
 * to turn a recorded arm into the anatomical id a calibration was measured
 * under — reusing this keeps the two in lockstep by construction.
 */
export function resolve(measure: string, side: Side): string {
  return side === 'right' ? measure : mirrorMeasurementId(measure);
}

/** How far outside the band a value fell; 0 when it is inside. */
function distanceOutside(value: number, [min, max]: Band): number {
  const below = min === null ? 0 : min - value;
  const above = max === null ? 0 : value - max;
  return Math.max(below, above, 0);
}

/** 1 inside the band, falling linearly to 0 across `tolerance` outside it. */
function bandScore(value: number, band: Band, tolerance: number): number {
  const outside = distanceOutside(value, band);
  if (outside === 0) return 1;
  if (!(tolerance > 0)) return 0;
  return Math.max(0, 1 - outside / tolerance);
}

function toleranceFor(constraint: ConstraintBase, unit: MeasurementUnit): number {
  return constraint.tolerance ?? DEFAULT_TOLERANCE[unit];
}

function sideWord(side: Side | null): string {
  return side === null ? '' : ` (${side} arm)`;
}

/** The band in words, in the measurement's own unit. */
export function formatBand([min, max]: Band, unit: MeasurementUnit): string {
  const low = min === null ? null : formatMeasurement(min, unit);
  const high = max === null ? null : formatMeasurement(max, unit);
  if (low !== null && high !== null) return `${low}–${high}`;
  if (low !== null) return `at least ${low}`;
  if (high !== null) return `at most ${high}`;
  return 'any value';
}

function failed(
  constraint: Constraint,
  measure: string,
  value: number | null,
  score: number,
  code: ReasonCode,
  generated: string
): Check {
  return {
    constraint,
    measure,
    value,
    pass: false,
    score,
    reason: { code, measure, message: constraint.feedback ?? generated, score },
  };
}

function passed(constraint: Constraint, measure: string, value: number | null): Check {
  return { constraint, measure, value, pass: true, score: 1, reason: null };
}

function checkRange(
  constraint: RangeConstraint,
  values: Measurements['values'],
  side: Side
): Check {
  const measure = resolve(constraint.measure, side);
  const info = infoFor(measure);
  const value = values[measure] ?? null;

  if (value === null || !Number.isFinite(value)) {
    return failed(
      constraint,
      measure,
      null,
      0,
      'unmeasured',
      `${info.label}${sideWord(info.side)} could not be measured — make sure your whole upper body is in frame.`
    );
  }

  const band = constraint.band;
  if (distanceOutside(value, band) === 0) return passed(constraint, measure, value);

  return failed(
    constraint,
    measure,
    value,
    bandScore(value, band, toleranceFor(constraint, info.unit)),
    'out_of_range',
    `${info.label}${sideWord(info.side)}: ${formatMeasurement(value, info.unit)} — expected ${formatBand(band, info.unit)}.`
  );
}

function checkHand(constraint: HandConstraint, measurements: Measurements, side: Side): Check {
  // Hand constraints are sided like everything else, so `R` follows the
  // signalling arm through the same mirroring.
  const specSide: Side = constraint.side === 'R' ? side : otherSide(side);
  const measure = `hand.shape.${SIDE_KEY[specSide]}`;
  const shape = measurements.shapes[specSide];

  if (shape === null) {
    return failed(
      constraint,
      measure,
      null,
      0,
      'unmeasured',
      `Your ${specSide} hand was not detected — hold it where the camera can see it.`
    );
  }
  if (shape === constraint.shape) return passed(constraint, measure, null);

  return failed(
    constraint,
    measure,
    null,
    0,
    'wrong_shape',
    `Your ${specSide} hand reads as ${formatShape(shape)} — this signal needs ${formatShape(constraint.shape)}.`
  );
}

function checkSymmetry(constraint: SymmetryConstraint, values: Measurements['values']): Check {
  const left = values[`${constraint.measure}.L`] ?? null;
  const right = values[`${constraint.measure}.R`] ?? null;
  const info = infoFor(`${constraint.measure}.R`);

  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) {
    return failed(
      constraint,
      constraint.measure,
      null,
      0,
      'unmeasured',
      `${info.label} could not be measured on both arms — make sure both are in frame.`
    );
  }

  const delta = Math.abs(right - left);
  if (delta <= constraint.maxDelta) return passed(constraint, constraint.measure, delta);

  return failed(
    constraint,
    constraint.measure,
    delta,
    bandScore(delta, [null, constraint.maxDelta], toleranceFor(constraint, info.unit)),
    'asymmetric',
    `Your arms differ by ${formatMeasurement(delta, info.unit)} in ${info.label.toLowerCase()} — this signal needs them level.`
  );
}

function checkOne(constraint: Constraint, measurements: Measurements, side: Side): Check {
  switch (constraint.kind) {
    case 'range':
      return checkRange(constraint, measurements.values, side);
    case 'hand':
      return checkHand(constraint, measurements, side);
    case 'symmetry':
      return checkSymmetry(constraint, measurements.values);
  }
}

/**
 * Grades a spec against one frame, with `.R` taken to mean the given arm.
 *
 * Every constraint is evaluated even once one has failed: the score is a mean
 * over all of them, and the failure list is what the user is shown, so stopping
 * early would report the first mistake rather than the worst one.
 */
export function evaluateOn(spec: SignalSpec, measurements: Measurements, side: Side): Evaluation {
  const checks = spec.constraints.map((constraint) => checkOne(constraint, measurements, side));
  const failures = checks
    .map((check) => check.reason)
    .filter((reason): reason is Reason => reason !== null)
    .sort((a, b) => a.score - b.score);

  const score =
    checks.length === 0 ? 0 : checks.reduce((sum, c) => sum + c.score, 0) / checks.length;

  return {
    signal: spec.id,
    side,
    pass: checks.length > 0 && checks.every((check) => check.pass),
    score,
    failures,
    checks,
  };
}

/**
 * Grades a spec against one frame on whichever arm fits it better.
 *
 * Both arms are always tried, including for non-directional signals: Halt is not
 * directional but is still one-armed, and a referee raising their left hand is
 * making it correctly. Ties go to the right arm, so a symmetric two-armed signal
 * reports deterministically.
 */
export function evaluate(spec: SignalSpec, measurements: Measurements): Evaluation {
  // The as-authored side goes first and is only displaced on a strict
  // improvement, so a symmetric spec — where both arms score identically —
  // always answers `right` rather than reporting whichever arm the loop
  // happened to visit last.
  const asAuthored = evaluateOn(spec, measurements, 'right');
  const mirrored = evaluateOn(spec, measurements, 'left');

  if (mirrored.pass !== asAuthored.pass) return mirrored.pass ? mirrored : asAuthored;
  return mirrored.score > asAuthored.score ? mirrored : asAuthored;
}

/** Every spec graded against one frame, best first. */
export function evaluateAll(
  specs: readonly SignalSpec[],
  measurements: Measurements
): Evaluation[] {
  return specs
    .map((spec) => evaluate(spec, measurements))
    .sort((a, b) => Number(b.pass) - Number(a.pass) || b.score - a.score);
}

/**
 * The best passing spec, or `null` if none passed.
 *
 * Used by the scenario call phase, where the referee signals freely and the app
 * has to name what it saw. Two specs passing at once is a spec-authoring bug —
 * stage 11's discriminator tests exist to keep it from happening — but if it
 * does, the higher-scoring one wins rather than the first declared.
 */
export function bestMatch(
  specs: readonly SignalSpec[],
  measurements: Measurements
): Evaluation | null {
  const [best] = evaluateAll(specs, measurements);
  return best?.pass ? best : null;
}

/* -------------------------------------------------------------------------- */
/* Jitter rejection                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Consecutive passing frames before a match is believed.
 *
 * At the loop's ~20–24 fps this is 125–150 ms, far below t.63's one-second floor,
 * so it costs the referee nothing while discarding the single-frame flickers that
 * pose estimation produces when a limb crosses the torso.
 */
export const STABLE_FRAMES = 3;

export interface Stability {
  /** Consecutive passing frames of the same signal on the same arm. */
  streak: number;
  /** What the streak is of, or `null` when there is no streak. */
  signal: string | null;
  side: Side | null;
  /** Whether the streak has reached {@link STABLE_FRAMES}. */
  stable: boolean;
}

export function idleStability(): Stability {
  return { streak: 0, signal: null, side: null, stable: false };
}

/**
 * Folds one frame's verdict into the streak.
 *
 * A change of signal *or* of arm restarts the count rather than continuing it: a
 * referee flickering between two signals, or between two arms, has not held
 * either, and treating that as a continuous hold is exactly the false positive
 * this exists to prevent. Pass `null` for a frame where nothing matched.
 */
export function advanceStability(state: Stability, evaluation: Evaluation | null): Stability {
  if (!evaluation?.pass) return idleStability();

  const continues = state.signal === evaluation.signal && state.side === evaluation.side;
  const streak = continues ? state.streak + 1 : 1;

  return {
    streak,
    signal: evaluation.signal,
    side: evaluation.side,
    stable: streak >= STABLE_FRAMES,
  };
}

/* -------------------------------------------------------------------------- */
/* Spec validation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Authoring mistakes that would otherwise fail silently at runtime.
 *
 * Stages 11 and 12 author ten specs by hand against live readouts, and every
 * problem this catches produces a spec that simply never passes — the least
 * debuggable failure mode in the app. One test calling this over the spec list
 * removes the whole class.
 */
export function validateSpec(spec: SignalSpec): string[] {
  const problems: string[] = [];
  const push = (problem: string) => problems.push(`${spec.id}: ${problem}`);

  if (spec.constraints.length === 0) push('has no constraints, so anything would pass it');

  const known = (measure: string) => {
    if (!MEASUREMENT_BY_ID.has(measure)) push(`unknown measurement "${measure}"`);
  };

  let readsHands = false;
  for (const constraint of spec.constraints) {
    switch (constraint.kind) {
      case 'range': {
        known(constraint.measure);
        const [min, max] = constraint.band;
        if (min === null && max === null) push(`"${constraint.measure}" is bounded at neither end`);
        if (min !== null && max !== null && min > max) {
          push(`"${constraint.measure}" has an inverted band [${min}, ${max}]`);
        }
        if (constraint.tolerance !== undefined && constraint.tolerance < 0) {
          push(`"${constraint.measure}" has a negative tolerance`);
        }
        break;
      }
      case 'hand':
        readsHands = true;
        if (constraint.shape === 'unknown') {
          push('asks for the "unknown" hand shape, which nothing can satisfy');
        }
        break;
      case 'symmetry':
        known(`${constraint.measure}.R`);
        if (constraint.maxDelta < 0) push(`"${constraint.measure}" has a negative maxDelta`);
        break;
    }
  }

  // Both directions matter. Without `needsHands` the landmarker never runs and
  // the constraint fails every frame; with it and no hand constraint, every
  // frame pays for a model nothing reads.
  if (readsHands && !spec.needsHands) push('has hand constraints but does not set needsHands');
  if (!readsHands && spec.needsHands) push('sets needsHands but has no hand constraints');

  const [min, max] = spec.holdMs;
  if (min <= 0 || max < min) push(`has a nonsensical holdMs [${min}, ${max}]`);

  return problems;
}
