/**
 * Expert-recorded calibration — replacing a mannequin-authored band with one
 * measured on a real referee.
 *
 * `specs.ts`'s bands were authored against the synthetic mannequin fixture (see
 * that file's "Tuning status" comment): a sound starting point, not a finished
 * tuning. This module is the finish: record a real person performing a signal
 * correctly, and derive a band centred on what they actually measured instead of
 * on a guess widened past a mannequin value.
 *
 * It sits *above* `evaluator.ts`, not inside it. `evaluate`/`evaluateAll`/
 * `bestMatch` and the hold machine already operate on a plain `SignalSpec`
 * object and don't care where its bands came from, so calibrating is: record a
 * signal, derive a new band per constraint, and hand the result to the same
 * grading engine. Nothing downstream changes.
 *
 * Pure and React-free, like `specs.ts`/`evaluator.ts`/`holdMachine.ts` — the
 * recording UI (a later stage) is the only thing that touches a camera.
 */

import { MEASUREMENT_BY_ID } from '../cv/measurements';
import type { MeasurementUnit } from '../cv/measurements';
import type { HandShape, Side, WorldPoint } from '../cv/types';
import { DEFAULT_TOLERANCE, resolve } from './evaluator';
import type { Band, SignalSpec } from './evaluator';
import { SIGNAL_SPECS } from './specs';

/* -------------------------------------------------------------------------- */
/* Recording                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One signal's recorded reference, as performed by the expert.
 *
 * `measurements`/`shapes` are anatomical — read straight off `measure()` — not
 * authored-space, because the constraint that reads them is not decided until
 * `applyCalibration` mirrors it through `side`. `rawPoseWorld` is the last
 * recorded frame's landmarks: grading only ever reads `measurements`, but
 * keeping the pose itself is what makes this a durable record rather than just
 * a handful of numbers.
 */
export interface SignalCalibration {
  signalId: string;
  /** Which anatomical arm performed the signalling role during the recording. */
  side: Side;
  recordedAtMs: number;
  measurements: Record<string, number | null>;
  shapes: { right: HandShape | null; left: HandShape | null };
  rawPoseWorld: WorldPoint[];
}

/** Every saved recording, keyed by `SignalSpec.id`. */
export type CalibrationStore = Record<string, SignalCalibration>;

/** Adds or replaces the recording for `calibration.signalId`. */
export function recordCalibration(
  store: CalibrationStore,
  calibration: SignalCalibration
): CalibrationStore {
  return { ...store, [calibration.signalId]: calibration };
}

/** Drops back to the authored default for one signal. */
export function clearCalibration(store: CalibrationStore, signalId: string): CalibrationStore {
  if (!(signalId in store)) return store;
  const next = { ...store };
  delete next[signalId];
  return next;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export const STORAGE_KEY = 'far:signalCalibration:v1';

/** Reads the saved store, falling back to empty for anything unusable. */
export function loadCalibrationStore(): CalibrationStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as CalibrationStore) : {};
  } catch {
    // Storage can throw in private-mode / blocked-cookie contexts, and stored
    // JSON can predate a shape change — either way, grade against defaults.
    return {};
  }
}

export function saveCalibrationStore(store: CalibrationStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // The recording simply does not persist; the session still works.
  }
}

/* -------------------------------------------------------------------------- */
/* Band derivation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Replaces `original` with a band centred on `recordedValue`, except that a
 * bound left unbounded in the *authored* band stays unbounded.
 *
 * This is "replace, not recenter": a constraint written "wrist above nose, no
 * ceiling" must not gain an artificial ceiling just because one recording
 * measured one specific height, while a constraint closed on both sides gets a
 * fully recalibrated band. `margins` defaults to `DEFAULT_TOLERANCE` — already
 * documented as roughly the spread between two referees making the same signal
 * correctly, which is exactly the right-sized margin for a single recording.
 */
export function calibratedBand(
  original: Band,
  recordedValue: number,
  unit: MeasurementUnit,
  margins: Record<MeasurementUnit, number> = DEFAULT_TOLERANCE
): Band {
  const [min, max] = original;
  const margin = margins[unit];
  return [
    min === null ? null : recordedValue - margin,
    max === null ? null : recordedValue + margin,
  ];
}

/* -------------------------------------------------------------------------- */
/* Applying to specs                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every spec with a recording in `store` gets its `range` constraints' bands
 * replaced; everything else — `hand`/`symmetry` constraints (categorical or a
 * cross-arm comparison, neither is a band to widen) and specs with no
 * recording — passes through untouched. A spec with no recording is returned
 * by the same object reference, so grading an uncalibrated signal costs
 * nothing extra.
 */
export function applyCalibration(
  specs: readonly SignalSpec[],
  store: CalibrationStore
): SignalSpec[] {
  return specs.map((spec) => {
    const calibration = store[spec.id];
    if (!calibration) return spec;

    const constraints = spec.constraints.map((constraint) => {
      if (constraint.kind !== 'range') return constraint;

      // `constraint.measure` is authored space (`.R` = signalling arm);
      // `calibration.side` is the anatomical arm that signalled during the
      // recording, so this is the same mirroring `evaluateOn` uses to read a
      // live frame — here it reads the recording instead.
      const anatomical = resolve(constraint.measure, calibration.side);
      const recorded = calibration.measurements[anatomical];
      if (recorded === null || recorded === undefined || !Number.isFinite(recorded)) {
        return constraint;
      }

      const unit = MEASUREMENT_BY_ID.get(anatomical)?.unit ?? 'ratio';
      return { ...constraint, band: calibratedBand(constraint.band, recorded, unit) };
    });

    return { ...spec, constraints };
  });
}

/** The core ten, with every available recording applied. */
export function getCalibratedSpecs(): SignalSpec[] {
  return applyCalibration(SIGNAL_SPECS, loadCalibrationStore());
}

/** One calibrated spec by id, or `undefined` for anything outside the core ten. */
export function getCalibratedSpec(id: string): SignalSpec | undefined {
  return getCalibratedSpecs().find((spec) => spec.id === id);
}
