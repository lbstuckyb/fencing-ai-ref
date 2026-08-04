import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCE,
  STABLE_FRAMES,
  abduction,
  advanceStability,
  bestMatch,
  elbow,
  evaluate,
  evaluateAll,
  evaluateOn,
  formatBand,
  hand,
  idleStability,
  range,
  symmetry,
  validateSpec,
  wristHeight,
  wristVsNose,
} from './evaluator';
import type { Constraint, Evaluation, SignalSpec, Stability } from './evaluator';
import { measure } from '../cv/measurements';
import type { Measurements } from '../cv/measurements';
import type { HandFrame, HandShape, Side } from '../cv/types';
import {
  ARM_DOWN,
  ARM_LATERAL,
  ARM_OVERHEAD,
  makePose,
  type ArmSpec,
  type PoseOptions,
} from '../test/poseFixtures';
import { FIST, INDEX_POINT, OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';
import type { HandOptions } from '../test/handFixtures';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function spec(constraints: Constraint[], overrides: Partial<SignalSpec> = {}): SignalSpec {
  return {
    id: 'test',
    label: 'Test',
    rule: 't.63',
    description: '',
    holdMs: [1000, 2000],
    needsHands: constraints.some((c) => c.kind === 'hand'),
    directional: false,
    constraints,
    ...overrides,
  };
}

/** Hands placed on both sides, so a spec can be mirrored without losing them. */
function hands(right: HandOptions, left: HandOptions): HandFrame {
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

function frame(options: PoseOptions, handFrame: HandFrame | null = null): Measurements {
  return measure(makePose(options), handFrame);
}

/**
 * The Halt geometry from the plan, authored for the right arm: one arm vertical
 * with an open palm above the head, the other down at the side.
 */
const HALT = spec(
  [
    elbow('R', [155, 180], { feedback: 'Straighten your raised arm' }),
    abduction('R', [150, 180]),
    wristVsNose('R', [0, null]),
    abduction('L', [0, 40]),
    hand('R', 'open_palm', { feedback: 'Open your hand fully' }),
  ],
  { id: 'halt', label: 'Halt' }
);

/** Right arm straight up, left arm down — a correct Halt. */
const HALT_ARMS = { right: ARM_OVERHEAD, left: ARM_DOWN };

/** A forearm bent `deg` off the upper arm, which reads as an elbow of 180 − deg. */
function bentArm(deg: number): ArmSpec {
  return { upper: { elevation: 90, azimuth: 0 }, forearm: { elevation: 90 - deg, azimuth: 0 } };
}

/* -------------------------------------------------------------------------- */
/* Range constraints                                                          */
/* -------------------------------------------------------------------------- */

describe('range constraints', () => {
  it('passes a signal performed correctly', () => {
    const result = evaluate(HALT, frame({ arms: HALT_ARMS }, hands(OPEN_PALM, FIST)));

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.signal).toBe('halt');
  });

  it('fails on the constraint that was actually wrong', () => {
    // Arm still vertical and the hand still above the nose — only the elbow is
    // bent. A failure list naming anything else here would send the referee off
    // to fix a part of the gesture that was already right.
    const result = evaluate(
      HALT,
      frame({ arms: { ...HALT_ARMS, right: bentArm(70) } }, hands(OPEN_PALM, FIST))
    );

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].measure).toBe('elbow.R');
    expect(result.failures[0].code).toBe('out_of_range');
    expect(result.failures[0].message).toBe('Straighten your raised arm');
  });

  it('generates a readable failure when the spec supplies no feedback', () => {
    const lowered = evaluate(HALT, frame({ arms: { right: ARM_LATERAL } }, hands(OPEN_PALM, FIST)));
    const abductionFailure = lowered.failures.find((f) => f.measure === 'upper.abduction.R');

    expect(abductionFailure?.message).toBe(
      'Upper arm abduction (right arm): 90° — expected 150°–180°.'
    );
  });

  it('treats an absent bound as unbounded', () => {
    expect(formatBand([0, null], 'torso')).toBe('at least 0.00');
    expect(formatBand([null, 60], 'deg')).toBe('at most 60°');
    expect(formatBand([155, 180], 'deg')).toBe('155°–180°');

    // Halt's wrist-above-nose constraint is one-sided: there is no such thing as
    // holding your hand too high.
    const veryHigh = frame({ arms: HALT_ARMS, scale: 1.4 }, hands(OPEN_PALM, FIST));
    expect(evaluate(HALT, veryHigh).pass).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Soft margins                                                               */
/* -------------------------------------------------------------------------- */

describe('soft margins', () => {
  it('scores full credit inside the band and falls off linearly outside it', () => {
    const narrow = spec([elbow('R', [170, 180], { tolerance: 20 })]);

    // 20° of forearm bend reads as a 160° elbow: 10° outside a band with a 20°
    // tolerance, so exactly half credit.
    expect(evaluateOn(narrow, frame({ arms: { right: bentArm(20) } }), 'right').score).toBeCloseTo(
      0.5,
      2
    );
    expect(evaluateOn(narrow, frame({ arms: { right: bentArm(5) } }), 'right').score).toBe(1);
    expect(evaluateOn(narrow, frame({ arms: { right: bentArm(40) } }), 'right').score).toBe(0);
  });

  it('never lets the tolerance change a verdict', () => {
    // The band decides pass/fail; the tolerance only decides how a failure is
    // scored. A generous tolerance must not quietly widen the band.
    const generous = spec([elbow('R', [170, 180], { tolerance: 200 })]);
    const result = evaluateOn(generous, frame({ arms: { right: bentArm(20) } }), 'right');

    expect(result.pass).toBe(false);
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('ranks a near miss above a gross one', () => {
    const near = evaluate(
      HALT,
      frame({ arms: { ...HALT_ARMS, right: bentArm(30) } }, hands(OPEN_PALM, FIST))
    );
    const gross = evaluate(HALT, frame({ arms: { right: ARM_DOWN } }, hands(FIST, FIST)));

    expect(near.score).toBeGreaterThan(gross.score);
    expect(near.score).toBeLessThan(1);
    // Worst first, so a UI showing one line shows the most wrong thing.
    const scores = gross.failures.map((f) => f.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });

  it('defaults the falloff width to the measurement’s unit', () => {
    expect(DEFAULT_TOLERANCE.deg).toBeGreaterThan(DEFAULT_TOLERANCE.torso);

    // One default tolerance (15°) outside a band scores zero, half of it scores
    // half — without the spec naming a tolerance at all.
    const plain = spec([elbow('R', [175, 180])]);
    expect(evaluateOn(plain, frame({ arms: { right: bentArm(20) } }), 'right').score).toBeCloseTo(
      0,
      2
    );
    expect(evaluateOn(plain, frame({ arms: { right: bentArm(12.5) } }), 'right').score).toBeCloseTo(
      0.5,
      2
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Directional mirroring                                                      */
/* -------------------------------------------------------------------------- */

describe('directional mirroring', () => {
  it('passes a spec authored for the right arm when performed on the left', () => {
    const mirrored = evaluate(
      HALT,
      frame({ arms: { left: ARM_OVERHEAD, right: ARM_DOWN } }, hands(FIST, OPEN_PALM))
    );

    expect(mirrored.pass).toBe(true);
    expect(mirrored.side).toBe('left');
    // Same numbers on either arm — the point of signing every sided measurement
    // toward its own side.
    expect(mirrored.score).toBe(1);
  });

  it('reports failures against the arm actually graded', () => {
    const result = evaluate(
      HALT,
      frame({ arms: { left: bentArm(70), right: ARM_DOWN } }, hands(FIST, OPEN_PALM))
    );

    expect(result.side).toBe('left');
    expect(result.failures[0].measure).toBe('elbow.L');
  });

  it('mirrors hand constraints with the arm', () => {
    // The open palm belongs to whichever hand is raised. Grading the left-arm
    // performance against the right hand's shape would be the mirroring trap
    // arriving through the hand model instead of the pose.
    const wrongHand = evaluate(
      HALT,
      frame({ arms: { left: ARM_OVERHEAD, right: ARM_DOWN } }, hands(OPEN_PALM, FIST))
    );

    expect(wrongHand.pass).toBe(false);
    expect(wrongHand.side).toBe('left');
    expect(wrongHand.failures[0].code).toBe('wrong_shape');
  });

  it('answers the as-authored side when both arms fit equally', () => {
    // A symmetric two-armed signal matches identically either way round. It has
    // to answer the same thing every frame regardless, or a hold would look like
    // it kept switching arms.
    const both = spec([wristHeight('R', [0.8, 1.2]), wristHeight('L', [0.8, 1.2])]);
    const result = evaluate(both, frame({ arms: { right: ARM_LATERAL, left: ARM_LATERAL } }));

    expect(result.pass).toBe(true);
    expect(result.side).toBe('right');
  });

  it('prefers a passing arm over a higher-scoring failing one', () => {
    // Left arm makes the signal; right arm is close but not there. Score alone
    // would pick the wrong one.
    const oneArm = spec([abduction('R', [150, 180]), elbow('R', [155, 180])]);
    const result = evaluate(
      oneArm,
      frame({ arms: { left: ARM_OVERHEAD, right: { upper: { elevation: 55, azimuth: 0 } } } })
    );

    expect(result.pass).toBe(true);
    expect(result.side).toBe('left');
  });
});

/* -------------------------------------------------------------------------- */
/* Hands and symmetry                                                         */
/* -------------------------------------------------------------------------- */

describe('hand constraints', () => {
  const pointing = spec([hand('R', 'index_point')]);

  it('passes the shape it asks for', () => {
    expect(evaluateOn(pointing, frame({}, hands(INDEX_POINT, FIST)), 'right').pass).toBe(true);
  });

  it('names the shape it got and the one it wanted', () => {
    const result = evaluateOn(pointing, frame({}, hands(FIST, FIST)), 'right');

    expect(result.pass).toBe(false);
    expect(result.failures[0].code).toBe('wrong_shape');
    expect(result.failures[0].message).toBe(
      'Your right hand reads as fist — this signal needs index point.'
    );
  });

  it('distinguishes a hand it could not see from a wrong one', () => {
    // The hand landmarker only runs for specs that set `needsHands`, and it
    // loses the hand often enough that "not detected" has to read differently
    // from "wrong shape" — one is a camera problem, the other is the referee's.
    const result = evaluateOn(pointing, frame({}, null), 'right');

    expect(result.failures[0].code).toBe('unmeasured');
    expect(result.failures[0].message).toContain('not detected');
  });
});

describe('symmetry constraints', () => {
  const level = spec([symmetry('wrist.height', 0.12)]);

  it('passes arms held alike', () => {
    const both = frame({ arms: { right: ARM_LATERAL, left: ARM_LATERAL } });
    expect(evaluateOn(level, both, 'right').pass).toBe(true);
  });

  it('fails arms held at different heights', () => {
    const uneven = frame({ arms: { right: ARM_LATERAL, left: ARM_DOWN } });
    const result = evaluateOn(level, uneven, 'right');

    expect(result.pass).toBe(false);
    expect(result.failures[0].code).toBe('asymmetric');
  });

  it('reads the same on either side', () => {
    // A comparison between the arms cannot depend on which one is signalling —
    // if it did, a symmetric signal would score differently on its two mirror
    // evaluations and `evaluate` would report an arbitrary side.
    const uneven = frame({ arms: { right: ARM_LATERAL, left: ARM_DOWN } });
    expect(evaluateOn(level, uneven, 'left').score).toBe(evaluateOn(level, uneven, 'right').score);
  });
});

/* -------------------------------------------------------------------------- */
/* Untracked frames                                                           */
/* -------------------------------------------------------------------------- */

describe('untracked frames', () => {
  it('fails without throwing when there is no pose at all', () => {
    const nothing = measure(null, null);
    const result = evaluate(HALT, nothing);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.failures.every((f) => f.code === 'unmeasured')).toBe(true);
  });

  it('never invents a value for a landmark it did not get', () => {
    // Every path out of `measure` is a number or a null, and a null must fail
    // rather than default: a constraint silently passing on missing data would
    // grade a referee who walked out of shot.
    const result = evaluateOn(spec([range('elbow.R', [0, 180])]), measure(null, null), 'right');
    expect(result.checks[0].value).toBeNull();
    expect(result.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Matching across specs                                                      */
/* -------------------------------------------------------------------------- */

describe('matching across specs', () => {
  const raised = spec([abduction('R', [150, 180])], { id: 'raised' });
  const lateral = spec([abduction('R', [70, 110])], { id: 'lateral' });

  it('picks the spec that matches', () => {
    const match = bestMatch([raised, lateral], frame({ arms: { right: ARM_LATERAL } }));
    expect(match?.signal).toBe('lateral');
  });

  it('returns nothing when no spec matches', () => {
    expect(bestMatch([raised, lateral], frame({ arms: { right: ARM_DOWN } }))).toBeNull();
  });

  it('orders passing specs ahead of near misses', () => {
    const ranked = evaluateAll([raised, lateral], frame({ arms: { right: ARM_OVERHEAD } }));

    expect(ranked.map((r) => r.signal)).toEqual(['raised', 'lateral']);
    expect(ranked[0].pass).toBe(true);
    expect(ranked[1].pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Jitter rejection                                                           */
/* -------------------------------------------------------------------------- */

describe('jitter rejection', () => {
  function pass(signal: string, side: Side): Evaluation {
    return { signal, side, pass: true, score: 1, failures: [], checks: [] };
  }

  function run(evaluations: (Evaluation | null)[]): Stability {
    return evaluations.reduce(advanceStability, idleStability());
  }

  it('does not believe a single passing frame', () => {
    expect(run([pass('halt', 'right')]).stable).toBe(false);
  });

  it('believes a signal held for three consecutive frames', () => {
    const held = run(Array.from({ length: STABLE_FRAMES }, () => pass('halt', 'right')));

    expect(held.stable).toBe(true);
    expect(held.streak).toBe(STABLE_FRAMES);
    expect(held.signal).toBe('halt');
    expect(held.side).toBe('right');
  });

  it('resets on a dropped frame', () => {
    // Two good frames, one drop, two good ones: not three in a row, so not a
    // signal. This is the flicker the whole mechanism exists for.
    const jittery = run([
      pass('halt', 'right'),
      pass('halt', 'right'),
      null,
      pass('halt', 'right'),
      pass('halt', 'right'),
    ]);

    expect(jittery.stable).toBe(false);
    expect(jittery.streak).toBe(2);
  });

  it('restarts the count when the signal changes', () => {
    const switched = run([pass('halt', 'right'), pass('halt', 'right'), pass('attack', 'right')]);

    expect(switched.stable).toBe(false);
    expect(switched.streak).toBe(1);
    expect(switched.signal).toBe('attack');
  });

  it('restarts the count when the arm changes', () => {
    // Same signal, other arm — a different call in a directional signal, and
    // never a continuous hold in any case.
    const switched = run([
      pass('attack', 'right'),
      pass('attack', 'right'),
      pass('attack', 'left'),
    ]);

    expect(switched.stable).toBe(false);
    expect(switched.side).toBe('left');
  });

  it('treats a failing evaluation as no signal at all', () => {
    const failing: Evaluation = { ...pass('halt', 'right'), pass: false, score: 0.9 };
    expect(run([pass('halt', 'right'), pass('halt', 'right'), failing])).toEqual(idleStability());
  });
});

/* -------------------------------------------------------------------------- */
/* Spec validation                                                            */
/* -------------------------------------------------------------------------- */

describe('validateSpec', () => {
  it('accepts a well-formed spec', () => {
    expect(validateSpec(HALT)).toEqual([]);
  });

  it('rejects a measurement that does not exist', () => {
    // The failure mode this prevents: a mistyped id measures null every frame,
    // so the spec never passes and there is nothing on screen to say why.
    const typo = spec([range('elbow.Right', [155, 180])]);
    expect(validateSpec(typo)).toEqual(['test: unknown measurement "elbow.Right"']);
  });

  it('rejects a band nothing can satisfy', () => {
    expect(validateSpec(spec([elbow('R', [180, 155])]))[0]).toContain('inverted band');
    expect(validateSpec(spec([elbow('R', [null, null])]))[0]).toContain('bounded at neither end');
    expect(validateSpec(spec([]))[0]).toContain('no constraints');
  });

  it('rejects a hand shape nothing can be classified as', () => {
    const impossible = spec([hand('R', 'unknown' as HandShape)]);
    expect(validateSpec(impossible)[0]).toContain('"unknown" hand shape');
  });

  it('checks needsHands against the constraints in both directions', () => {
    const notRunning = spec([hand('R', 'open_palm')], { needsHands: false });
    expect(validateSpec(notRunning)[0]).toContain('does not set needsHands');

    const wastedModel = spec([elbow('R', [155, 180])], { needsHands: true });
    expect(validateSpec(wastedModel)[0]).toContain('no hand constraints');
  });

  it('rejects a nonsensical hold window', () => {
    expect(validateSpec(spec([elbow('R', [155, 180])], { holdMs: [2000, 1000] }))[0]).toContain(
      'holdMs'
    );
  });

  it('validates symmetry measurements too', () => {
    expect(validateSpec(spec([symmetry('wrist.altitude', 0.1)]))[0]).toContain(
      'unknown measurement'
    );
    expect(validateSpec(spec([symmetry('wrist.height', 0.1)]))).toEqual([]);
  });
});
