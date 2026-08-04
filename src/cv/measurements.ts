/**
 * Every quantity a signal spec can reference, measured from one frame.
 *
 * This is the calibration page's data source, and its reason for existing. The
 * thresholds in `docs/PLAN.md` were read off the t.63 illustrations — drawings,
 * not measurements — so they are estimates. The fastest way to a classifier that
 * works is to stand in front of the camera, perform each signal correctly, read
 * the true numbers here, and write those into the specs. Nothing downstream
 * should be tuned before this page can be watched.
 *
 * Two properties are load-bearing:
 *
 * - **Every value is torso-frame or dimensionless.** Angles come from
 *   `geometry.ts`, distances are divided by the referee's own torso length, and
 *   ratios are ratios. So a number read here by one person at one distance from
 *   the camera means the same thing for anyone else, which is the only way a
 *   threshold copied into a spec can be trusted.
 * - **Values are keyed by id, not by position.** The recorder summarises
 *   `Record<id, number>` without knowing what any of it means, and the page
 *   renders rows from the same declarations, so a measurement added here appears
 *   in both without further wiring.
 *
 * Sides are anatomical throughout — `.R` is the referee's actual right arm,
 * whichever side of the mirrored image it appears on. See `Side` in `types.ts`.
 */

import {
  angleBetween,
  elbowAngle,
  length,
  limbAngles,
  shoulderWidth,
  subtract,
  toTorsoFrame,
  torsoFrame,
  torsoHeight,
} from './geometry';
import { handForSide, handMetrics } from './hands';
import { FINGERS, POSE, POSE_BY_SIDE, SIDES, otherSide } from './types';
import type { HandFrame, HandShape, Side, WorldPoint } from './types';

/* -------------------------------------------------------------------------- */
/* Declarations                                                               */
/* -------------------------------------------------------------------------- */

/** Suffix used in measurement ids, matching the `elbow.R` form the specs use. */
export const SIDE_KEY: Record<Side, 'L' | 'R'> = { left: 'L', right: 'R' };

const SIDE_FROM_KEY: Record<string, Side> = { L: 'left', R: 'right' };

export type MeasurementUnit =
  /** Degrees. */
  | 'deg'
  /** Torso lengths — hips to shoulders is 1. */
  | 'torso'
  /** A dimensionless ratio. */
  | 'ratio'
  /** Meters. Only the body's own dimensions are reported this way. */
  | 'm';

interface RowBase {
  label: string;
  unit: MeasurementUnit;
  /** What the number means, in the terms the specs are written in. */
  hint: string;
}

/** A row measured once per arm; its ids are `${base}.R` and `${base}.L`. */
export interface SidedRow extends RowBase {
  kind: 'sided';
  base: string;
}

/** A row with a single value for the whole body. */
export interface ScalarRow extends RowBase {
  kind: 'scalar';
  id: string;
}

export type MeasurementRow = SidedRow | ScalarRow;

export interface MeasurementGroup {
  id: string;
  label: string;
  /** Why these numbers are worth watching — shown above the table. */
  note: string;
  rows: MeasurementRow[];
}

function sided(base: string, label: string, unit: MeasurementUnit, hint: string): SidedRow {
  return { kind: 'sided', base, label, unit, hint };
}

function scalar(id: string, label: string, unit: MeasurementUnit, hint: string): ScalarRow {
  return { kind: 'scalar', id, label, unit, hint };
}

/** The measurement id for one side of a sided row. */
export function sidedId(base: string, side: Side): string {
  return `${base}.${SIDE_KEY[side]}`;
}

/** Every id a row contributes — one per side, or one outright. */
export function idsOf(row: MeasurementRow): string[] {
  return row.kind === 'sided' ? SIDES.map((side) => sidedId(row.base, side)) : [row.id];
}

export const MEASUREMENT_GROUPS: readonly MeasurementGroup[] = [
  {
    id: 'arm',
    label: 'Arm angles',
    note: 'Measured in the torso frame, so they do not change when you turn away from the camera — watch “off square” below while you check that.',
    rows: [
      sided('elbow', 'Elbow', 'deg', '180 straight, 90 square, 0 folded shut'),
      sided(
        'upper.elevation',
        'Upper arm elevation',
        'deg',
        '−90 hanging down, 0 level, +90 overhead'
      ),
      sided(
        'upper.abduction',
        'Upper arm abduction',
        'deg',
        'elevation + 90 — the form the t.63 readings use'
      ),
      sided(
        'upper.azimuth',
        'Upper arm azimuth',
        'deg',
        '0 straight ahead, +90 out to that arm’s own side'
      ),
      sided(
        'forearm.elevation',
        'Forearm elevation',
        'deg',
        'near +90 is the vertical forearm of Parry'
      ),
      sided(
        'forearm.azimuth',
        'Forearm azimuth',
        'deg',
        'near +90 is the lateral forearm of Attack'
      ),
    ],
  },
  {
    id: 'wrist',
    label: 'Wrist position',
    note: 'In torso lengths rather than meters, so one threshold fits a 1.6 m and a 2 m referee. Height is the primary discriminator for the two-armed signals.',
    rows: [
      sided('wrist.height', 'Height', 'torso', '0 at the hips, 1 at the shoulders'),
      sided('wrist.vsShoulder', 'Height vs. shoulder', 'torso', '0 is level with that shoulder'),
      sided(
        'wrist.vsNose',
        'Height vs. nose',
        'torso',
        'positive is above the nose, as Halt requires'
      ),
      sided(
        'wrist.lateral',
        'Out from midline',
        'torso',
        'positive is away from the body’s centre line'
      ),
      sided('wrist.forward', 'Forward of chest', 'torso', 'positive is in front of the chest'),
    ],
  },
  {
    id: 'body',
    label: 'Both arms, and the body',
    note: 'The two-armed signals separate on these. “Off square” is the invariance check: turn on the spot and every angle above should hold still while this number climbs.',
    rows: [
      scalar(
        'wrists.gap',
        'Wrist separation',
        'ratio',
        '× shoulder width; under 1 is hands converged'
      ),
      scalar(
        'wrists.heightDelta',
        'Wrist height difference',
        'torso',
        '0 is level — the symmetry Double hit wants'
      ),
      scalar('body.turn', 'Off square to camera', 'deg', '0 is facing the camera squarely'),
      scalar('body.lean', 'Lean from vertical', 'deg', '0 is standing upright'),
      scalar(
        'body.torso',
        'Torso length',
        'm',
        'hips to shoulders — the scale every height is divided by'
      ),
      scalar('body.shoulderWidth', 'Shoulder width', 'm', 'the reference for wrist separation'),
    ],
  },
  {
    id: 'hand',
    label: 'Hand shape',
    note: 'Only Halt, Point in line and Nothing read fingers. Each number is tip-to-wrist over knuckle-to-wrist: above 1.15 counts as extended, below 0.95 as curled, and the gap between is deliberately “unknown”.',
    rows: [
      ...FINGERS.map((finger) =>
        sided(`hand.${finger}`, `${finger[0].toUpperCase()}${finger.slice(1)} finger`, 'ratio', '')
      ),
      sided('hand.thumb', 'Thumb', 'ratio', 'reported only — no shape is classified on it'),
    ],
  },
];

/** Every declared id, in display order. */
export const MEASUREMENT_IDS: readonly string[] = MEASUREMENT_GROUPS.flatMap((group) =>
  group.rows.flatMap(idsOf)
);

/* -------------------------------------------------------------------------- */
/* Ids                                                                        */
/* -------------------------------------------------------------------------- */

/** What an id names, for anything that reads measurements it did not declare. */
export interface MeasurementInfo {
  id: string;
  /** The row's label, without a side — e.g. `Elbow`. */
  label: string;
  unit: MeasurementUnit;
  hint: string;
  /** The arm it describes, or `null` for a whole-body value. */
  side: Side | null;
  /** Id of the group it is displayed under. */
  group: string;
}

/**
 * Every measurement, by id.
 *
 * The signal evaluator (stage 9) is the reason this exists: a constraint names a
 * measurement and nothing else, and the evaluator turns that name into a label
 * and a unit to build feedback with. So a spec says `elbow.R` and the user is
 * told "Elbow (right arm): 120° — expected 155°–180°" without the spec carrying
 * either word.
 */
export const MEASUREMENT_BY_ID: ReadonlyMap<string, MeasurementInfo> = new Map(
  MEASUREMENT_GROUPS.flatMap((group) =>
    group.rows.flatMap((row) =>
      idsOf(row).map((id): [string, MeasurementInfo] => [
        id,
        {
          id,
          label: row.label,
          unit: row.unit,
          hint: row.hint,
          side: sideOfMeasurementId(id),
          group: group.id,
        },
      ])
    )
  )
);

/** The arm an id describes, or `null` if it is a whole-body measurement. */
export function sideOfMeasurementId(id: string): Side | null {
  return SIDE_FROM_KEY[id.slice(-1)] && id.at(-2) === '.' ? SIDE_FROM_KEY[id.slice(-1)] : null;
}

/**
 * The same measurement on the other arm; whole-body ids are returned unchanged.
 *
 * This is the whole of the evaluator's directional mirroring. Every sided
 * quantity here is authored to read the same number for a gesture and its mirror
 * image — azimuth and lateral offset are signed toward the arm's *own* side
 * precisely so that they do — which means a spec written once for the right arm
 * grades a left-arm performance by swapping ids, with no threshold rewritten and
 * no sign flipped.
 */
export function mirrorMeasurementId(id: string): string {
  const side = sideOfMeasurementId(id);
  if (side === null) return id;
  return `${id.slice(0, -1)}${SIDE_KEY[otherSide(side)]}`;
}

/* -------------------------------------------------------------------------- */
/* Measuring                                                                  */
/* -------------------------------------------------------------------------- */

export interface Measurements {
  /** Every declared id, present whether or not it could be measured. */
  values: Record<string, number | null>;
  /** Classified shape per hand; `null` where that hand was not detected. */
  shapes: Record<Side, HandShape | null>;
  /** Whether a usable torso frame was built — if not, every pose value is null. */
  tracked: boolean;
}

/** The full id set with nothing measured — what the page shows before starting. */
export function emptyMeasurements(): Measurements {
  const values: Record<string, number | null> = {};
  for (const id of MEASUREMENT_IDS) values[id] = null;
  return { values, shapes: { left: null, right: null }, tracked: false };
}

/** Toward the camera, in MediaPipe's world convention. */
const TOWARD_CAMERA = { x: 0, y: 0, z: -1 };
/** Up, in the same convention: image +y runs down. */
const WORLD_UP = { x: 0, y: -1, z: 0 };

/**
 * Measures one frame.
 *
 * Every failure is a `null` rather than an omission or a guess: a wrist the model
 * could not see reads as an em dash on the page, not as a plausible number the
 * user might write into a spec.
 */
export function measure(
  pose: readonly WorldPoint[] | null | undefined,
  hands: HandFrame | null
): Measurements {
  const result = emptyMeasurements();
  const { values, shapes } = result;

  const frame = pose ? torsoFrame(pose) : null;
  if (pose && frame) {
    result.tracked = true;

    const nose = pose[POSE.NOSE];
    const noseHeight = nose ? torsoHeight(frame, nose) : null;

    for (const side of SIDES) {
      const key = SIDE_KEY[side];
      values[`elbow.${key}`] = elbowAngle(pose, side);

      const upper = limbAngles(pose, frame, side, 'upper');
      values[`upper.elevation.${key}`] = upper?.elevation ?? null;
      values[`upper.abduction.${key}`] = upper?.abduction ?? null;
      values[`upper.azimuth.${key}`] = upper?.azimuth ?? null;

      const forearm = limbAngles(pose, frame, side, 'forearm');
      values[`forearm.elevation.${key}`] = forearm?.elevation ?? null;
      values[`forearm.azimuth.${key}`] = forearm?.azimuth ?? null;

      const wrist = pose[POSE_BY_SIDE[side].wrist];
      if (!wrist) continue;

      const local = toTorsoFrame(frame, wrist);
      const height = local.y / frame.scale;
      values[`wrist.height.${key}`] = height;
      // Signed toward the arm's own side, so a spec written for the right arm
      // reads the same number when mirrored onto the left.
      values[`wrist.lateral.${key}`] = (side === 'right' ? local.x : -local.x) / frame.scale;
      values[`wrist.forward.${key}`] = local.z / frame.scale;

      const shoulder = pose[POSE_BY_SIDE[side].shoulder];
      if (shoulder) values[`wrist.vsShoulder.${key}`] = height - torsoHeight(frame, shoulder);
      if (noseHeight !== null) values[`wrist.vsNose.${key}`] = height - noseHeight;
    }

    const leftWrist = pose[POSE.LEFT_WRIST];
    const rightWrist = pose[POSE.RIGHT_WRIST];
    const width = shoulderWidth(pose);
    if (leftWrist && rightWrist && width) {
      values['wrists.gap'] = length(subtract(rightWrist, leftWrist)) / width;
    }
    const heightL = values['wrist.height.L'];
    const heightR = values['wrist.height.R'];
    if (heightL !== null && heightR !== null) {
      values['wrists.heightDelta'] = Math.abs(heightR - heightL);
    }

    values['body.turn'] = angleBetween(frame.forward, TOWARD_CAMERA);
    values['body.lean'] = angleBetween(frame.up, WORLD_UP);
    values['body.torso'] = frame.scale;
    values['body.shoulderWidth'] = width;
  }

  if (hands) {
    for (const side of SIDES) {
      const hand = handForSide(hands.hands, side);
      if (!hand) continue;
      const key = SIDE_KEY[side];
      const metrics = handMetrics(hand.world);
      shapes[side] = metrics.shape;
      for (const finger of FINGERS) values[`hand.${finger}.${key}`] = metrics.ratios[finger];
      values[`hand.thumb.${key}`] = metrics.thumb.ratio;
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A value in the form it is read in.
 *
 * Angles are whole degrees: live pose estimation jitters by a degree or so, and
 * decimals there would be noise pretending to be precision. The dimensionless
 * quantities keep two places, because that is the resolution their thresholds are
 * written at.
 */
export function formatMeasurement(value: number | null, unit: MeasurementUnit): string {
  if (value === null || !Number.isFinite(value)) return '—';
  // `toFixed` keeps the sign of a value that rounds to zero, and a column of
  // readouts flickering between "0.00" and "-0.00" reads as a fault.
  const fixed = (places: number) => {
    const text = value.toFixed(places);
    return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
  };

  switch (unit) {
    case 'deg':
      return `${fixed(0)}°`;
    case 'm':
      return `${fixed(2)} m`;
    default:
      return fixed(2);
  }
}

const SHAPE_LABELS: Record<HandShape, string> = {
  open_palm: 'open palm',
  fist: 'fist',
  index_point: 'index point',
  unknown: 'unknown',
};

/** Hand shape in words; `null` means that hand was not detected at all. */
export function formatShape(shape: HandShape | null): string {
  return shape === null ? 'not detected' : SHAPE_LABELS[shape];
}
