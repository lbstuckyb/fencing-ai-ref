/**
 * Synthetic hand fixtures — a jointed hand with controllable finger curl.
 *
 * Test-only, and the counterpart to `poseFixtures.ts`. The shape classifier is a
 * ratio of two lengths measured on the same hand, so what a fixture has to get
 * right is not absolute realism but *proportion*: knuckle-to-wrist against
 * tip-to-wrist, at a plausible curl.
 *
 * ## Frame
 *
 * The hand is authored wrist-at-origin with `+y` running out toward the
 * fingertips, `+x` toward the pinky side of a right hand, and `+z` out of the
 * back of the hand. Curling a finger rotates it toward `−z`, into the palm.
 *
 * That is not MediaPipe's world frame, and it does not need to be: every metric
 * in `hands.ts` is a distance ratio, so it is invariant under any rotation of
 * the whole hand. `rotationDeg` exists to prove exactly that — a referee's hand
 * points in a different direction in every one of the ten signals, and the
 * classifier must not care which.
 */

import { FINGER_JOINTS, HAND, HAND_LANDMARK_COUNT } from '../cv/types';
import type { Finger, ScreenPoint, WorldPoint } from '../cv/types';
import type { Vec3 } from '../cv/geometry';

const DEG_TO_RAD = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* Hand proportions                                                           */
/* -------------------------------------------------------------------------- */

/** Adult hand, in meters: knuckle position and the three phalanx lengths. */
const FINGER_GEOMETRY: Record<Finger, { mcp: Vec3; phalanges: [number, number, number] }> = {
  index: { mcp: { x: -0.02, y: 0.093, z: 0 }, phalanges: [0.045, 0.026, 0.021] },
  middle: { mcp: { x: 0.0, y: 0.098, z: 0 }, phalanges: [0.05, 0.03, 0.022] },
  ring: { mcp: { x: 0.021, y: 0.094, z: 0 }, phalanges: [0.046, 0.029, 0.022] },
  pinky: { mcp: { x: 0.041, y: 0.079, z: 0 }, phalanges: [0.035, 0.02, 0.019] },
};

/**
 * Flexion at MCP / PIP / DIP in degrees, each relative to the joint before it —
 * so a curled finger is 80° at the knuckle, another 100° on top of that, and 70°
 * more again, folding the tip back toward the palm the way a fist does.
 *
 * `half` is the deliberate awkward case: a finger neither out nor folded, which
 * the classifier must refuse to call rather than round to the nearer shape.
 */
export const CURLS = {
  extended: [0, 0, 0],
  half: [30, 45, 30],
  curled: [80, 100, 70],
} as const;

export type Curl = keyof typeof CURLS;

/** Thumb chain for a spread thumb and for one folded across the palm. */
const THUMB_POSES = {
  extended: [
    { x: -0.02, y: 0.015, z: 0.005 },
    { x: -0.042, y: 0.035, z: 0.008 },
    { x: -0.065, y: 0.065, z: 0.01 },
    { x: -0.078, y: 0.088, z: 0.012 },
  ],
  tucked: [
    { x: -0.02, y: 0.015, z: 0.005 },
    { x: -0.038, y: 0.032, z: 0.002 },
    { x: -0.022, y: 0.052, z: -0.012 },
    { x: 0.0, y: 0.06, z: -0.02 },
  ],
} as const satisfies Record<string, readonly Vec3[]>;

export type ThumbPose = keyof typeof THUMB_POSES;

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Tilts a direction toward the palm (−z), which is what flexing a joint does. */
function flex(direction: Vec3, degrees: number): Vec3 {
  const radians = degrees * DEG_TO_RAD;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  // Rotation in the plane spanned by the finger's own direction and −z.
  return {
    x: direction.x * c,
    y: direction.y * c,
    z: direction.z * c - s * Math.hypot(direction.x, direction.y),
  };
}

function rotate(p: Vec3, degrees: { x: number; y: number; z: number }): Vec3 {
  const rx = degrees.x * DEG_TO_RAD;
  const ry = degrees.y * DEG_TO_RAD;
  const rz = degrees.z * DEG_TO_RAD;

  let { x, y, z } = p;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return { x, y, z };
}

export interface HandOptions {
  /** Curl per finger. Anything unset takes `curl`. */
  fingers?: Partial<Record<Finger, Curl>>;
  /** Default curl for every finger not named in `fingers`. */
  curl?: Curl;
  thumb?: ThumbPose;
  /** Anatomical side. A left hand is the right hand mirrored across x. */
  side?: 'left' | 'right';
  /** Whole-hand rotation, applied last. The classifier must be blind to it. */
  rotationDeg?: Partial<{ x: number; y: number; z: number }>;
  /** Whole-hand size multiplier — a larger or smaller hand. */
  scale?: number;
}

/** Builds a full 21-landmark hand in the metric, wrist-origin convention. */
export function makeHand(options: HandOptions = {}): WorldPoint[] {
  const {
    fingers = {},
    curl = 'extended',
    thumb = 'extended',
    side = 'right',
    rotationDeg = {},
    scale: sizeScale = 1,
  } = options;

  const points = new Array<Vec3>(HAND_LANDMARK_COUNT);
  points[HAND.WRIST] = { x: 0, y: 0, z: 0 };

  for (const [finger, geometry] of Object.entries(FINGER_GEOMETRY) as [
    Finger,
    (typeof FINGER_GEOMETRY)[Finger],
  ][]) {
    const joints = FINGER_JOINTS[finger];
    const flexion = CURLS[fingers[finger] ?? curl];

    // The finger leaves the knuckle along the line the knuckle makes with the
    // wrist, so a straight finger is the natural continuation of the palm.
    const base = normalize(geometry.mcp);
    let position = geometry.mcp;
    let bend = 0;
    points[joints.mcp] = position;

    const chain = [joints.pip, joints.dip, joints.tip];
    chain.forEach((index, link) => {
      bend += flexion[link];
      position = add(position, scale(flex(base, bend), geometry.phalanges[link]));
      points[index] = position;
    });
  }

  const thumbChain = THUMB_POSES[thumb];
  [HAND.THUMB_CMC, HAND.THUMB_MCP, HAND.THUMB_IP, HAND.THUMB_TIP].forEach((index, link) => {
    points[index] = thumbChain[link];
  });

  return points.map((p) => {
    const mirrored = side === 'left' ? { x: -p.x, y: p.y, z: p.z } : p;
    const turned = rotate(scale(mirrored, sizeScale), {
      x: rotationDeg.x ?? 0,
      y: rotationDeg.y ?? 0,
      z: rotationDeg.z ?? 0,
    });
    return { ...turned, visibility: 1 };
  });
}

/** An open palm — Halt's hand. */
export const OPEN_PALM: HandOptions = { curl: 'extended', thumb: 'extended' };
/** A closed fist. */
export const FIST: HandOptions = { curl: 'curled', thumb: 'tucked' };
/** Index out, the rest folded — Point in line's hand. */
export const INDEX_POINT: HandOptions = {
  curl: 'curled',
  fingers: { index: 'extended' },
  thumb: 'tucked',
};

/* -------------------------------------------------------------------------- */
/* Image-space hands                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A hand's *normalized* landmarks, positioned at a point in the frame.
 *
 * Only the wrist matters to `resolveHandSides`, but a half-populated array would
 * be a trap for the next reader, so the whole hand is placed just above it.
 */
export function makeHandScreen(x: number, y: number): ScreenPoint[] {
  return Array.from({ length: HAND_LANDMARK_COUNT }, (_, index) => ({
    x,
    y: index === HAND.WRIST ? y : y - 0.02,
    z: 0,
    visibility: 1,
  }));
}
