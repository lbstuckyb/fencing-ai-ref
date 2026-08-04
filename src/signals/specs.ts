/**
 * The authored signal specs — the data half of the classifier.
 *
 * `evaluator.ts` knows how to grade a constraint list; this file is the list.
 * Stage 11 authors the three two-armed signals, stage 12 adds the other seven.
 *
 * ## Why these three first
 *
 * Double hit, Simultaneous and Nothing are the only real collision risk in the
 * core ten. Every other signal is one-armed, or reads a hand shape, or puts a
 * wrist somewhere none of the others do — they separate on almost any axis you
 * pick. These three are all *both arms extended, elbows near straight*, and
 * differ only in where the hands end up. Get them clean and the rest of the set
 * is trivially separable, which is why they get a stage and a discriminator test
 * of their own.
 *
 * The separation is deliberately **one primary axis**: `wrist.height` in the
 * torso frame, where 0 is the hips and 1 the shoulders.
 *
 *     Double hit    ~1.00   shoulder height, arms straight out sideways
 *     Simultaneous  ~0.50   chest height, hands converged in front
 *     Nothing       ~0.10   below the waist, arms low and forward
 *
 * The three bands do not touch, and nothing between them belongs to anyone — a
 * referee whose hands are at 0.75 is between two signals and should be told so
 * rather than have one guessed for them. Secondary constraints (`wrists.gap`,
 * `wrist.lateral`, `wrist.forward`) then separate the same *height* from a
 * different *shape*, so that lowering your arms from a Double hit does not walk
 * through a Simultaneous on the way down.
 *
 * ## Tuning status — read before trusting these numbers
 *
 * The plan asks for these to be authored against live `/calibrate` readouts.
 * They are not, because authoring them needed a camera and a body in front of
 * it. What they *are* authored against is the synthetic mannequin in
 * `test/poseFixtures.ts`, put through the real `measure()` pipeline — so the
 * numbers are consistent with the geometry rather than read off the t.63
 * drawings, and the bands are centred on a correctly-made gesture rather than
 * guessed around it. Every band is then widened well past the fixture value,
 * because a real referee is not a mannequin.
 *
 * That makes them a sound starting point and not a finished tuning. To finish
 * it: open `/calibrate`, perform each of the three, read `wrist.height`,
 * `wrists.gap` and `wrist.forward` off the record button's min/median/max, and
 * move the bands here. The discriminator test in `specs.test.ts` will tell you
 * immediately if a widened band has started overlapping its neighbour, which is
 * the one mistake that matters.
 */

import { signalLabel } from '../data/rules';
import type { CoreSignalId } from '../data/rules';
import { T63_HOLD_MS } from './holdMachine';
import {
  elbow,
  hand,
  symmetry,
  wristForward,
  wristGap,
  wristHeight,
  wristLateral,
} from './evaluator';
import type { Constraint, SignalSpec } from './evaluator';

/* -------------------------------------------------------------------------- */
/* Authoring                                                                  */
/* -------------------------------------------------------------------------- */

interface SpecInput {
  id: CoreSignalId;
  description: string;
  directional: boolean;
  constraints: readonly Constraint[];
}

/**
 * Builds a spec with the defaults every t.63 signal shares.
 *
 * The label comes from `rules.ts` rather than being retyped, so the spec, the
 * weapon table and the scenario answer keys are guaranteed to name the same
 * signal the same way. `needsHands` is derived from the constraints for the same
 * reason `validateSpec` checks it: a spec that reads fingers without asking for
 * the hand model fails every frame with nothing on screen to say why.
 */
function coreSpec({ id, description, directional, constraints }: SpecInput): SignalSpec {
  return {
    id,
    label: signalLabel(id),
    rule: 't.63',
    description,
    holdMs: T63_HOLD_MS,
    needsHands: constraints.some((constraint) => constraint.kind === 'hand'),
    directional,
    constraints,
  };
}

/**
 * Largest acceptable difference in wrist height between the arms, in torso
 * lengths.
 *
 * All three of these signals are symmetric, and the tolerance is the same for
 * all three because it describes the referee, not the gesture: 0.18 of a torso
 * is about 9 cm on an adult, which is roughly how level two hands are when
 * someone means them to be level. Tighter starts failing correct signals; much
 * looser and a Double hit with one arm sagging to chest height stops being
 * distinguishable from a badly-made anything.
 */
const LEVEL_ARMS = 0.18;

/* -------------------------------------------------------------------------- */
/* The hard trio                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Both arms straight out to the sides at shoulder height.
 *
 * Fixture reads: height 1.00, lateral 1.46, elbow 180°.
 *
 * `wrist.lateral` is what stops a Simultaneous held too high from landing here.
 * Height alone would accept hands at shoulder level anywhere in front of the
 * body; requiring them a full torso length out from the midline says "out to the
 * sides" in the one measurement that means it.
 */
export const DOUBLE_HIT: SignalSpec = coreSpec({
  id: 'double_hit',
  description:
    'Both arms extended sideways at shoulder height: both fencers scored — a double hit, which counts for both in épée.',
  directional: false,
  constraints: [
    elbow('R', [150, 180], { feedback: 'Straighten both arms fully out to the sides' }),
    elbow('L', [150, 180], { feedback: 'Straighten both arms fully out to the sides' }),
    wristHeight('R', [0.78, 1.3], { feedback: 'Raise both hands to shoulder height' }),
    wristHeight('L', [0.78, 1.3], { feedback: 'Raise both hands to shoulder height' }),
    wristLateral('R', [0.8, null], { feedback: 'Take both arms out to the sides, not forward' }),
    wristLateral('L', [0.8, null], { feedback: 'Take both arms out to the sides, not forward' }),
    symmetry('wrist.height', LEVEL_ARMS, { feedback: 'Hold both arms level with each other' }),
  ],
});

/**
 * Both arms forward with the hands converging in front of the chest.
 *
 * Fixture reads: height 0.50, gap 0.36, forward 0.81, elbow 157°.
 *
 * The elbow band is looser than the other two (140° rather than 150°) because
 * converging the hands in front of the body bends the arms slightly whether or
 * not the referee intends it — the t.63 figure shows arms that are extended, not
 * locked. `wrists.gap` is the constraint doing the real work: under 0.85
 * shoulder widths is hands brought together, and nothing else in the set has
 * them anywhere near each other.
 */
export const SIMULTANEOUS: SignalSpec = coreSpec({
  id: 'simultaneous',
  description:
    'Both arms brought forward with the hands converging in front of the chest: the two attacks were simultaneous, so no hit is awarded.',
  directional: false,
  constraints: [
    elbow('R', [140, 180], { feedback: 'Extend both arms forward' }),
    elbow('L', [140, 180], { feedback: 'Extend both arms forward' }),
    wristHeight('R', [0.28, 0.74], { feedback: 'Hold both hands at chest height' }),
    wristHeight('L', [0.28, 0.74], { feedback: 'Hold both hands at chest height' }),
    wristForward('R', [0.4, null], { feedback: 'Bring both arms out in front of you' }),
    wristForward('L', [0.4, null], { feedback: 'Bring both arms out in front of you' }),
    wristGap([null, 0.85], { feedback: 'Bring your hands together in front of you' }),
    symmetry('wrist.height', LEVEL_ARMS, { feedback: 'Hold both arms level with each other' }),
  ],
});

/**
 * Both arms low and forward, palms down.
 *
 * Fixture reads: height 0.10, forward 0.61, elbow 170°.
 *
 * `wrist.forward` is load-bearing rather than descriptive: without it, a referee
 * simply standing with their arms at their sides satisfies every other
 * constraint here — arms straight, hands below the waist, level with each other
 * — and the app would call Nothing continuously at rest. Requiring the hands
 * *in front of* the body is what makes this a gesture instead of a posture.
 *
 * This is one of the three specs that reads fingers. Palms down is what
 * distinguishes the signal from a shrug, and an open palm is the only shape the
 * classifier can confirm it with.
 */
export const NOTHING: SignalSpec = coreSpec({
  id: 'nothing',
  description:
    'Both arms extended low and forward with the palms turned down: no hit is awarded — the phrase produced nothing.',
  directional: false,
  constraints: [
    elbow('R', [150, 180], { feedback: 'Straighten both arms' }),
    elbow('L', [150, 180], { feedback: 'Straighten both arms' }),
    wristHeight('R', [null, 0.3], { feedback: 'Lower both hands below your waist' }),
    wristHeight('L', [null, 0.3], { feedback: 'Lower both hands below your waist' }),
    wristForward('R', [0.35, null], {
      feedback: 'Reach both arms forward, not down at your sides',
    }),
    wristForward('L', [0.35, null], {
      feedback: 'Reach both arms forward, not down at your sides',
    }),
    hand('R', 'open_palm', { feedback: 'Open both hands, palms turned down' }),
    hand('L', 'open_palm', { feedback: 'Open both hands, palms turned down' }),
    symmetry('wrist.height', LEVEL_ARMS, { feedback: 'Hold both arms level with each other' }),
  ],
});

/* -------------------------------------------------------------------------- */
/* The set                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every authored spec, in the canonical order of `CORE_SIGNALS`.
 *
 * Incomplete until stage 12 — the practice page and the scenario call phase read
 * this list, so both currently offer three signals rather than ten. Adding a
 * spec here is the whole of adding a signal to the app.
 */
export const SIGNAL_SPECS: readonly SignalSpec[] = [DOUBLE_HIT, SIMULTANEOUS, NOTHING];

export const SIGNAL_BY_ID: ReadonlyMap<string, SignalSpec> = new Map(
  SIGNAL_SPECS.map((spec) => [spec.id, spec])
);

/** The spec for an id, or `undefined` where stage 12 has not authored one yet. */
export function signalSpec(id: string): SignalSpec | undefined {
  return SIGNAL_BY_ID.get(id);
}
