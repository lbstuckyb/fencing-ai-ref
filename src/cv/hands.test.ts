import { describe, expect, it } from 'vitest';
import {
  fingerExtension,
  handForSide,
  handMetrics,
  handShape,
  resolveHandSides,
  sideFromHandedness,
  HAND_SHAPE_THRESHOLDS,
} from './hands';
import type { RawHand } from './hands';
import { POSE, POSE_LANDMARK_COUNT } from './types';
import type { PoseFrame, ScreenPoint } from './types';
import { FIST, INDEX_POINT, OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe('handShape', () => {
  it('names the three shapes the signal specs need', () => {
    expect(handShape(makeHand(OPEN_PALM))).toBe('open_palm');
    expect(handShape(makeHand(FIST))).toBe('fist');
    expect(handShape(makeHand(INDEX_POINT))).toBe('index_point');
  });

  /**
   * The whole point of a distance *ratio*. A referee's palm faces a different
   * way in every signal — up for Halt, outward for Point in line, down for
   * Nothing — and the classifier has to be blind to all of it.
   */
  it('is unchanged by the orientation of the hand', () => {
    for (const rotationDeg of [
      { x: 90 },
      { y: 45 },
      { z: 180 },
      { x: 70, y: 40, z: 120 },
      { x: -35, z: -100 },
    ]) {
      expect(handShape(makeHand({ ...OPEN_PALM, rotationDeg }))).toBe('open_palm');
      expect(handShape(makeHand({ ...INDEX_POINT, rotationDeg }))).toBe('index_point');
    }
  });

  it('is unchanged by hand size', () => {
    for (const scale of [0.6, 1, 1.6]) {
      expect(handShape(makeHand({ ...OPEN_PALM, scale }))).toBe('open_palm');
      expect(handShape(makeHand({ ...FIST, scale }))).toBe('fist');
    }
  });

  it('classifies a left hand the same as a right', () => {
    expect(handShape(makeHand({ ...INDEX_POINT, side: 'left' }))).toBe('index_point');
    expect(handShape(makeHand({ ...OPEN_PALM, side: 'left' }))).toBe('open_palm');
  });

  /**
   * The refusals. A shape that is not clearly one of the three must come back
   * `unknown`: a false `open_palm` passes a Halt that was never made, and the
   * user gets credit for a signal a real referee would not have accepted.
   */
  it('refuses a hand that is half-curled', () => {
    expect(handShape(makeHand({ curl: 'half' }))).toBe('unknown');
  });

  it('does not read two extended fingers as a point', () => {
    const twoFingers = makeHand({
      curl: 'curled',
      fingers: { index: 'extended', middle: 'extended' },
    });
    expect(handShape(twoFingers)).toBe('unknown');
  });

  it('does not read a curled index with the rest out as a point', () => {
    const shape = handShape(makeHand({ curl: 'extended', fingers: { index: 'curled' } }));
    expect(shape).toBe('unknown');
  });

  it('returns unknown rather than throwing on a missing or short hand', () => {
    expect(handShape([])).toBe('unknown');
    expect(handShape(makeHand().slice(0, 10))).toBe('unknown');
  });

  /** No classification reads the thumb — see the module note on why. */
  it('ignores the thumb', () => {
    expect(handShape(makeHand({ curl: 'extended', thumb: 'tucked' }))).toBe('open_palm');
    expect(handShape(makeHand({ curl: 'curled', thumb: 'extended' }))).toBe('fist');
  });
});

describe('fingerExtension', () => {
  it('separates extended from curled by a wide margin', () => {
    const open = makeHand(OPEN_PALM);
    const fist = makeHand(FIST);

    for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
      const extended = fingerExtension(open, finger);
      const curled = fingerExtension(fist, finger);
      expect(extended).toBeGreaterThan(HAND_SHAPE_THRESHOLDS.extended);
      expect(curled).toBeLessThan(HAND_SHAPE_THRESHOLDS.curled);
      // A margin this wide is what lets the dead band between the thresholds
      // exist at all. If tuning ever narrows it, the specs get flickery.
      expect(extended! - curled!).toBeGreaterThan(0.4);
    }
  });

  it('puts a half-curled finger in the dead band, called neither way', () => {
    const ratio = fingerExtension(makeHand({ curl: 'half' }), 'index');
    expect(ratio).toBeGreaterThan(HAND_SHAPE_THRESHOLDS.curled);
    expect(ratio).toBeLessThan(HAND_SHAPE_THRESHOLDS.extended);
    expect(handMetrics(makeHand({ curl: 'half' })).states.index).toBe('ambiguous');
  });

  it('is null for landmarks it cannot measure', () => {
    expect(fingerExtension([], 'index')).toBeNull();
  });
});

describe('handMetrics', () => {
  it('reports per-finger detail for the calibration readouts', () => {
    const metrics = handMetrics(makeHand(INDEX_POINT));
    expect(metrics.states).toEqual({
      index: 'extended',
      middle: 'curled',
      ring: 'curled',
      pinky: 'curled',
    });
    expect(metrics.ratios.index).toBeGreaterThan(metrics.ratios.middle!);
  });

  it('measures the thumb even though nothing classifies on it', () => {
    expect(handMetrics(makeHand({ thumb: 'extended' })).thumb.extended).toBe(true);
    expect(handMetrics(makeHand({ thumb: 'tucked' })).thumb.extended).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Sides                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A pose frame carrying only the two wrists, in image space.
 *
 * The subject faces an *unmirrored* camera, so their anatomical left wrist is on
 * the right of the frame. Every side test below depends on that being stated
 * once, correctly, here.
 */
function poseWithWrists(leftX: number, rightX: number, y = 0.5): PoseFrame {
  const points: ScreenPoint[] = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  points[POSE.LEFT_WRIST] = { x: leftX, y, z: 0, visibility: 1 };
  points[POSE.RIGHT_WRIST] = { x: rightX, y, z: 0, visibility: 1 };
  return { screen: points, world: points, timestampMs: 0 };
}

function rawHand(x: number, y: number, handedness = '', score = 0.9): RawHand {
  return { screen: makeHandScreen(x, y), world: makeHand(), handedness, score };
}

describe('sideFromHandedness', () => {
  /**
   * MediaPipe labels handedness as if the image were mirrored; ours is not, so
   * the label is inverted and this inverts it back. Getting this backwards is
   * the mirroring trap arriving from the hand model's direction.
   */
  it('inverts the label, because our input is not mirrored', () => {
    expect(sideFromHandedness('Left')).toBe('right');
    expect(sideFromHandedness('Right')).toBe('left');
    expect(sideFromHandedness('right')).toBe('left');
  });

  it('is null for a label it does not recognise', () => {
    expect(sideFromHandedness('')).toBeNull();
    expect(sideFromHandedness('Unknown')).toBeNull();
  });
});

describe('resolveHandSides', () => {
  it('takes sides from the pose wrists, which are already anatomical', () => {
    const pose = poseWithWrists(0.72, 0.28);
    const hands = resolveHandSides([rawHand(0.71, 0.5), rawHand(0.29, 0.5)], pose);

    expect(hands[0].side).toBe('left');
    expect(hands[1].side).toBe('right');
    expect(handForSide(hands, 'right')?.screen[0].x).toBeCloseTo(0.29);
  });

  /**
   * The reason the pose is preferred over the label at all: the pose landmarks
   * carry no assumption about mirroring, so when the two disagree the pose is
   * the one that has been right about sides everywhere else in the app.
   */
  it('prefers the pose over a handedness label that disagrees', () => {
    const pose = poseWithWrists(0.72, 0.28);
    const hands = resolveHandSides([rawHand(0.71, 0.5, 'Right')], pose);
    // The label alone would have said 'left' too — so flip it to be sure the
    // pose, not the coincidence, is doing the work.
    expect(hands[0].side).toBe('left');

    const contradicted = resolveHandSides([rawHand(0.29, 0.5, 'Right')], pose);
    expect(contradicted[0].side).toBe('right');
  });

  it('never gives both hands the same side', () => {
    // Two hands clasped together in the middle: both are nearest the same wrist.
    const pose = poseWithWrists(0.55, 0.45);
    const hands = resolveHandSides([rawHand(0.54, 0.5), rawHand(0.545, 0.5)], pose);

    expect(new Set(hands.map((hand) => hand.side)).size).toBe(2);
    expect(hands.map((hand) => hand.side).sort()).toEqual(['left', 'right']);
  });

  it('falls back to the inverted handedness label when there is no pose', () => {
    const hands = resolveHandSides([rawHand(0.7, 0.5, 'Left')], null);
    expect(hands[0].side).toBe('right');
  });

  it('leaves a hand unplaced rather than guessing', () => {
    const pose = poseWithWrists(0.72, 0.28);
    // Nowhere near either wrist, and no usable label — a bystander's hand.
    const hands = resolveHandSides([rawHand(0.05, 0.05)], pose);
    expect(hands[0].side).toBeNull();
    expect(handForSide(hands, 'left')).toBeNull();
  });

  it('keeps MediaPipe’s own label untouched for diagnostics', () => {
    const hands = resolveHandSides([rawHand(0.7, 0.5, 'Left', 0.97)], null);
    expect(hands[0].handedness).toBe('Left');
    expect(hands[0].score).toBe(0.97);
  });

  it('returns an empty list for a frame with no hands', () => {
    expect(resolveHandSides([], poseWithWrists(0.7, 0.3))).toEqual([]);
  });
});
