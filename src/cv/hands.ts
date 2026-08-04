/**
 * Hand shape classification and hand→side resolution.
 *
 * Three of the core ten signals turn on finger detail rather than arm geometry:
 * Halt wants an open palm, Point in line an extended index, Nothing flat palms
 * facing down. Pose landmarks cannot see any of that — BlazePose reports a wrist
 * and three coarse hand points, and none of them distinguish a fist from a
 * spread hand — so those signals need the hand landmarker, and only those.
 *
 * ## The extension test
 *
 * A finger is a chain out from the wrist: MCP, PIP, DIP, TIP. Straighten it and
 * the tip is the furthest point of the chain from the wrist; curl it and the tip
 * folds back toward the palm while the PIP stays put. So the ratio
 *
 *     |tip − wrist| / |pip − wrist|
 *
 * separates the two cleanly — roughly 1.3 extended against roughly 0.7 curled —
 * and, being a ratio of two lengths on the same hand, needs no normalization for
 * hand size or distance from the camera. It is also indifferent to which way the
 * hand is pointing, which matters because a referee's palm faces a different way
 * in every one of these signals.
 *
 * ## Why the thumb decides nothing
 *
 * The thumb has no PIP — its chain is CMC, MCP, IP, TIP — and it moves mostly
 * *across* the palm rather than along it, so the same ratio barely separates a
 * spread thumb from a tucked one. More to the point, no signal in this app turns
 * on it: an open palm reads as open with the thumb wherever it falls, and a
 * pointing hand is made with the thumb up or tucked depending on the referee.
 * Its extension is measured and reported for the calibration readouts, and no
 * classification reads it.
 *
 * **Every threshold here is a starting estimate, to be tuned against the
 * calibration page (stage 8) exactly like the joint angles.**
 */

import { length, subtract } from './geometry';
import { FINGER_JOINTS, FINGERS, HAND, HAND_LANDMARK_COUNT, POSE } from './types';
import type {
  DetectedHand,
  Finger,
  HandShape,
  PoseFrame,
  ScreenPoint,
  Side,
  WorldPoint,
} from './types';

/* -------------------------------------------------------------------------- */
/* Finger extension                                                           */
/* -------------------------------------------------------------------------- */

/** Whether a finger is out, folded, or somewhere in between. */
export type FingerState = 'extended' | 'curled' | 'ambiguous';

export const HAND_SHAPE_THRESHOLDS = {
  /** `|tip−wrist| / |pip−wrist|` at or above which a finger counts as extended. */
  extended: 1.15,
  /** …and at or below which it counts as curled. */
  curled: 0.95,
  /**
   * Thumb extension, measured against the MCP because the thumb has no PIP.
   * Reported only — see the module note.
   */
  thumbExtended: 1.9,
  /** Below this, in meters, the hand is too small or too degenerate to read. */
  minSpanMeters: 0.01,
} as const;

/**
 * Extension ratio for one finger, or `null` if its landmarks are unusable.
 *
 * Between the two thresholds sits a deliberate dead band. A half-curled finger
 * is genuinely not either shape, and admitting that produces an honest `unknown`
 * instead of a classification that flickers between open palm and fist while the
 * user wonders what they are doing wrong.
 */
export function fingerExtension(hand: readonly WorldPoint[], finger: Finger): number | null {
  const wrist = hand[HAND.WRIST];
  const joints = FINGER_JOINTS[finger];
  const pip = hand[joints.pip];
  const tip = hand[joints.tip];
  if (!wrist || !pip || !tip) return null;

  const reference = length(subtract(pip, wrist));
  if (!(reference >= HAND_SHAPE_THRESHOLDS.minSpanMeters)) return null;

  const ratio = length(subtract(tip, wrist)) / reference;
  return Number.isFinite(ratio) ? ratio : null;
}

/** Thumb extension, against the MCP. Diagnostics only — no shape reads it. */
export function thumbExtension(hand: readonly WorldPoint[]): number | null {
  const wrist = hand[HAND.WRIST];
  const mcp = hand[HAND.THUMB_MCP];
  const tip = hand[HAND.THUMB_TIP];
  if (!wrist || !mcp || !tip) return null;

  const reference = length(subtract(mcp, wrist));
  if (!(reference >= HAND_SHAPE_THRESHOLDS.minSpanMeters)) return null;

  const ratio = length(subtract(tip, wrist)) / reference;
  return Number.isFinite(ratio) ? ratio : null;
}

function stateOf(ratio: number | null): FingerState {
  if (ratio === null) return 'ambiguous';
  if (ratio >= HAND_SHAPE_THRESHOLDS.extended) return 'extended';
  if (ratio <= HAND_SHAPE_THRESHOLDS.curled) return 'curled';
  return 'ambiguous';
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/** Everything measured about one hand. The calibration page prints this whole. */
export interface HandMetrics {
  shape: HandShape;
  /** Extension ratio per finger; `null` where the landmarks were unusable. */
  ratios: Record<Finger, number | null>;
  states: Record<Finger, FingerState>;
  /** Reported, never classified on. */
  thumb: { ratio: number | null; extended: boolean };
}

/**
 * Measures a hand and names its shape.
 *
 * Classification is over the four fingers only, and every rule requires a
 * definite state for all four: a hand with one ambiguous finger is `unknown`.
 * That is stricter than picking the closest bucket, and deliberately so — a
 * false `open_palm` passes a Halt that was not made.
 */
export function handMetrics(hand: readonly WorldPoint[]): HandMetrics {
  const ratios = {} as Record<Finger, number | null>;
  const states = {} as Record<Finger, FingerState>;
  for (const finger of FINGERS) {
    const ratio = fingerExtension(hand, finger);
    ratios[finger] = ratio;
    states[finger] = stateOf(ratio);
  }

  const thumbRatio = thumbExtension(hand);
  const others: Finger[] = ['middle', 'ring', 'pinky'];
  const allAre = (state: FingerState, of: readonly Finger[] = FINGERS) =>
    of.every((finger) => states[finger] === state);

  let shape: HandShape = 'unknown';
  if (allAre('extended')) shape = 'open_palm';
  else if (allAre('curled')) shape = 'fist';
  else if (states.index === 'extended' && allAre('curled', others)) shape = 'index_point';

  return {
    shape,
    ratios,
    states,
    thumb: {
      ratio: thumbRatio,
      extended: thumbRatio !== null && thumbRatio >= HAND_SHAPE_THRESHOLDS.thumbExtended,
    },
  };
}

/** The shape alone — what a signal spec's `hand` constraint compares against. */
export function handShape(hand: readonly WorldPoint[]): HandShape {
  if (hand.length < HAND_LANDMARK_COUNT) return 'unknown';
  return handMetrics(hand).shape;
}

/* -------------------------------------------------------------------------- */
/* Which hand is which                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How far, in normalized image units, a hand's wrist may sit from a pose wrist
 * and still be considered the same joint. Generous — there are only ever two
 * candidates — but not so generous that a bystander's hand at the edge of frame
 * gets adopted.
 */
const MAX_WRIST_MATCH = 0.18;

/**
 * MediaPipe's handedness label, converted to an anatomical side.
 *
 * **The label is inverted for our input, and this function inverts it back.**
 * The hand landmarker documents its handedness as assuming a *mirrored* image —
 * the selfie view a user sees. What `getUserMedia` hands us is unmirrored: the
 * mirroring in this app is a CSS transform on the displayed video, applied after
 * the pixels have gone to MediaPipe. So the model's "Left" is the referee's
 * actual right hand.
 *
 * This is the same trap `Side` in `types.ts` warns about, arriving from a second
 * direction, and it is why this is only the fallback: `resolveHandSides` prefers
 * to match against the pose's own wrists, which carry no such convention.
 */
export function sideFromHandedness(label: string): Side | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'left') return 'right';
  if (normalized === 'right') return 'left';
  return null;
}

/** A hand as the landmarker reports it, before a side has been worked out. */
export type RawHand = Omit<DetectedHand, 'side'>;

function imageDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Attaches an anatomical side to each detected hand.
 *
 * Sides come from proximity to the pose's own wrists rather than from the
 * model's handedness label: the pose landmarks are already anatomical, already
 * in the same image space, and — unlike handedness — carry no assumption about
 * whether the input was mirrored. Two hands can never claim the same side, and a
 * hand that matches nothing keeps `side: null` rather than being guessed at.
 */
export function resolveHandSides(
  hands: readonly RawHand[],
  pose: PoseFrame | null
): DetectedHand[] {
  const resolved: DetectedHand[] = hands.map((hand) => ({ ...hand, side: null }));

  const wrists = pose
    ? { left: pose.screen[POSE.LEFT_WRIST], right: pose.screen[POSE.RIGHT_WRIST] }
    : null;

  if (wrists?.left && wrists.right) {
    const candidates: { index: number; side: Side; distance: number }[] = [];
    resolved.forEach((hand, index) => {
      const wrist = hand.screen[HAND.WRIST];
      if (!wrist) return;
      for (const side of ['left', 'right'] as const) {
        const distance = imageDistance(wrist, wrists[side]);
        if (distance <= MAX_WRIST_MATCH) candidates.push({ index, side, distance });
      }
    });

    // Nearest pair first, then whatever is left. With at most two hands and two
    // wrists this greedy pass is the optimal assignment, and it guarantees the
    // one property that matters: no side is claimed twice.
    candidates.sort((a, b) => a.distance - b.distance);
    const takenSides = new Set<Side>();
    for (const { index, side } of candidates) {
      if (resolved[index].side !== null || takenSides.has(side)) continue;
      resolved[index].side = side;
      takenSides.add(side);
    }
  }

  // Fallback for hands the pose could not place — tracking dropped out, or the
  // wrist is occluded. The label is inverted on the way in; see above.
  const takenSides = new Set(resolved.map((hand) => hand.side).filter((side) => side !== null));
  for (const hand of resolved) {
    if (hand.side !== null) continue;
    const side = sideFromHandedness(hand.handedness);
    if (side && !takenSides.has(side)) {
      hand.side = side;
      takenSides.add(side);
    }
  }

  return resolved;
}

/** The hand on a given side, if it was detected and placed. */
export function handForSide(hands: readonly DetectedHand[], side: Side): DetectedHand | null {
  return hands.find((hand) => hand.side === side) ?? null;
}
