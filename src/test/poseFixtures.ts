/**
 * Synthetic pose fixtures — a jointed mannequin with known angles.
 *
 * Test-only, but it will be leaned on heavily from here to stage 12: the
 * evaluator, the hold machine and every signal spec need poses whose true angles
 * are known exactly, and a webcam cannot supply those.
 *
 * ## Two coordinate systems, on purpose
 *
 * Bodies are authored in **anatomical** coordinates — `X` toward the subject's
 * right, `Y` up, `Z` out of the chest — because that is the only way a fixture
 * reads as an actual gesture. They are emitted in MediaPipe's **world**
 * convention, where `+x` is image-right, `+y` is down and `+z` is away from the
 * camera. For a subject facing the camera the two differ by a negation on all
 * three axes, which is what `toWorld` does.
 *
 * Building fixtures this way is what makes the off-axis tests meaningful: a
 * gesture is specified once, relative to the body, and the whole mannequin is
 * then rotated. If the torso frame works, the measured angles do not move.
 */

import { POSE, POSE_LANDMARK_COUNT } from '../cv/types';
import type { WorldPoint } from '../cv/types';
import type { Side } from '../cv/types';
import type { Vec3 } from '../cv/geometry';

const DEG_TO_RAD = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* Body proportions                                                           */
/* -------------------------------------------------------------------------- */

/** Roughly an adult of average height, in meters. */
const BODY = {
  hipHalfWidth: 0.13,
  shoulderHalfWidth: 0.19,
  /** Hip midpoint to shoulder midpoint — the torso frame's scale reference. */
  torso: 0.52,
  upperArm: 0.3,
  forearm: 0.27,
} as const;

/* -------------------------------------------------------------------------- */
/* Limb specification                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A limb direction in torso-frame terms — the same vocabulary `geometry.ts`
 * reports, so a fixture asks for 90° of abduction and the test asserts 90° back.
 */
export interface Direction {
  /** −90 straight down, 0 level, +90 overhead. */
  elevation: number;
  /** 0 forward, +90 out to the limb's own side, negative across the midline. */
  azimuth: number;
}

export interface ArmSpec {
  /** Shoulder → elbow. */
  upper: Direction;
  /** Elbow → wrist. Defaults to `upper`, giving a fully extended arm. */
  forearm?: Direction;
}

/** Arm hanging at the side. Azimuth is meaningless here and is not read. */
export const ARM_DOWN: ArmSpec = { upper: { elevation: -90, azimuth: 0 } };
/** Straight out to the side at shoulder height — the Double hit / Hit against arm. */
export const ARM_LATERAL: ArmSpec = { upper: { elevation: 0, azimuth: 90 } };
/** Straight up — the Halt arm. */
export const ARM_OVERHEAD: ArmSpec = { upper: { elevation: 90, azimuth: 0 } };
/** Straight ahead at shoulder height. */
export const ARM_FORWARD: ArmSpec = { upper: { elevation: 0, azimuth: 0 } };

/** Unit vector for a direction, in anatomical coordinates. */
function directionVector(direction: Direction, side: Side): Vec3 {
  const elevation = direction.elevation * DEG_TO_RAD;
  const azimuth = direction.azimuth * DEG_TO_RAD;
  const horizontal = Math.cos(elevation);
  const lateral = horizontal * Math.sin(azimuth);
  return {
    // Azimuth is measured toward the limb's own side, so the left arm's lateral
    // component points the other way along X.
    x: side === 'right' ? lateral : -lateral,
    y: Math.sin(elevation),
    z: horizontal * Math.cos(azimuth),
  };
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

function point(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function along(from: Vec3, direction: Vec3, distance: number): Vec3 {
  return {
    x: from.x + direction.x * distance,
    y: from.y + direction.y * distance,
    z: from.z + direction.z * distance,
  };
}

export interface PoseOptions {
  arms?: { left?: ArmSpec; right?: ArmSpec };
  /** Subject turned about their own vertical axis, degrees; positive turns their forward toward their right. */
  yawDeg?: number;
  /** Subject leaning forward about their own lateral axis, degrees. */
  pitchDeg?: number;
  /** Whole-body size multiplier — a taller or shorter referee. */
  scale?: number;
  /** Rigid translation applied in world coordinates, after everything else. */
  offset?: Vec3;
  /** Visibility written onto every landmark. */
  visibility?: number;
}

/** Turns the subject about their vertical axis; forward swings toward +X. */
function yaw(p: Vec3, radians: number): Vec3 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

/** Leans the subject forward about their lateral axis; the head tips toward +Z. */
function pitch(p: Vec3, radians: number): Vec3 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

/** Anatomical → MediaPipe world: right/up/forward become −x/−y/−z. */
function toWorld(p: Vec3): Vec3 {
  return { x: -p.x, y: -p.y, z: -p.z };
}

function armPoints(spec: ArmSpec, shoulder: Vec3, side: Side) {
  const upperDirection = directionVector(spec.upper, side);
  const forearmDirection = directionVector(spec.forearm ?? spec.upper, side);
  const elbow = along(shoulder, upperDirection, BODY.upperArm);
  const wrist = along(elbow, forearmDirection, BODY.forearm);
  return { elbow, wrist, forearmDirection };
}

/**
 * Builds a full 33-landmark pose. Everything not explicitly posed — legs, face —
 * is placed in a plausible neutral stance so that no consumer ever meets a hole
 * in the array.
 */
export function makePose(options: PoseOptions = {}): WorldPoint[] {
  const {
    arms = {},
    yawDeg = 0,
    pitchDeg = 0,
    scale = 1,
    offset = { x: 0, y: 0, z: 0 },
    visibility = 1,
  } = options;

  const anatomical = new Array<Vec3>(POSE_LANDMARK_COUNT);
  const set = (index: number, p: Vec3) => {
    anatomical[index] = p;
  };

  // Trunk. The hip midpoint is the origin, matching MediaPipe's own.
  const leftHip = point(-BODY.hipHalfWidth, 0, 0);
  const rightHip = point(BODY.hipHalfWidth, 0, 0);
  const leftShoulder = point(-BODY.shoulderHalfWidth, BODY.torso, 0);
  const rightShoulder = point(BODY.shoulderHalfWidth, BODY.torso, 0);
  set(POSE.LEFT_HIP, leftHip);
  set(POSE.RIGHT_HIP, rightHip);
  set(POSE.LEFT_SHOULDER, leftShoulder);
  set(POSE.RIGHT_SHOULDER, rightShoulder);

  // Head. The nose sits forward of the ears, which is the only anatomical fact
  // available to check the frame's forward axis against.
  set(POSE.NOSE, point(0, 0.75, 0.11));
  set(POSE.LEFT_EYE_INNER, point(-0.02, 0.78, 0.09));
  set(POSE.LEFT_EYE, point(-0.035, 0.78, 0.085));
  set(POSE.LEFT_EYE_OUTER, point(-0.05, 0.78, 0.08));
  set(POSE.RIGHT_EYE_INNER, point(0.02, 0.78, 0.09));
  set(POSE.RIGHT_EYE, point(0.035, 0.78, 0.085));
  set(POSE.RIGHT_EYE_OUTER, point(0.05, 0.78, 0.08));
  set(POSE.LEFT_EAR, point(-0.08, 0.77, -0.02));
  set(POSE.RIGHT_EAR, point(0.08, 0.77, -0.02));
  set(POSE.MOUTH_LEFT, point(-0.03, 0.71, 0.09));
  set(POSE.MOUTH_RIGHT, point(0.03, 0.71, 0.09));

  // Legs, in a neutral standing stance.
  set(POSE.LEFT_KNEE, point(-0.12, -0.45, 0.02));
  set(POSE.RIGHT_KNEE, point(0.12, -0.45, 0.02));
  set(POSE.LEFT_ANKLE, point(-0.11, -0.9, 0));
  set(POSE.RIGHT_ANKLE, point(0.11, -0.9, 0));
  set(POSE.LEFT_HEEL, point(-0.11, -0.93, -0.05));
  set(POSE.RIGHT_HEEL, point(0.11, -0.93, -0.05));
  set(POSE.LEFT_FOOT_INDEX, point(-0.11, -0.92, 0.12));
  set(POSE.RIGHT_FOOT_INDEX, point(0.11, -0.92, 0.12));

  // Arms.
  const sides: { side: Side; spec: ArmSpec; shoulder: Vec3 }[] = [
    { side: 'left', spec: arms.left ?? ARM_DOWN, shoulder: leftShoulder },
    { side: 'right', spec: arms.right ?? ARM_DOWN, shoulder: rightShoulder },
  ];
  for (const { side, spec, shoulder } of sides) {
    const { elbow, wrist, forearmDirection } = armPoints(spec, shoulder, side);
    const joints = side === 'left' ? LEFT_ARM_INDICES : RIGHT_ARM_INDICES;
    set(joints.elbow, elbow);
    set(joints.wrist, wrist);
    // The hand is carried along the forearm so the fingertip landmarks are not
    // nonsense; pose-level geometry does not read them, but nothing should have
    // to know that.
    set(joints.index, along(wrist, forearmDirection, 0.08));
    set(joints.pinky, along(wrist, forearmDirection, 0.07));
    set(joints.thumb, along(wrist, forearmDirection, 0.04));
  }

  const yawRadians = yawDeg * DEG_TO_RAD;
  const pitchRadians = pitchDeg * DEG_TO_RAD;

  return anatomical.map((p) => {
    // Lean first, then turn: both are about the body's own axes, so the order is
    // "the referee leans in, then rotates away from the camera".
    const posed = yaw(pitch(p, pitchRadians), yawRadians);
    const world = toWorld({ x: posed.x * scale, y: posed.y * scale, z: posed.z * scale });
    return {
      x: world.x + offset.x,
      y: world.y + offset.y,
      z: world.z + offset.z,
      visibility,
    };
  });
}

const LEFT_ARM_INDICES = {
  elbow: POSE.LEFT_ELBOW,
  wrist: POSE.LEFT_WRIST,
  index: POSE.LEFT_INDEX,
  pinky: POSE.LEFT_PINKY,
  thumb: POSE.LEFT_THUMB,
} as const;

const RIGHT_ARM_INDICES = {
  elbow: POSE.RIGHT_ELBOW,
  wrist: POSE.RIGHT_WRIST,
  index: POSE.RIGHT_INDEX,
  pinky: POSE.RIGHT_PINKY,
  thumb: POSE.RIGHT_THUMB,
} as const;

/** Torso length of a default fixture, in meters — handy for height assertions. */
export const FIXTURE_TORSO_METERS = BODY.torso;
