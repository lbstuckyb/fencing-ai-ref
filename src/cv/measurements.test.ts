import { describe, expect, it } from 'vitest';
import {
  MEASUREMENT_GROUPS,
  MEASUREMENT_IDS,
  emptyMeasurements,
  formatMeasurement,
  formatShape,
  idsOf,
  measure,
  sidedId,
} from './measurements';
import type { HandFrame } from './types';
import {
  ARM_DOWN,
  ARM_FORWARD,
  ARM_LATERAL,
  ARM_OVERHEAD,
  FIXTURE_TORSO_METERS,
  makePose,
} from '../test/poseFixtures';
import { INDEX_POINT, OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';

/** Fixture angles are exact; live values are not, so the page rounds. */
const CLOSE = 4;

/** A measured value, failing by name rather than by `null` if it is missing. */
function valueOf(values: Record<string, number | null>, id: string): number {
  const value = values[id];
  if (value === null || value === undefined) throw new Error(`${id} was not measured`);
  return value;
}

/** A hand frame with both hands placed and given a shape. */
function handFrame(right = OPEN_PALM, left = OPEN_PALM): HandFrame {
  return {
    hands: [
      {
        screen: makeHandScreen(0.4, 0.5),
        world: makeHand(right),
        side: 'right',
        handedness: 'Left',
        score: 0.95,
      },
      {
        screen: makeHandScreen(0.6, 0.5),
        world: makeHand(left),
        side: 'left',
        handedness: 'Right',
        score: 0.95,
      },
    ],
    timestampMs: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Declarations                                                               */
/* -------------------------------------------------------------------------- */

describe('measurement declarations', () => {
  it('measures exactly the ids the page declares', () => {
    // The page renders rows from the declarations and the recorder summarises
    // whatever `measure` produces. If the two sets ever drift, a row renders a
    // permanent em dash and nobody finds out why — so they are checked, not
    // assumed.
    const measured = Object.keys(measure(makePose(), null).values).sort();
    expect(measured).toEqual([...MEASUREMENT_IDS].sort());
  });

  it('gives every id a unique key', () => {
    expect(new Set(MEASUREMENT_IDS).size).toBe(MEASUREMENT_IDS.length);
  });

  it('expands a sided row into one id per anatomical side', () => {
    const row = MEASUREMENT_GROUPS[0].rows[0];
    expect(idsOf(row)).toEqual(['elbow.L', 'elbow.R']);
    expect(sidedId('elbow', 'right')).toBe('elbow.R');
  });
});

/* -------------------------------------------------------------------------- */
/* Pose measurements                                                          */
/* -------------------------------------------------------------------------- */

describe('measure', () => {
  it('reports nothing measurable when there is no pose', () => {
    const { values, tracked } = measure(null, null);
    expect(tracked).toBe(false);
    expect(Object.values(values).every((value) => value === null)).toBe(true);
  });

  it('reports nothing measurable when the trunk landmarks are missing', () => {
    // A partially detected body must not yield a torso frame, and without one
    // there is no meaningful angle to report — a plausible-looking number here
    // is worse than an em dash, because it would be written into a spec.
    const pose = makePose().map(() => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    expect(measure(pose, null).tracked).toBe(false);
  });

  it('reads an arm hanging at the side', () => {
    const { values, tracked } = measure(makePose({ arms: { right: ARM_DOWN } }), null);

    expect(tracked).toBe(true);
    expect(values['elbow.R']).toBeCloseTo(180, CLOSE);
    expect(values['upper.elevation.R']).toBeCloseTo(-90, CLOSE);
    expect(values['upper.abduction.R']).toBeCloseTo(0, CLOSE);
    // Wrist below the hips: the band Nothing lives in.
    expect(values['wrist.height.R']).toBeLessThan(0);
    expect(values['wrist.vsShoulder.R']).toBeLessThan(-1);
  });

  it('reads a lateral arm at shoulder height', () => {
    const { values } = measure(makePose({ arms: { right: ARM_LATERAL } }), null);

    expect(values['upper.abduction.R']).toBeCloseTo(90, CLOSE);
    expect(values['upper.azimuth.R']).toBeCloseTo(90, CLOSE);
    expect(values['forearm.azimuth.R']).toBeCloseTo(90, CLOSE);
    // Shoulders sit at height 1 by definition of the torso frame.
    expect(values['wrist.height.R']).toBeCloseTo(1, CLOSE);
    expect(values['wrist.vsShoulder.R']).toBeCloseTo(0, CLOSE);
    expect(values['wrist.lateral.R']).toBeGreaterThan(1);
    expect(values['wrist.forward.R']).toBeCloseTo(0, CLOSE);
  });

  it('puts an overhead wrist above the nose', () => {
    const raised = measure(makePose({ arms: { right: ARM_OVERHEAD } }), null).values;
    const lowered = measure(makePose({ arms: { right: ARM_LATERAL } }), null).values;

    // The Halt discriminator, and the sign convention it depends on.
    expect(raised['wrist.vsNose.R']).toBeGreaterThan(0);
    expect(lowered['wrist.vsNose.R']).toBeLessThan(0);
  });

  it('measures lateral offset toward each arm’s own side', () => {
    // Mirror-image gestures must read as the same numbers, or a spec authored
    // for the right arm could not be mirrored onto the left without rewriting
    // every threshold.
    const { values } = measure(makePose({ arms: { right: ARM_LATERAL, left: ARM_LATERAL } }), null);
    expect(valueOf(values, 'wrist.lateral.L')).toBeCloseTo(
      valueOf(values, 'wrist.lateral.R'),
      CLOSE
    );
    expect(values['wrists.heightDelta']).toBeCloseTo(0, CLOSE);
  });

  it('separates converged hands from spread ones', () => {
    const spread = measure(makePose({ arms: { right: ARM_LATERAL, left: ARM_LATERAL } }), null);
    const forward = measure(makePose({ arms: { right: ARM_FORWARD, left: ARM_FORWARD } }), null);

    // Simultaneous wants the hands closer than shoulder width; Double hit wants
    // them wide. This ratio is the secondary discriminator between the two.
    expect(spread.values['wrists.gap']).toBeGreaterThan(2);
    expect(forward.values['wrists.gap']).toBeLessThan(1.1);
  });

  it('reports the body’s own scale', () => {
    const { values } = measure(makePose(), null);
    expect(values['body.torso']).toBeCloseTo(FIXTURE_TORSO_METERS, CLOSE);
    expect(values['body.shoulderWidth']).toBeCloseTo(0.38, CLOSE);
    expect(values['body.turn']).toBeCloseTo(0, CLOSE);
    expect(values['body.lean']).toBeCloseTo(0, CLOSE);
  });

  it('holds every arm measurement still when the referee turns off-axis', () => {
    // The whole point of the torso frame, restated where the page can be checked
    // against it: turn on the spot and only "off square" should move. If this
    // fails, thresholds read off this page are only valid at the angle they were
    // read at, and the classifier is worthless in a real hall.
    // Both arms are posed away from vertical on purpose: azimuth is degenerate
    // for a limb pointing straight up or down — the horizontal component it is
    // measured from vanishes — so a hanging arm would compare noise against
    // noise and prove nothing. Specs that read azimuth have to bound elevation
    // for the same reason.
    const arms = {
      right: ARM_LATERAL,
      left: { upper: { elevation: -20, azimuth: 40 }, forearm: { elevation: 15, azimuth: 70 } },
    };
    const square = measure(makePose({ arms }), null).values;
    const turned = measure(makePose({ arms, yawDeg: 30, pitchDeg: 10, scale: 1.2 }), null).values;

    for (const id of MEASUREMENT_IDS) {
      if (id.startsWith('body.') || id.startsWith('hand.')) continue;
      expect(valueOf(turned, id)).toBeCloseTo(valueOf(square, id), CLOSE);
    }
    expect(turned['body.turn']).toBeGreaterThan(20);
    expect(turned['body.lean']).toBeGreaterThan(5);
    // Scale is the one body measurement that should move with a taller referee —
    // and the reason heights are divided by it.
    expect(turned['body.torso']).toBeCloseTo(FIXTURE_TORSO_METERS * 1.2, CLOSE);
  });
});

/* -------------------------------------------------------------------------- */
/* Hands                                                                      */
/* -------------------------------------------------------------------------- */

describe('measure — hands', () => {
  it('leaves hand values null when the hand model is not running', () => {
    const { values, shapes } = measure(makePose(), null);
    expect(shapes.right).toBeNull();
    expect(values['hand.index.R']).toBeNull();
  });

  it('reports a shape and per-finger ratios per anatomical side', () => {
    const { values, shapes } = measure(makePose(), handFrame(OPEN_PALM, INDEX_POINT));

    expect(shapes.right).toBe('open_palm');
    expect(shapes.left).toBe('index_point');
    // The classifier's own thresholds, visible as the numbers behind the verdict.
    expect(values['hand.index.R']).toBeGreaterThan(1.15);
    expect(values['hand.pinky.L']).toBeLessThan(0.95);
    expect(values['hand.thumb.R']).not.toBeNull();
  });

  it('reports only the hand that was detected', () => {
    const frame = handFrame();
    frame.hands = [frame.hands[0]];
    const { shapes, values } = measure(makePose(), frame);

    expect(shapes.right).toBe('open_palm');
    expect(shapes.left).toBeNull();
    expect(values['hand.index.L']).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

describe('formatting', () => {
  it('rounds angles to whole degrees and keeps two places elsewhere', () => {
    expect(formatMeasurement(89.6, 'deg')).toBe('90°');
    expect(formatMeasurement(1.234, 'ratio')).toBe('1.23');
    expect(formatMeasurement(0.518, 'm')).toBe('0.52 m');
  });

  it('never shows a negative zero', () => {
    // A readout that flickers between "0.00" and "-0.00" while the referee holds
    // still looks like a fault in the tracking.
    expect(formatMeasurement(-0.004, 'torso')).toBe('0.00');
    expect(formatMeasurement(-0.4, 'deg')).toBe('0°');
  });

  it('shows an em dash for anything unmeasured', () => {
    expect(formatMeasurement(null, 'deg')).toBe('—');
    expect(formatMeasurement(Number.NaN, 'deg')).toBe('—');
    expect(formatShape(null)).toBe('not detected');
    expect(formatShape('open_palm')).toBe('open palm');
  });

  it('starts blank with every id present', () => {
    const blank = emptyMeasurements();
    expect(Object.keys(blank.values)).toHaveLength(MEASUREMENT_IDS.length);
    expect(blank.tracked).toBe(false);
  });
});
