/**
 * Shared vision types and landmark indices.
 *
 * Kept separate from `landmarker.ts` so the pure consumers — geometry (stage 6),
 * the evaluator (stage 9), their fixtures and tests — can import the shapes
 * without pulling in `@mediapipe/tasks-vision` and its WASM runtime.
 */

import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * A metric, hip-origin 3D point, in meters.
 *
 * **All angle math uses these.** World landmarks are already translation- and
 * scale-invariant, so no hand-rolled shoulder-width normalization is needed —
 * and a classifier built on the normalized set instead would silently depend on
 * where in frame the referee is standing.
 */
export type WorldPoint = Landmark;

/**
 * An image-space point, x/y normalized to [0, 1].
 *
 * **Drawing only** (the skeleton overlay, stage 5). Never feed these to the
 * geometry.
 */
export type ScreenPoint = NormalizedLandmark;

/** One frame of pose detection. */
export interface PoseFrame {
  /** Image-space landmarks — for the overlay. */
  screen: ScreenPoint[];
  /** Metric, hip-origin landmarks — for every angle and every constraint. */
  world: WorldPoint[];
  /** Frame timestamp in ms, as handed to MediaPipe. Monotonic within a session. */
  timestampMs: number;
}

/**
 * Which of the referee's arms — **anatomical**, from the subject's own
 * perspective, which is how MediaPipe labels landmarks.
 *
 * This is the mirroring trap. The webcam is displayed mirrored because users
 * expect it, but side must never be inferred from screen position: `RIGHT_WRIST`
 * is the referee's actual right hand no matter what CSS transform is applied.
 * "The fencer on the referee's right" therefore maps straight onto the
 * anatomical-right indices. Getting this backwards inverts every directional
 * signal, and does so silently.
 */
export type Side = 'left' | 'right';

export const SIDES: readonly Side[] = ['left', 'right'] as const;

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/**
 * BlazePose's 33 landmarks, by index.
 *
 * Full set rather than the subset used today: the calibration readouts (stage 8)
 * and later specs reach for different ones, and a half-populated map invites
 * magic numbers.
 */
export const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type PoseLandmarkIndex = (typeof POSE)[keyof typeof POSE];

export const POSE_LANDMARK_COUNT = 33;

/* -------------------------------------------------------------------------- */
/* Hands                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * MediaPipe's 21 hand landmarks, by index.
 *
 * Each finger is a four-link chain from the palm outward: MCP (knuckle), PIP,
 * DIP, TIP. The thumb has no PIP — its chain is CMC, MCP, IP, TIP — which is why
 * it never fits the same extension test as the other four.
 */
export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const HAND_LANDMARK_COUNT = 21;

/** The four fingers that decide hand shape. The thumb is deliberately not one. */
export type Finger = 'index' | 'middle' | 'ring' | 'pinky';

export const FINGERS: readonly Finger[] = ['index', 'middle', 'ring', 'pinky'] as const;

/**
 * The joint chain of each finger, knuckle outward. The extension test reads only
 * `pip` and `tip`; the full chain is here because a fixture or an overlay that
 * skipped a joint would leave a hole in a 21-landmark array.
 */
export const FINGER_JOINTS = {
  index: {
    mcp: HAND.INDEX_MCP,
    pip: HAND.INDEX_PIP,
    dip: HAND.INDEX_DIP,
    tip: HAND.INDEX_TIP,
  },
  middle: {
    mcp: HAND.MIDDLE_MCP,
    pip: HAND.MIDDLE_PIP,
    dip: HAND.MIDDLE_DIP,
    tip: HAND.MIDDLE_TIP,
  },
  ring: { mcp: HAND.RING_MCP, pip: HAND.RING_PIP, dip: HAND.RING_DIP, tip: HAND.RING_TIP },
  pinky: {
    mcp: HAND.PINKY_MCP,
    pip: HAND.PINKY_PIP,
    dip: HAND.PINKY_DIP,
    tip: HAND.PINKY_TIP,
  },
} as const satisfies Record<Finger, { mcp: number; pip: number; dip: number; tip: number }>;

/**
 * The hand shapes the signal specs can ask for.
 *
 * Only three of the core ten signals need finger detail at all — Halt's open
 * palm, Point in line's extended index, Nothing's flat palms — so the vocabulary
 * stays this small on purpose. `unknown` is a real answer, not an error: a hand
 * halfway between shapes should fail a constraint rather than be forced into the
 * nearest bucket.
 */
export type HandShape = 'open_palm' | 'fist' | 'index_point' | 'unknown';

/** One detected hand. */
export interface DetectedHand {
  /** Image-space landmarks — for drawing, and for matching to a pose wrist. */
  screen: ScreenPoint[];
  /** Metric, wrist-origin landmarks — for all shape math. */
  world: WorldPoint[];
  /**
   * Which of the referee's hands, **anatomical**, resolved against the pose
   * rather than taken from MediaPipe's label — see `handShape.ts`. `null` when
   * it could not be resolved, which is honest rather than a coin flip.
   */
  side: Side | null;
  /** MediaPipe's own handedness label, verbatim and unswapped. Diagnostics only. */
  handedness: string;
  /** Handedness confidence, 0–1. */
  score: number;
}

/** One frame of hand detection. Empty `hands` means none were in shot. */
export interface HandFrame {
  hands: DetectedHand[];
  timestampMs: number;
}

/** Per-side landmark indices, so callers can take a `Side` and stay symmetric. */
export const POSE_BY_SIDE = {
  left: {
    shoulder: POSE.LEFT_SHOULDER,
    elbow: POSE.LEFT_ELBOW,
    wrist: POSE.LEFT_WRIST,
    hip: POSE.LEFT_HIP,
    index: POSE.LEFT_INDEX,
    pinky: POSE.LEFT_PINKY,
    thumb: POSE.LEFT_THUMB,
    ear: POSE.LEFT_EAR,
  },
  right: {
    shoulder: POSE.RIGHT_SHOULDER,
    elbow: POSE.RIGHT_ELBOW,
    wrist: POSE.RIGHT_WRIST,
    hip: POSE.RIGHT_HIP,
    index: POSE.RIGHT_INDEX,
    pinky: POSE.RIGHT_PINKY,
    thumb: POSE.RIGHT_THUMB,
    ear: POSE.RIGHT_EAR,
  },
} as const satisfies Record<Side, Record<string, PoseLandmarkIndex>>;
