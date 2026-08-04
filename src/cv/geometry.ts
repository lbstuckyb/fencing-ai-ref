/**
 * Torso-frame geometry — the math every signal spec is built on.
 *
 * Operates exclusively on **world landmarks**: metric, hip-origin, and therefore
 * already translation- and scale-invariant. Nothing here may touch the
 * normalized set (see `types.ts`); that belongs to the overlay alone.
 *
 * ## Why a torso frame
 *
 * A referee does not stand square to the webcam, and should not have to. Angles
 * measured in camera space change the moment they turn or lean, so the same
 * correct signal reads differently from one session to the next. Expressing
 * every direction in a basis derived from the body itself removes that entirely:
 * an arm held laterally is at 90° abduction whether the referee faces the camera,
 * stands at 30° to it, or leans into the piste. This is the single biggest
 * robustness win available to a rule-based classifier, and everything downstream
 * assumes it.
 *
 * ## Coordinate convention
 *
 * MediaPipe world landmarks share the image frame's orientation: **+x runs to
 * the right of the image**, **+y runs down**, **+z runs away from the camera**.
 * A subject facing the camera therefore has their anatomical right at −x, up at
 * −y, and their forward (out of the chest) at −z.
 *
 * That makes `{right, up, forward}` = `{−x, −y, −z}`, so `forward = up × right`.
 * That cross-product order is the one assumption in this file that cannot be
 * checked without a real camera — the live readouts on `/calibrate` are where it
 * gets confirmed. If forward ever proves inverted, this is the single line to
 * flip, and only `azimuth` depends on it.
 *
 * ## Angle vocabulary
 *
 * Fixed here so the specs can be read against t.63 without re-deriving:
 *
 * - **elevation** — signed angle above the horizontal plane of the torso.
 *   −90° straight down, 0° level with the shoulders, +90° straight overhead.
 * - **abduction** — angle away from hanging at the side, i.e. `elevation + 90`.
 *   0° at the side, 90° lateral, 180° overhead. This is the one the t.63
 *   readings in the plan are written in.
 * - **azimuth** — direction within the horizontal plane, measured from straight
 *   ahead **toward the limb's own side**. 0° points forward, +90° is lateral
 *   outward, negative crosses the body's midline. Measuring toward the limb's
 *   own side is what lets a spec authored for the right arm be mirrored to the
 *   left without touching a number.
 */

import { POSE, POSE_BY_SIDE } from './types';
import type { Side, WorldPoint } from './types';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Below this the torso has no usable length — a badly cropped frame, or a
 * landmark set MediaPipe filled in from nothing. Real torsos are around 0.5 m.
 */
const MIN_TORSO_METERS = 0.05;

/* -------------------------------------------------------------------------- */
/* Vectors                                                                    */
/* -------------------------------------------------------------------------- */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scaleBy(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

export function negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Unit vector, or `null` for a zero-length input rather than a NaN triple. */
export function normalize(v: Vec3): Vec3 | null {
  const len = length(v);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** The component of `v` perpendicular to the unit vector `axis`. */
export function reject(v: Vec3, axis: Vec3): Vec3 {
  return subtract(v, scaleBy(axis, dot(v, axis)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Angle between two vectors in degrees, 0–180.
 *
 * The clamp matters: for near-parallel vectors the normalized dot product can
 * land at 1.0000000000000002, and `Math.acos` of that is NaN — a failure that
 * would show up as a straight arm, and only a straight arm, mysteriously failing
 * every constraint.
 */
export function angleBetween(a: Vec3, b: Vec3): number | null {
  const ua = normalize(a);
  const ub = normalize(b);
  if (!ua || !ub) return null;
  return Math.acos(clamp(dot(ua, ub), -1, 1)) * RAD_TO_DEG;
}

/**
 * The 3D angle at joint `b`, formed by the segments `b→a` and `b→c`, in degrees.
 * A straight limb is 180°, a right angle 90°.
 */
export function angleAt(a: Vec3, b: Vec3, c: Vec3): number | null {
  return angleBetween(subtract(a, b), subtract(c, b));
}

/* -------------------------------------------------------------------------- */
/* Torso frame                                                                */
/* -------------------------------------------------------------------------- */

/** An orthonormal basis fixed to the body, with the hip midpoint as origin. */
export interface TorsoFrame {
  /** Hip midpoint, in world coordinates. Height is measured from here. */
  origin: Vec3;
  /** Unit vector toward the referee's **anatomical** right. */
  right: Vec3;
  /** Unit vector from hips toward shoulders. */
  up: Vec3;
  /** Unit vector out of the chest. */
  forward: Vec3;
  /** Hip-to-shoulder distance in meters — the body's own scale reference. */
  scale: number;
}

function landmark(pose: readonly WorldPoint[], index: number): WorldPoint | undefined {
  return pose[index];
}

/**
 * Builds the torso basis, or returns `null` when the four trunk landmarks are
 * missing or degenerate — a caller with no frame has no business measuring
 * angles, and every accessor below propagates that null rather than inventing
 * one.
 *
 * `right` comes from the shoulder line rather than an average of shoulders and
 * hips: arm geometry is what gets graded, and when a referee's shoulders are
 * turned relative to their hips it is the shoulders the arms hang from. It is
 * then orthogonalized against `up`, so a raised or dropped shoulder tilts
 * nothing.
 */
export function torsoFrame(pose: readonly WorldPoint[]): TorsoFrame | null {
  const leftShoulder = landmark(pose, POSE.LEFT_SHOULDER);
  const rightShoulder = landmark(pose, POSE.RIGHT_SHOULDER);
  const leftHip = landmark(pose, POSE.LEFT_HIP);
  const rightHip = landmark(pose, POSE.RIGHT_HIP);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);

  const spine = subtract(shoulderMid, hipMid);
  const scale = length(spine);
  if (!(scale >= MIN_TORSO_METERS)) return null;

  const up = normalize(spine);
  if (!up) return null;

  const right = normalize(reject(subtract(rightShoulder, leftShoulder), up));
  if (!right) return null;

  return { origin: hipMid, right, up, forward: cross(up, right), scale };
}

/**
 * A world point re-expressed in the torso basis, in meters:
 * `x` toward the anatomical right, `y` up the spine, `z` out of the chest.
 */
export function toTorsoFrame(frame: TorsoFrame, point: Vec3): Vec3 {
  const relative = subtract(point, frame.origin);
  return {
    x: dot(relative, frame.right),
    y: dot(relative, frame.up),
    z: dot(relative, frame.forward),
  };
}

/**
 * Height up the spine in torso lengths: 0 at the hips, 1 at the shoulders.
 *
 * This is the primary discriminator for the two-armed signals — Double hit at
 * shoulder height, Simultaneous at chest, Nothing below the waist — and being
 * expressed in torso lengths rather than meters is what makes one threshold work
 * for a 1.6 m and a 2 m referee alike.
 */
export function torsoHeight(frame: TorsoFrame, point: Vec3): number {
  return dot(subtract(point, frame.origin), frame.up) / frame.scale;
}

/** Shoulder-to-shoulder distance in meters — the reference for "hands closer than shoulder width". */
export function shoulderWidth(pose: readonly WorldPoint[]): number | null {
  const leftShoulder = landmark(pose, POSE.LEFT_SHOULDER);
  const rightShoulder = landmark(pose, POSE.RIGHT_SHOULDER);
  if (!leftShoulder || !rightShoulder) return null;
  return length(subtract(rightShoulder, leftShoulder));
}

/* -------------------------------------------------------------------------- */
/* Limb angles                                                                */
/* -------------------------------------------------------------------------- */

export interface LimbAngles {
  /** Signed angle above the torso's horizontal plane: −90 down, +90 overhead. */
  elevation: number;
  /** Angle from hanging at the side: 0 down, 90 lateral, 180 overhead. */
  abduction: number;
  /**
   * Horizontal direction, measured from straight ahead toward the limb's own
   * side: 0 forward, +90 lateral, negative across the midline.
   *
   * Degenerate for a near-vertical limb, where the horizontal projection
   * vanishes — a spec that reaches for azimuth must bound elevation too.
   */
  azimuth: number;
}

/**
 * Direction of a segment, in torso-frame angles.
 *
 * `side` selects which way azimuth is positive, so the same numbers describe the
 * mirror-image gesture on either arm.
 */
export function directionAngles(frame: TorsoFrame, direction: Vec3, side: Side): LimbAngles | null {
  const unit = normalize(direction);
  if (!unit) return null;

  const lateralAxis = side === 'right' ? frame.right : negate(frame.right);
  const elevation = Math.asin(clamp(dot(unit, frame.up), -1, 1)) * RAD_TO_DEG;
  const azimuth = Math.atan2(dot(unit, lateralAxis), dot(unit, frame.forward)) * RAD_TO_DEG;

  return { elevation, abduction: elevation + 90, azimuth };
}

/** Which part of the arm to measure. Parry is a forearm gesture; Attack is not. */
export type ArmSegment = 'upper' | 'forearm';

function segmentEnds(
  pose: readonly WorldPoint[],
  side: Side,
  segment: ArmSegment
): [WorldPoint, WorldPoint] | null {
  const joints = POSE_BY_SIDE[side];
  const from = landmark(pose, segment === 'upper' ? joints.shoulder : joints.elbow);
  const to = landmark(pose, segment === 'upper' ? joints.elbow : joints.wrist);
  if (!from || !to) return null;
  return [from, to];
}

/** Torso-frame direction of one arm segment. */
export function limbAngles(
  pose: readonly WorldPoint[],
  frame: TorsoFrame,
  side: Side,
  segment: ArmSegment = 'upper'
): LimbAngles | null {
  const ends = segmentEnds(pose, side, segment);
  if (!ends) return null;
  return directionAngles(frame, subtract(ends[1], ends[0]), side);
}

export function limbElevation(
  pose: readonly WorldPoint[],
  frame: TorsoFrame,
  side: Side,
  segment: ArmSegment = 'upper'
): number | null {
  return limbAngles(pose, frame, side, segment)?.elevation ?? null;
}

export function limbAbduction(
  pose: readonly WorldPoint[],
  frame: TorsoFrame,
  side: Side,
  segment: ArmSegment = 'upper'
): number | null {
  return limbAngles(pose, frame, side, segment)?.abduction ?? null;
}

export function limbAzimuth(
  pose: readonly WorldPoint[],
  frame: TorsoFrame,
  side: Side,
  segment: ArmSegment = 'upper'
): number | null {
  return limbAngles(pose, frame, side, segment)?.azimuth ?? null;
}

/** Interior angle at the elbow: 180° fully extended, 90° square, 0° folded shut. */
export function elbowAngle(pose: readonly WorldPoint[], side: Side): number | null {
  const joints = POSE_BY_SIDE[side];
  const shoulder = landmark(pose, joints.shoulder);
  const elbow = landmark(pose, joints.elbow);
  const wrist = landmark(pose, joints.wrist);
  if (!shoulder || !elbow || !wrist) return null;
  return angleAt(shoulder, elbow, wrist);
}
