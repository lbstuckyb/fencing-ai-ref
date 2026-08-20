/**
 * The authored signal specs — the data half of the classifier.
 *
 * `evaluator.ts` knows how to grade a constraint list; this file is the list.
 * All ten core signals live here, laid out in rulebook order. They were not
 * authored in that order: the three two-armed ones came first, because they were
 * the hard part, and the seven one-armed ones were fitted around them.
 *
 * ## Why the two-armed three came first
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
 * ## How the other seven separate
 *
 * They are all one-armed, and the first thing every one of them says is *the
 * other arm is down* — which is what keeps a Hit against, an arm straight out to
 * the side, from also reading as half of a Double hit. After that they fall into
 * two families that separate on the elbow:
 *
 *     straight arm    Halt (overhead)  Point in line / Hit against (lateral)
 *                     Not valid (down and out)
 *     bent arm        Attack (forearm lateral)  Parry (forearm vertical, by the
 *                     head)  Hit scored (arm raised out to the side)
 *
 * Within each family the wrist lands somewhere no other member puts it — above
 * the nose, level with the shoulder, below the waist — with one exception.
 * **Point in line and Hit against are geometrically identical** and separate on
 * hand shape alone: a pointed index finger against a flat palm. That is what the
 * t.63 figures show, so it is what the specs read. A hand the classifier cannot
 * name leaves both failing, which is the right way round — better to ask the
 * referee to show their hand than to guess which fencer they meant.
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
 * it: open `/calibrate`, perform each signal, read the measurements named in its
 * comment off the record button's min/median/max, and move the bands here. The
 * discriminator test in `specs.test.ts` will tell you immediately if a widened
 * band has started overlapping its neighbour, which is the one mistake that
 * matters.
 *
 * One band has now been off the mannequin and in front of a person:
 * `STRAIGHT_ARM`, and `BENT_ARM_MAX` with it, because the two are joined. A
 * referee extending an arm as far as it goes was failing every straight-armed
 * signal at 97% of the shape score, on the elbow alone. Everything else here is
 * still mannequin-authored.
 */

import { signalLabel } from '../data/rules';
import type { CoreSignalId } from '../data/rules';
import { T63_HOLD_MS } from './holdMachine';
import {
  abduction,
  azimuth,
  elbow,
  elevation,
  hand,
  symmetry,
  wristForward,
  wristGap,
  wristHeight,
  wristLateral,
  wristVsNose,
  wristVsShoulder,
} from './evaluator';
import type { Band, Constraint, SignalSpec } from './evaluator';

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

/**
 * Highest the non-signalling wrist may be, in torso lengths, for a signal to
 * count as one-armed.
 *
 * 0.4 is a little above the waist — comfortably over a hand hanging at the side,
 * which reads about −0.1, and comfortably under the 0.5 of a Simultaneous or the
 * 1.0 of a Double hit. Without it a Hit against and one half of a Double hit are
 * the same measurement set, so this single constraint is what keeps the
 * one-armed and two-armed families apart. It is also honest coaching: t.63's
 * figures show the free arm down for every one of these seven.
 */
const OFF_ARM_MAX_HEIGHT = 0.4;

/**
 * "The arm is straight", as a real body and a pose model report it rather than as
 * the mannequin does.
 *
 * The fixtures extend to exactly 180°; a person at the limit of their extension
 * measures nearer 150°, and MediaPipe's world-space Z adds a few degrees of
 * apparent bend on top. 148° is that floor with margin, and it is the number the
 * user hit — a fully-extended arm was failing at 97% on nothing but this.
 */
const STRAIGHT_ARM: Band = [148, 180];

/**
 * Elbow ceiling for Attack, which is the *only* thing separating it from Hit
 * against and Point in line. It has to stay a few degrees under STRAIGHT_ARM's
 * floor so the strip between them belongs to no signal, and a few degrees over
 * Attack's own 139° fixture so a correctly-bent arm is not called too straight.
 */
const BENT_ARM_MAX = 145;

/**
 * The straight-arm floor for Simultaneous alone, which converges the hands in
 * front of the chest and so bends the elbows whether or not the referee means
 * it. Looser than STRAIGHT_ARM by design — see the spec's own comment.
 */
const CONVERGED_ARM: Band = [140, 180];

/** "The other arm is down" — the first thing every one-armed signal requires. */
function offArmDown() {
  return wristHeight('L', [null, OFF_ARM_MAX_HEIGHT], {
    feedback: 'Keep your other arm down at your side',
  });
}

/* -------------------------------------------------------------------------- */
/* The one-armed signals                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One arm straight overhead, palm open.
 *
 * Fixture reads: elbow 180°, abduction 180°, wrist 0.65 above the nose.
 *
 * Nothing else in the set puts a wrist above the nose, so `wrist.vsNose` alone
 * would very nearly do. `elbow` and `abduction` are there for the feedback more
 * than the verdict: a referee whose Halt fails wants to be told *straighten the
 * arm*, not *raise your hand higher*, and the two mistakes are only separable if
 * both are measured.
 *
 * Not directional. A referee may stop the bout with either hand and t.63 reads
 * no meaning into which — the only signal in the set where the arm used says
 * nothing about a fencer.
 */
export const HALT: SignalSpec = coreSpec({
  id: 'halt',
  description:
    'One arm raised straight overhead with the palm open: stop fencing. The other arm stays down.',
  directional: false,
  constraints: [
    elbow('R', STRAIGHT_ARM, { feedback: 'Straighten your raised arm fully' }),
    abduction('R', [150, 180], { feedback: 'Take your arm straight up overhead' }),
    wristVsNose('R', [0.15, null], { feedback: 'Raise your hand above your head' }),
    hand('R', 'open_palm', { feedback: 'Open your raised hand fully, palm forward' }),
    offArmDown(),
  ],
});

/**
 * Signalling arm out to the side, elbow bent, forearm pointing laterally at the
 * fencer who attacked.
 *
 * Fixture reads: elbow 139°, abduction 85°, forearm azimuth 95°, wrist level
 * with the shoulder, 1.35 out from the midline.
 *
 * The bent elbow is the whole discrimination against Hit against and Point in
 * line, which put the wrist in the same place with the arm straight — so the
 * elbow band stops at 145° rather than running to 180°, and the gap from there
 * to the 148° of STRAIGHT_ARM belongs to no one on purpose. That gap is
 * narrower than it was: the straight-arm floor came down to meet a real body,
 * and this ceiling had to come down with it or the two families would overlap.
 * It cannot come down much further — the fixture for this signal reads 139°.
 *
 * This is also the signal reused for Stop-hit, Counter-attack and Remise, which
 * t.63 gives no gesture of their own: they are called aloud over this same arm.
 */
export const ATTACK: SignalSpec = coreSpec({
  id: 'attack',
  description:
    'The signalling arm out to the side with the elbow bent, forearm pointing at the fencer who attacked. The same gesture serves for stop-hit, counter-attack and remise, which are named aloud.',
  directional: true,
  constraints: [
    elbow('R', [95, BENT_ARM_MAX], {
      feedback: 'Bend your elbow — a straight arm is a different signal',
    }),
    abduction('R', [55, 110], { feedback: 'Bring your upper arm out to shoulder height' }),
    azimuth('R', [45, 135], 'forearm', {
      feedback: 'Point your forearm out to the side, at the fencer who attacked',
    }),
    wristVsShoulder('R', [-0.35, 0.22], { feedback: 'Hold your hand level with your shoulder' }),
    wristLateral('R', [0.7, null], { feedback: 'Take the signal out to the side, not forward' }),
    offArmDown(),
  ],
});

/**
 * Forearm raised near-vertical beside the head, mimicking the parry itself.
 *
 * Fixture reads: elbow 75°, forearm elevation 85°, wrist 0.32 above the shoulder
 * and 0.46 out from the midline.
 *
 * Parry and Hit scored are the two bent-arm signals with the hand above the
 * shoulder, and what separates them is where the elbow is: a parry keeps it
 * tucked low with the hand near the head, while Hit scored raises the whole arm
 * out on the scoring fencer's side. `wrist.lateral` is the primary discriminator
 * — under 0.62 is beside the head, over 0.70 is out to the side — and
 * `abduction` is the same statement made at the shoulder.
 *
 * Also serves Counter-time, which t.63 gives no separate gesture.
 */
export const PARRY: SignalSpec = coreSpec({
  id: 'parry',
  description:
    'The forearm raised near-vertical beside the head with the elbow low, mimicking a parry: the fencer on that side parried. Counter-time uses the same gesture.',
  directional: true,
  constraints: [
    elbow('R', [50, 118], { feedback: 'Bend your elbow to about a right angle' }),
    elevation('R', [55, 105], 'forearm', {
      feedback: 'Bring your forearm up towards vertical, as if parrying',
    }),
    abduction('R', [25, 78], { feedback: 'Keep your elbow low — only the forearm comes up' }),
    wristVsShoulder('R', [0.1, null], { feedback: 'Raise your hand above your shoulder' }),
    wristLateral('R', [null, 0.62], {
      feedback: 'Keep your hand beside your head, not out to the side',
    }),
    offArmDown(),
  ],
});

/**
 * Arm straight out to the side with the index finger extended at the fencer who
 * held the line.
 *
 * Fixture reads: elbow 180°, abduction 90°, wrist level with the shoulder, 1.44
 * out from the midline, hand `index_point`.
 *
 * Geometrically this *is* Hit against — see the module comment. The pointed
 * finger is the only thing between them, which is why both carry `needsHands`
 * and why a hand the classifier reads as `unknown` fails both rather than
 * resolving to whichever was declared first.
 */
export const POINT_IN_LINE: SignalSpec = coreSpec({
  id: 'point_in_line',
  description:
    'The arm extended straight out to the side with the index finger pointed at the fencer who established the point in line.',
  directional: true,
  constraints: [
    elbow('R', STRAIGHT_ARM, { feedback: 'Extend your arm fully' }),
    abduction('R', [65, 115], { feedback: 'Hold your arm out at shoulder height' }),
    wristVsShoulder('R', [-0.3, 0.3], { feedback: 'Hold your hand level with your shoulder' }),
    wristLateral('R', [0.85, null], { feedback: 'Point straight out to the side' }),
    hand('R', 'index_point', {
      feedback: 'Point with your index finger — an open hand is “hit against”',
    }),
    offArmDown(),
  ],
});

/**
 * Arm raised out and up on the scoring fencer's side, elbow near a right angle.
 *
 * Fixture reads: elbow 110°, abduction 105°, wrist 0.67 above the shoulder and
 * 0.90 out from the midline.
 *
 * Bounded above at 125° of elbow so that straightening into a Halt is a change
 * of signal rather than a stricter Hit scored, and below at 0.7 of lateral
 * offset so that folding the arm in towards the head is a Parry.
 *
 * The boundary with Attack is height: this signal starts 0.32 of a torso above
 * the shoulder, Attack stops 0.22 above it, and the tenth in between is nobody's
 * — an arm out at shoulder height with a bent elbow is an Attack, and the same
 * arm raised is a Hit scored.
 */
export const HIT_SCORED: SignalSpec = coreSpec({
  id: 'hit_scored',
  description:
    'The arm raised out and up on the side of the fencer who scored, elbow at about a right angle: the hit is theirs.',
  directional: true,
  constraints: [
    elbow('R', [55, 125], { feedback: 'Bend your elbow to about a right angle' }),
    abduction('R', [78, 145], { feedback: 'Raise your whole arm out to the scorer’s side' }),
    wristVsShoulder('R', [0.32, null], { feedback: 'Raise your hand well above your shoulder' }),
    wristLateral('R', [0.7, null], {
      feedback: 'Raise the arm out on the scorer’s side, not in front of your head',
    }),
    offArmDown(),
  ],
});

/**
 * Arm straight out to the side, palm flat, on the side of the fencer the hit was
 * scored against.
 *
 * Fixture reads: elbow 180°, abduction 90°, wrist level with the shoulder, 1.46
 * out from the midline, hand `open_palm`.
 *
 * The flat hand is not decoration here: it is the entire difference from Point
 * in line. See the module comment.
 */
export const HIT_AGAINST: SignalSpec = coreSpec({
  id: 'hit_against',
  description:
    'The arm extended straight out to the side with a flat hand, on the side of the fencer against whom the hit was scored.',
  directional: true,
  constraints: [
    elbow('R', STRAIGHT_ARM, { feedback: 'Extend your arm fully' }),
    abduction('R', [70, 110], { feedback: 'Hold your arm out at shoulder height' }),
    wristVsShoulder('R', [-0.3, 0.3], { feedback: 'Hold your hand level with your shoulder' }),
    wristLateral('R', [0.85, null], { feedback: 'Take your arm straight out to the side' }),
    hand('R', 'open_palm', {
      feedback: 'Show a flat, open hand — a pointed finger is “point in line”',
    }),
    offArmDown(),
  ],
});

/**
 * Arm straight, extended down and out towards the floor.
 *
 * Fixture reads: elbow 180°, upper arm elevation −50°, wrist 0.84 below the
 * shoulder and 0.94 out from the midline.
 *
 * The lateral bound is what stops a Nothing — arms low and forward, elevation
 * about −60° — from reading as a one-armed Not valid: that gesture keeps the
 * hands in front of the body at about 0.5 out, this one takes the arm away from
 * it. Foil only; sabre and épée have no off-target, so `allowedSignals` never
 * offers it there.
 */
export const NOT_VALID: SignalSpec = coreSpec({
  id: 'not_valid',
  description:
    'The arm extended straight down and out towards the floor on that fencer’s side: their hit landed off-target and does not count.',
  directional: true,
  constraints: [
    elbow('R', STRAIGHT_ARM, { feedback: 'Keep the arm straight' }),
    elevation('R', [-72, -28], 'upper', {
      feedback: 'Angle the arm down towards the floor, about halfway to your side',
    }),
    wristVsShoulder('R', [null, -0.45], { feedback: 'Hold your hand well below your shoulder' }),
    wristLateral('R', [0.75, null], {
      feedback: 'Take the arm out away from your body, not straight down in front',
    }),
    offArmDown(),
  ],
});

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
    elbow('R', STRAIGHT_ARM, { feedback: 'Straighten both arms fully out to the sides' }),
    elbow('L', STRAIGHT_ARM, { feedback: 'Straighten both arms fully out to the sides' }),
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
 * The elbow band is looser than the other two (140° rather than 148°) because
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
    elbow('R', CONVERGED_ARM, { feedback: 'Extend both arms forward' }),
    elbow('L', CONVERGED_ARM, { feedback: 'Extend both arms forward' }),
    wristHeight('R', [0.33, 0.74], { feedback: 'Hold both hands at chest height' }),
    wristHeight('L', [0.33, 0.74], { feedback: 'Hold both hands at chest height' }),
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
    elbow('R', STRAIGHT_ARM, { feedback: 'Straighten both arms' }),
    elbow('L', STRAIGHT_ARM, { feedback: 'Straighten both arms' }),
    wristHeight('R', [null, 0.25], { feedback: 'Lower both hands below your waist' }),
    wristHeight('L', [null, 0.25], { feedback: 'Lower both hands below your waist' }),
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
 * The core ten, complete. The practice page and the scenario call phase read
 * this list, so adding a spec here — plus its id in `rules.ts` — is the whole of
 * adding a signal to the app. The other ten t.63 signals are pure data additions
 * of exactly this shape.
 */
export const SIGNAL_SPECS: readonly SignalSpec[] = [
  HALT,
  ATTACK,
  PARRY,
  POINT_IN_LINE,
  HIT_SCORED,
  HIT_AGAINST,
  NOT_VALID,
  DOUBLE_HIT,
  SIMULTANEOUS,
  NOTHING,
];

export const SIGNAL_BY_ID: ReadonlyMap<string, SignalSpec> = new Map(
  SIGNAL_SPECS.map((spec) => [spec.id, spec])
);

/** The spec for an id, or `undefined` for anything outside the core ten. */
export function signalSpec(id: string): SignalSpec | undefined {
  return SIGNAL_BY_ID.get(id);
}
