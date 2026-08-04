import { describe, expect, it } from 'vitest';
import { DOUBLE_HIT, NOTHING, SIGNAL_SPECS, SIMULTANEOUS, signalSpec } from './specs';
import { bestMatch, evaluate, evaluateAll, validateSpec } from './evaluator';
import { T63_HOLD_MS } from './holdMachine';
import { measure } from '../cv/measurements';
import type { Measurements } from '../cv/measurements';
import { CORE_SIGNALS, signalLabel } from '../data/rules';
import type { CoreSignalId } from '../data/rules';
import type { HandFrame } from '../cv/types';
import { ARM_DOWN, ARM_LATERAL, makePose } from '../test/poseFixtures';
import type { ArmSpec, PoseOptions } from '../test/poseFixtures';
import { FIST, OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';
import type { HandOptions } from '../test/handFixtures';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function handFrame(right: HandOptions, left: HandOptions): HandFrame {
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

/** Open palms on both hands — the shape Nothing asks for. */
const PALMS = handFrame(OPEN_PALM, OPEN_PALM);

/**
 * Both arms posed alike. `makePose` measures azimuth toward each limb's own
 * side, so one spec applied to both arms is a mirror-symmetric body — which is
 * what all three of these signals are.
 */
function bothArms(arm: ArmSpec, options: Omit<PoseOptions, 'arms'> = {}): PoseOptions {
  return { arms: { right: arm, left: arm }, ...options };
}

/**
 * A frame with open palms by default.
 *
 * Every trio fixture carries hands even though only Nothing reads them: if the
 * two-armed geometry were only separable because the other two specs lack hand
 * data, the discrimination below would be proving nothing about the gesture.
 */
function frame(options: PoseOptions, hands: HandFrame | null = PALMS): Measurements {
  return measure(makePose(options), hands);
}

/** Arms straight out to the sides at shoulder height. */
const DOUBLE_HIT_POSE = bothArms(ARM_LATERAL);

/** Arms forward, hands converging in front of the chest. */
const SIMULTANEOUS_ARM: ArmSpec = {
  upper: { elevation: -25, azimuth: -20 },
  forearm: { elevation: -30, azimuth: -45 },
};
const SIMULTANEOUS_POSE = bothArms(SIMULTANEOUS_ARM);

/** Arms low and forward, hands below the waist. */
const NOTHING_ARM: ArmSpec = {
  upper: { elevation: -60, azimuth: 10 },
  forearm: { elevation: -50, azimuth: 15 },
};
const NOTHING_POSE = bothArms(NOTHING_ARM);

const TRIO = [
  { spec: DOUBLE_HIT, pose: DOUBLE_HIT_POSE },
  { spec: SIMULTANEOUS, pose: SIMULTANEOUS_POSE },
  { spec: NOTHING, pose: NOTHING_POSE },
] as const;

/** Ids of every spec that passed on a frame. */
function passing(measurements: Measurements): string[] {
  return evaluateAll(SIGNAL_SPECS, measurements)
    .filter((result) => result.pass)
    .map((result) => result.signal);
}

/* -------------------------------------------------------------------------- */
/* Each signal, performed correctly                                           */
/* -------------------------------------------------------------------------- */

describe('the hard trio, performed correctly', () => {
  it.each(TRIO)('passes $spec.id with full marks', ({ spec, pose }) => {
    const result = evaluate(spec, frame(pose));

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it.each(TRIO)('recognises $spec.id off-axis and at another body size', ({ spec, pose }) => {
    // The whole promise of torso-frame measurement: a referee standing 30° off
    // square, taller than the fixture and not centred on the camera, makes the
    // same signal. If this fails the bands have been written in camera space by
    // accident and nothing downstream is reliable.
    const awkward = frame({ ...pose, yawDeg: 30, scale: 1.3, offset: { x: 0.4, y: -0.2, z: 0.6 } });

    expect(evaluate(spec, awkward).pass).toBe(true);
    expect(bestMatch(SIGNAL_SPECS, awkward)?.signal).toBe(spec.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Discrimination                                                             */
/* -------------------------------------------------------------------------- */

describe('discrimination', () => {
  // The reason this stage exists. These three are the only signals in the core
  // ten that share a shape — both arms, elbows near straight — so if any pair
  // ever overlaps, it is these.
  it.each(TRIO)('matches $spec.id and nothing else', ({ spec, pose }) => {
    const measurements = frame(pose);

    expect(passing(measurements)).toEqual([spec.id]);
    expect(bestMatch(SIGNAL_SPECS, measurements)?.signal).toBe(spec.id);
  });

  it('separates the three on wrist height alone', () => {
    // Height is the primary discriminator, so the three bands must not touch.
    // Read the heights the fixtures actually produce and check the ordering is
    // the one the specs were written around: shoulder, chest, below waist.
    const heightOf = (pose: PoseOptions) => frame(pose).values['wrist.height.R'] ?? NaN;

    expect(heightOf(DOUBLE_HIT_POSE)).toBeGreaterThan(heightOf(SIMULTANEOUS_POSE));
    expect(heightOf(SIMULTANEOUS_POSE)).toBeGreaterThan(heightOf(NOTHING_POSE));
    expect(heightOf(DOUBLE_HIT_POSE)).toBeCloseTo(1, 1);
    expect(heightOf(NOTHING_POSE)).toBeLessThan(0.3);
  });

  it('claims nothing for a pose between two signals', () => {
    // Arms still out to the sides but dropped to chest height: too low for a
    // Double hit, at Simultaneous height but nowhere near its shape. Guessing
    // one here would score a signal the referee did not make, so the gap between
    // the bands has to belong to no one.
    const between = frame(bothArms({ upper: { elevation: -30, azimuth: 90 } }));

    expect(passing(between)).toEqual([]);
    expect(bestMatch(SIGNAL_SPECS, between)).toBeNull();
  });

  it('does not walk through Simultaneous on the way down from Double hit', () => {
    // Same pose as above, checked against Simultaneous specifically: it is the
    // one whose height band the arms pass through, and what keeps it out is the
    // hands being neither forward nor together.
    const between = frame(bothArms({ upper: { elevation: -30, azimuth: 90 } }));
    const result = evaluate(SIMULTANEOUS, between);
    const failed = result.failures.map((failure) => failure.measure);

    expect(result.pass).toBe(false);
    expect(failed).toContain('wrists.gap');
    expect(failed).toContain('wrist.forward.R');
  });

  it('never calls Nothing on a referee standing at rest', () => {
    // Arms at the sides satisfy every other constraint Nothing has — straight,
    // below the waist, level with each other — so without the forward reach the
    // app would call Nothing continuously at rest. The single most likely
    // false positive in the set.
    const atRest = frame(bothArms(ARM_DOWN));
    const result = evaluate(NOTHING, atRest);

    expect(passing(atRest)).toEqual([]);
    expect(result.failures.map((failure) => failure.measure)).toEqual(
      expect.arrayContaining(['wrist.forward.R', 'wrist.forward.L'])
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Near misses                                                                */
/* -------------------------------------------------------------------------- */

describe('near misses fail on the constraint that was actually wrong', () => {
  it('catches a Double hit with one arm sagging', () => {
    const sagging = frame({
      arms: { right: ARM_LATERAL, left: { upper: { elevation: -20, azimuth: 90 } } },
    });
    const result = evaluate(DOUBLE_HIT, sagging);

    expect(result.pass).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('asymmetric');
    // Still recognisably an attempt at the signal, not a random pose.
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('catches a Double hit made with bent arms', () => {
    const bent = frame(
      bothArms({ upper: { elevation: 0, azimuth: 90 }, forearm: { elevation: 45, azimuth: 90 } })
    );
    const result = evaluate(DOUBLE_HIT, bent);

    expect(result.pass).toBe(false);
    expect(result.failures[0].measure).toMatch(/^elbow\./);
    expect(result.failures[0].message).toBe('Straighten both arms fully out to the sides');
  });

  it('catches a Simultaneous with the hands too far apart', () => {
    // Arms forward at the right height, but spread rather than converged — the
    // one thing the gesture is actually saying.
    const apart = frame(
      bothArms({
        upper: { elevation: -25, azimuth: 25 },
        forearm: { elevation: -30, azimuth: 25 },
      })
    );
    const result = evaluate(SIMULTANEOUS, apart);

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].measure).toBe('wrists.gap');
    expect(result.failures[0].message).toBe('Bring your hands together in front of you');
  });

  it('catches a Nothing made with closed hands', () => {
    const fists = frame(NOTHING_POSE, handFrame(FIST, FIST));
    const result = evaluate(NOTHING, fists);

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.every((failure) => failure.code === 'wrong_shape')).toBe(true);
  });

  it('tells a referee whose hands were not visible from one whose hands were wrong', () => {
    // Nothing is one of the three specs that needs the hand model. When it has
    // not produced a hand the failure is the camera's, not the referee's, and
    // the two must not read alike.
    const noHands = frame(NOTHING_POSE, null);
    const result = evaluate(NOTHING, noHands);

    expect(result.pass).toBe(false);
    expect(result.failures.every((failure) => failure.code === 'unmeasured')).toBe(true);
  });

  it('grades the two-armed geometry without any hand data at all', () => {
    // Double hit and Simultaneous do not set `needsHands`, so the hand model is
    // never run for them and they must be complete without it.
    expect(evaluate(DOUBLE_HIT, frame(DOUBLE_HIT_POSE, null)).pass).toBe(true);
    expect(evaluate(SIMULTANEOUS, frame(SIMULTANEOUS_POSE, null)).pass).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* The set itself                                                             */
/* -------------------------------------------------------------------------- */

describe('the spec set', () => {
  it.each(SIGNAL_SPECS)('$id is well formed', (spec) => {
    expect(validateSpec(spec)).toEqual([]);
  });

  it('uses the canonical ids and labels from the rules data', () => {
    // Scenario answer keys and the weapon table reference these ids. A spec
    // naming itself something else would simply never be gradable.
    const coreIds = CORE_SIGNALS.map((signal) => signal.id) as readonly string[];

    for (const spec of SIGNAL_SPECS) {
      expect(coreIds).toContain(spec.id);
      expect(spec.label).toBe(signalLabel(spec.id as CoreSignalId));
      expect(spec.rule).toBe('t.63');
      expect(spec.holdMs).toEqual(T63_HOLD_MS);
    }
  });

  it('declares the hand model only where fingers are read', () => {
    expect(DOUBLE_HIT.needsHands).toBe(false);
    expect(SIMULTANEOUS.needsHands).toBe(false);
    expect(NOTHING.needsHands).toBe(true);
  });

  it('marks all three as non-directional', () => {
    // Two-armed signals name an outcome, not a fencer, so there is no side to
    // grade — stage 16 must not ask which arm made them.
    for (const spec of SIGNAL_SPECS) expect(spec.directional).toBe(false);
  });

  it('looks a spec up by id, and admits when one is not authored yet', () => {
    expect(signalSpec('double_hit')).toBe(DOUBLE_HIT);
    // Stage 12 authors the other seven; until then the lookup must say so
    // rather than hand back a spec that would grade the wrong gesture.
    expect(signalSpec('halt')).toBeUndefined();
  });

  it('has no duplicate ids', () => {
    const ids = SIGNAL_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
