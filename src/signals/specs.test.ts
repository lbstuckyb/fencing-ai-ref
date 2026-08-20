import { describe, expect, it } from 'vitest';
import {
  ATTACK,
  DOUBLE_HIT,
  HALT,
  HIT_AGAINST,
  HIT_SCORED,
  NOTHING,
  NOT_VALID,
  PARRY,
  POINT_IN_LINE,
  SIGNAL_SPECS,
  SIMULTANEOUS,
  signalSpec,
} from './specs';
import { bestMatch, evaluate, evaluateAll, validateSpec } from './evaluator';
import type { SignalSpec } from './evaluator';
import { T63_HOLD_MS } from './holdMachine';
import { measure } from '../cv/measurements';
import type { Measurements } from '../cv/measurements';
import { CORE_SIGNALS, signalLabel } from '../data/rules';
import type { CoreSignalId } from '../data/rules';
import type { HandFrame } from '../cv/types';
import { ARM_DOWN, ARM_LATERAL, ARM_OVERHEAD, makePose } from '../test/poseFixtures';
import type { ArmSpec, PoseOptions } from '../test/poseFixtures';
import { FIST, INDEX_POINT, OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';
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

/** Open palms on both hands — the shape Halt, Hit against and Nothing ask for. */
const PALMS = handFrame(OPEN_PALM, OPEN_PALM);
/** Index extended on the signalling hand — Point in line's, and only its, shape. */
const POINTING = handFrame(INDEX_POINT, OPEN_PALM);

/**
 * Both arms posed alike. `makePose` measures azimuth toward each limb's own
 * side, so one spec applied to both arms is a mirror-symmetric body — which is
 * what the three two-armed signals are.
 */
function bothArms(arm: ArmSpec, options: Omit<PoseOptions, 'arms'> = {}): PoseOptions {
  return { arms: { right: arm, left: arm }, ...options };
}

/** The signalling arm posed, the other one hanging down, as t.63 shows them. */
function rightArm(arm: ArmSpec, options: Omit<PoseOptions, 'arms'> = {}): PoseOptions {
  return { arms: { right: arm, left: ARM_DOWN }, ...options };
}

/**
 * A frame with open palms by default.
 *
 * Every fixture carries hands even where only some specs read them: if a
 * gesture were only separable because the competing specs lacked hand data, the
 * discrimination below would be proving nothing.
 */
function frame(options: PoseOptions, hands: HandFrame | null = PALMS): Measurements {
  return measure(makePose(options), hands);
}

/* The one-armed seven. */

/** Straight overhead, palm open. */
const HALT_POSE = rightArm(ARM_OVERHEAD);
/** Out to the side, elbow bent, forearm pointing laterally. */
const ATTACK_ARM: ArmSpec = {
  upper: { elevation: -5, azimuth: 55 },
  forearm: { elevation: 5, azimuth: 95 },
};
const ATTACK_POSE = rightArm(ATTACK_ARM);
/** Elbow low, forearm up beside the head. */
const PARRY_ARM: ArmSpec = {
  upper: { elevation: -20, azimuth: 10 },
  forearm: { elevation: 85, azimuth: 5 },
};
const PARRY_POSE = rightArm(PARRY_ARM);
/** Straight out to the side, index finger extended. */
const POINT_IN_LINE_POSE = rightArm({ upper: { elevation: 0, azimuth: 80 } });
/** Raised out and up on the scorer's side, elbow near a right angle. */
const HIT_SCORED_ARM: ArmSpec = {
  upper: { elevation: 15, azimuth: 65 },
  forearm: { elevation: 85, azimuth: 40 },
};
const HIT_SCORED_POSE = rightArm(HIT_SCORED_ARM);
/** Straight out to the side, flat hand. */
const HIT_AGAINST_POSE = rightArm(ARM_LATERAL);
/** Straight, down and out towards the floor. */
const NOT_VALID_POSE = rightArm({ upper: { elevation: -50, azimuth: 55 } });

/* The two-armed three. */

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

interface Case {
  spec: SignalSpec;
  pose: PoseOptions;
  /** The hands seen while the gesture is made. */
  hands: HandFrame;
}

/** One correctly-performed fixture per signal, in `CORE_SIGNALS` order. */
const SIGNALS: readonly Case[] = [
  { spec: HALT, pose: HALT_POSE, hands: PALMS },
  { spec: ATTACK, pose: ATTACK_POSE, hands: PALMS },
  { spec: PARRY, pose: PARRY_POSE, hands: PALMS },
  { spec: POINT_IN_LINE, pose: POINT_IN_LINE_POSE, hands: POINTING },
  { spec: HIT_SCORED, pose: HIT_SCORED_POSE, hands: PALMS },
  { spec: HIT_AGAINST, pose: HIT_AGAINST_POSE, hands: PALMS },
  { spec: NOT_VALID, pose: NOT_VALID_POSE, hands: PALMS },
  { spec: DOUBLE_HIT, pose: DOUBLE_HIT_POSE, hands: PALMS },
  { spec: SIMULTANEOUS, pose: SIMULTANEOUS_POSE, hands: PALMS },
  { spec: NOTHING, pose: NOTHING_POSE, hands: PALMS },
];

/** Ids of every spec that passed on a frame. */
function passing(measurements: Measurements): string[] {
  return evaluateAll(SIGNAL_SPECS, measurements)
    .filter((result) => result.pass)
    .map((result) => result.signal);
}

/* -------------------------------------------------------------------------- */
/* Each signal, performed correctly                                           */
/* -------------------------------------------------------------------------- */

describe('every signal, performed correctly', () => {
  it.each(SIGNALS)('passes $spec.id with full marks', ({ spec, pose, hands }) => {
    const result = evaluate(spec, frame(pose, hands));

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it.each(SIGNALS)(
    'recognises $spec.id off-axis and at another body size',
    ({ spec, pose, hands }) => {
      // The whole promise of torso-frame measurement: a referee standing 30° off
      // square, taller than the fixture and not centred on the camera, makes the
      // same signal. If this fails the bands have been written in camera space by
      // accident and nothing downstream is reliable.
      const awkward = frame(
        { ...pose, yawDeg: 30, scale: 1.3, offset: { x: 0.4, y: -0.2, z: 0.6 } },
        hands
      );

      expect(evaluate(spec, awkward).pass).toBe(true);
      expect(bestMatch(SIGNAL_SPECS, awkward)?.signal).toBe(spec.id);
    }
  );
});

/* -------------------------------------------------------------------------- */
/* Discrimination                                                             */
/* -------------------------------------------------------------------------- */

describe('discrimination', () => {
  // The reason stage 11 came before stage 12, now run over the whole set: ten
  // specs graded against ten gestures, each of which must claim exactly one.
  it.each(SIGNALS)('matches $spec.id and nothing else', ({ spec, pose, hands }) => {
    const measurements = frame(pose, hands);

    expect(passing(measurements)).toEqual([spec.id]);
    expect(bestMatch(SIGNAL_SPECS, measurements)?.signal).toBe(spec.id);
  });

  it('separates the two-armed three on wrist height alone', () => {
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

  it('leaves a gap between Simultaneous and Nothing instead of overlapping', () => {
    // Regression for a brute-force-found bug: interpolating between the two
    // fixtures on wrist height alone used to land poses that passed *both*
    // signals at once (~0.28-0.30 torso, where Simultaneous's floor and
    // Nothing's ceiling touched). The seam must now belong to neither.
    for (const t of [0.42, 0.44, 0.46, 0.48]) {
      const arm: ArmSpec = {
        upper: {
          elevation:
            SIMULTANEOUS_ARM.upper.elevation +
            t * (NOTHING_ARM.upper.elevation - SIMULTANEOUS_ARM.upper.elevation),
          azimuth:
            SIMULTANEOUS_ARM.upper.azimuth +
            t * (NOTHING_ARM.upper.azimuth - SIMULTANEOUS_ARM.upper.azimuth),
        },
        forearm: {
          elevation:
            SIMULTANEOUS_ARM.forearm!.elevation +
            t * (NOTHING_ARM.forearm!.elevation - SIMULTANEOUS_ARM.forearm!.elevation),
          azimuth:
            SIMULTANEOUS_ARM.forearm!.azimuth +
            t * (NOTHING_ARM.forearm!.azimuth - SIMULTANEOUS_ARM.forearm!.azimuth),
        },
      };
      const seam = frame(bothArms(arm));

      expect(passing(seam)).toEqual([]);
    }
  });

  it('never calls a signal on a referee standing at rest', () => {
    // Arms at the sides satisfy every other constraint Nothing has — straight,
    // below the waist, level with each other — so without the forward reach the
    // app would call Nothing continuously at rest. The single most likely false
    // positive in the set, and the seven one-armed specs must be quiet here too.
    const atRest = frame(bothArms(ARM_DOWN));

    expect(passing(atRest)).toEqual([]);
    expect(evaluate(NOTHING, atRest).failures.map((failure) => failure.measure)).toEqual(
      expect.arrayContaining(['wrist.forward.R', 'wrist.forward.L'])
    );
  });

  it('keeps a one-armed signal out of a two-armed one', () => {
    // A Hit against and one half of a Double hit are the same arm in the same
    // place. The only thing between them is the other arm, so a Double hit must
    // never read as a Hit against — the mistake would award a hit to one fencer
    // that both of them scored.
    const doubleHit = frame(DOUBLE_HIT_POSE);
    const result = evaluate(HIT_AGAINST, doubleHit);

    expect(result.pass).toBe(false);
    expect(result.failures[0].measure).toBe('wrist.height.L');
    expect(result.failures[0].message).toBe('Keep your other arm down at your side');
  });

  it('separates Point in line from Hit against on the hand alone', () => {
    // These two are geometrically identical, so the same body with a different
    // hand has to give a different answer — in both directions.
    expect(passing(frame(POINT_IN_LINE_POSE, POINTING))).toEqual(['point_in_line']);
    expect(passing(frame(POINT_IN_LINE_POSE, PALMS))).toEqual(['hit_against']);
  });

  it('claims neither when the hand cannot be read at all', () => {
    // Without hands the two are indistinguishable, and guessing would name the
    // wrong fencer half the time. Failing both is the safe answer.
    const noHands = frame(POINT_IN_LINE_POSE, null);

    expect(passing(noHands)).toEqual([]);
    for (const spec of [POINT_IN_LINE, HIT_AGAINST]) {
      expect(evaluate(spec, noHands).failures.map((failure) => failure.code)).toContain(
        'unmeasured'
      );
    }
  });

  it('puts the Attack / Hit scored boundary at shoulder height', () => {
    // The two bent-arm signals on the same side of the body differ only in how
    // high the hand is, so the boundary is worth pinning down: at shoulder
    // height the gesture is an Attack, and raised well above it, a Hit scored.
    const low = frame(
      rightArm({ upper: { elevation: -30, azimuth: 70 }, forearm: { elevation: 45, azimuth: 45 } })
    );

    expect(bestMatch(SIGNAL_SPECS, low)?.signal).toBe('attack');
    expect(bestMatch(SIGNAL_SPECS, frame(HIT_SCORED_POSE))?.signal).toBe('hit_scored');
  });

  it('claims nothing for a Parry made too wide', () => {
    // Between Parry and Hit scored: the forearm is vertical as a parry wants,
    // but the hand has drifted out to the side without the shoulder following
    // it. Neither signal, and the referee should be told so.
    const wide = frame(
      rightArm({ upper: { elevation: -20, azimuth: 45 }, forearm: { elevation: 85, azimuth: 40 } })
    );

    expect(passing(wide)).toEqual([]);
    expect(evaluate(PARRY, wide).failures[0].measure).toBe('wrist.lateral.R');
  });
});

/* -------------------------------------------------------------------------- */
/* Direction                                                                  */
/* -------------------------------------------------------------------------- */

describe('direction', () => {
  /** The same gesture made with the other arm. */
  function mirrored(arm: ArmSpec, options: Omit<PoseOptions, 'arms'> = {}): PoseOptions {
    return { arms: { left: arm, right: ARM_DOWN }, ...options };
  }

  const DIRECTIONAL: readonly { spec: SignalSpec; arm: ArmSpec; hands: HandFrame }[] = [
    { spec: ATTACK, arm: ATTACK_ARM, hands: PALMS },
    { spec: PARRY, arm: PARRY_ARM, hands: PALMS },
    { spec: HIT_SCORED, arm: HIT_SCORED_ARM, hands: PALMS },
  ];

  it.each(DIRECTIONAL)('reports which arm made $spec.id', ({ spec, arm, hands }) => {
    // Specs are authored for the right arm only; the evaluator mirrors them. A
    // signal denotes the fencer on that side of the referee, so getting this
    // backwards would award every hit to the wrong fencer.
    expect(evaluate(spec, frame(rightArm(arm), hands)).side).toBe('right');
    expect(evaluate(spec, frame(mirrored(arm), hands)).side).toBe('left');
  });

  it('accepts Halt from either hand', () => {
    // The one signal in the set where the arm used means nothing: t.63 reads no
    // fencer into a Halt, so both arms must simply pass.
    expect(evaluate(HALT, frame(HALT_POSE)).pass).toBe(true);
    expect(evaluate(HALT, frame(mirrored(ARM_OVERHEAD))).pass).toBe(true);
    expect(HALT.directional).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Near misses                                                                */
/* -------------------------------------------------------------------------- */

describe('near misses fail on the constraint that was actually wrong', () => {
  it('catches a Halt made with a bent arm', () => {
    const bent = frame(
      rightArm({ upper: { elevation: 85, azimuth: 0 }, forearm: { elevation: 25, azimuth: 0 } })
    );
    const result = evaluate(HALT, bent);

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].measure).toBe('elbow.R');
    expect(result.failures[0].message).toBe('Straighten your raised arm fully');
  });

  it('catches a Halt made with a closed hand', () => {
    const result = evaluate(HALT, frame(HALT_POSE, handFrame(FIST, OPEN_PALM)));

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].code).toBe('wrong_shape');
  });

  it('reads an Attack given with a straight arm as a Hit against', () => {
    // The bent elbow is the whole of the difference, and straightening it does
    // not produce a poor Attack — it produces a different signal.
    const straight = frame(HIT_AGAINST_POSE);
    const result = evaluate(ATTACK, straight);

    expect(result.pass).toBe(false);
    expect(result.failures[0].measure).toBe('elbow.R');
    expect(result.failures[0].message).toBe(
      'Bend your elbow — a straight arm is a different signal'
    );
    expect(bestMatch(SIGNAL_SPECS, straight)?.signal).toBe('hit_against');
  });

  it('catches a Parry with the forearm still down', () => {
    const dropped = frame(
      rightArm({ upper: { elevation: -20, azimuth: 10 }, forearm: { elevation: 20, azimuth: 5 } })
    );
    const result = evaluate(PARRY, dropped);

    expect(result.pass).toBe(false);
    expect(result.failures.map((failure) => failure.measure)).toContain('forearm.elevation.R');
    // Still recognisably an attempt at the signal, not a random pose.
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('catches a Point in line made with a flat hand', () => {
    const result = evaluate(POINT_IN_LINE, frame(POINT_IN_LINE_POSE, PALMS));

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].code).toBe('wrong_shape');
    expect(result.failures[0].message).toBe(
      'Point with your index finger — an open hand is “hit against”'
    );
  });

  it('catches a Hit scored not raised high enough', () => {
    const low = frame(
      rightArm({ upper: { elevation: -30, azimuth: 70 }, forearm: { elevation: 45, azimuth: 45 } })
    );
    const result = evaluate(HIT_SCORED, low);

    expect(result.pass).toBe(false);
    expect(result.failures.map((failure) => failure.measure)).toContain('wrist.vsShoulder.R');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('catches a Hit against made with a closed hand', () => {
    const result = evaluate(HIT_AGAINST, frame(HIT_AGAINST_POSE, handFrame(FIST, OPEN_PALM)));

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].code).toBe('wrong_shape');
  });

  it('catches a Not valid dropped straight down at the side', () => {
    // The arm has to go *out* as well as down; hanging it at the side is the
    // resting posture, not a signal.
    const hanging = frame(rightArm(ARM_DOWN));
    const result = evaluate(NOT_VALID, hanging);
    const failed = result.failures.map((failure) => failure.measure);

    expect(result.pass).toBe(false);
    expect(failed).toContain('upper.elevation.R');
    expect(failed).toContain('wrist.lateral.R');
  });

  it('catches a Double hit with one arm sagging', () => {
    const sagging = frame({
      arms: { right: ARM_LATERAL, left: { upper: { elevation: -20, azimuth: 90 } } },
    });
    const result = evaluate(DOUBLE_HIT, sagging);

    expect(result.pass).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('asymmetric');
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
    // Nothing is one of the specs that needs the hand model. When it has not
    // produced a hand the failure is the camera's, not the referee's, and the
    // two must not read alike.
    const noHands = frame(NOTHING_POSE, null);
    const result = evaluate(NOTHING, noHands);

    expect(result.pass).toBe(false);
    expect(result.failures.every((failure) => failure.code === 'unmeasured')).toBe(true);
  });

  it('grades the hand-free signals without any hand data at all', () => {
    // Most specs do not set `needsHands`, so the hand model is never run for
    // them and they must be complete without it.
    for (const { spec, pose } of SIGNALS.filter(({ spec }) => !spec.needsHands)) {
      expect(evaluate(spec, frame(pose, null)).pass).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The set itself                                                             */
/* -------------------------------------------------------------------------- */

describe('the spec set', () => {
  it.each(SIGNAL_SPECS)('$id is well formed', (spec) => {
    expect(validateSpec(spec)).toEqual([]);
  });

  it('covers the core ten, in the canonical order', () => {
    expect(SIGNAL_SPECS.map((spec) => spec.id)).toEqual(CORE_SIGNALS.map((signal) => signal.id));
  });

  it('has a fixture for every spec', () => {
    // Otherwise a signal could be authored and never once graded.
    expect(SIGNALS.map(({ spec }) => spec.id)).toEqual(SIGNAL_SPECS.map((spec) => spec.id));
  });

  it('uses the canonical ids and labels from the rules data', () => {
    // Scenario answer keys and the weapon table reference these ids. A spec
    // naming itself something else would simply never be gradable.
    for (const spec of SIGNAL_SPECS) {
      expect(spec.label).toBe(signalLabel(spec.id as CoreSignalId));
      expect(spec.rule).toBe('t.63');
      expect(spec.holdMs).toEqual(T63_HOLD_MS);
    }
  });

  it('declares the hand model only where fingers are read', () => {
    // It roughly doubles the per-frame cost, so the four that read a shape pay
    // for it and the other six do not.
    const reading = SIGNAL_SPECS.filter((spec) => spec.needsHands).map((spec) => spec.id);

    expect(reading).toEqual(['halt', 'point_in_line', 'hit_against', 'nothing']);
  });

  it('marks a signal directional exactly when it names a fencer', () => {
    // Halt stops the bout and the two-armed three describe the outcome; the
    // rest denote the fencer on the referee's right or left, and stage 16
    // grades the side for those and only those.
    const directional = SIGNAL_SPECS.filter((spec) => spec.directional).map((spec) => spec.id);

    expect(directional).toEqual([
      'attack',
      'parry',
      'point_in_line',
      'hit_scored',
      'hit_against',
      'not_valid',
    ]);
  });

  it('looks a spec up by id, and admits when there is none', () => {
    expect(signalSpec('double_hit')).toBe(DOUBLE_HIT);
    expect(signalSpec('halt')).toBe(HALT);
    // The other ten t.63 signals are reference-only until they are authored.
    expect(signalSpec('winner')).toBeUndefined();
  });

  it('has no duplicate ids', () => {
    const ids = SIGNAL_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
