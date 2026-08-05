import { describe, expect, it } from 'vitest';
import {
  advanceDrill,
  attemptPassed,
  chooseSignal,
  createDrill,
  nextSignal,
  promptFor,
  randomPrompt,
  stopDrill,
  wrongArm,
} from './drill';
import type { DrillOptions, DrillState } from './drill';
import { ATTACK, HALT, SIGNAL_SPECS } from './specs';
import { measure } from '../cv/measurements';
import type { Measurements } from '../cv/measurements';
import type { HandFrame } from '../cv/types';
import { ARM_DOWN, ARM_OVERHEAD, makePose } from '../test/poseFixtures';
import type { ArmSpec, PoseOptions } from '../test/poseFixtures';
import { OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Open palms on both hands — Halt reads fingers, so its frames need them. */
const PALMS: HandFrame = {
  hands: [
    {
      screen: makeHandScreen(0.4, 0.5),
      world: makeHand(OPEN_PALM),
      side: 'right',
      handedness: 'Left',
      score: 0.95,
    },
    {
      screen: makeHandScreen(0.6, 0.5),
      world: makeHand(OPEN_PALM),
      side: 'left',
      handedness: 'Right',
      score: 0.95,
    },
  ],
  timestampMs: 0,
};

function frame(options: PoseOptions): Measurements {
  return measure(makePose(options), PALMS);
}

/** Out to the side, elbow bent, forearm lateral — as `specs.test.ts` poses it. */
const ATTACK_ARM: ArmSpec = {
  upper: { elevation: -5, azimuth: 55 },
  forearm: { elevation: 5, azimuth: 95 },
};

const HALT_FRAME = frame({ arms: { right: ARM_OVERHEAD, left: ARM_DOWN } });
const ATTACK_RIGHT = frame({ arms: { right: ATTACK_ARM, left: ARM_DOWN } });
const ATTACK_LEFT = frame({ arms: { left: ATTACK_ARM, right: ARM_DOWN } });
/** Standing at rest: matches nothing, which is how a signal gets released. */
const REST = frame({ arms: { right: ARM_DOWN, left: ARM_DOWN } });
/** A Halt with the elbow folded — the right idea, made wrong. */
const BENT_HALT = frame({
  arms: {
    right: { upper: { elevation: 85, azimuth: 0 }, forearm: { elevation: 25, azimuth: 0 } },
    left: ARM_DOWN,
  },
});

/**
 * Detection interval used by every timeline here. It is close to the real
 * ~22 fps, and the hold machine's slack is sized against exactly that — so a
 * timeline written in these steps measures what a live one would.
 */
const STEP_MS = 50;

interface Clock {
  nowMs: number;
}

/**
 * Feeds `ms` worth of frames of one pose, at detection rate.
 *
 * Returns the state after the last frame, so a timeline reads as the sequence of
 * things the referee did: hold this for a second, come out of it, wait.
 *
 * Releases are fed for longer than they look as though they need to be. The hold
 * machine forgives 200 ms of lost tracking before it calls a signal released, so
 * a shorter release here would read as a dropout and the attempt would never
 * conclude — which is the intended behaviour, not a quirk to work around.
 */
function feed(
  state: DrillState,
  measurements: Measurements,
  ms: number,
  clock: Clock,
  options: Partial<DrillOptions> = {}
): DrillState {
  let next = state;
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
    clock.nowMs += STEP_MS;
    next = advanceDrill(next, measurements, clock.nowMs, options);
  }
  return next;
}

function clock(): Clock {
  return { nowMs: 0 };
}

/** A drill pinned to one signal, so a test states what it is drilling. */
function drillOn(spec = HALT, options: Partial<DrillOptions> = {}): DrillState {
  return chooseSignal(createDrill({ pool: [spec], random: () => 0, ...options }), spec, options);
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                    */
/* -------------------------------------------------------------------------- */

describe('prompts', () => {
  it('asks for an arm only where the signal names a fencer', () => {
    // Halt stops the bout and reads no meaning into the hand used; Attack names
    // the fencer on that side, so the drill has to prompt one.
    expect(promptFor(HALT, () => 0).side).toBeNull();
    expect(promptFor(ATTACK, () => 0).side).toBe('left');
    expect(promptFor(ATTACK, () => 0.9).side).toBe('right');
  });

  it('does not offer the same signal twice running', () => {
    // A drill that repeats itself reads as one that has stopped responding.
    const repeated = Array.from({ length: 20 }, (_, index) =>
      randomPrompt({ pool: SIGNAL_SPECS, random: () => index / 20 }, HALT)
    );

    expect(repeated.some((prompt) => prompt.spec === HALT)).toBe(false);
  });

  it('still has something to ask for when the pool holds one signal', () => {
    // Rather than an undefined prompt, which would take the page down.
    expect(randomPrompt({ pool: [HALT], random: () => 0 }, HALT).spec).toBe(HALT);
  });

  it('never picks past the end of the pool', () => {
    // Math.random() is documented as < 1, but a supplied one need not be, and an
    // out-of-range index here would be an undefined spec inside a live drill.
    expect(randomPrompt({ pool: SIGNAL_SPECS, random: () => 1 }).spec).toBe(
      SIGNAL_SPECS[SIGNAL_SPECS.length - 1]
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Grading one attempt                                                        */
/* -------------------------------------------------------------------------- */

describe('a signal held properly', () => {
  it('passes when it is held for the duration t.63 asks for, and counts', () => {
    const time = clock();
    let state = drillOn(HALT);

    state = feed(state, HALT_FRAME, 1400, time);
    // The rule is met while the pose is still up — the ring fills and the
    // referee is told so before their arm comes down.
    expect(state.hold.phase).toBe('held');
    expect(state.progress).toBe(1);
    expect(state.attempt).toBeNull();

    state = feed(state, REST, 400, time);

    expect(state.attempt?.outcome).toBe('pass');
    expect(state.attempt?.message).toBeNull();
    expect(state.attempt?.heldMs).toBeGreaterThanOrEqual(900);
    expect(state.streak).toBe(1);
    expect(state.passes).toBe(1);
    expect(state.attempts).toBe(1);
  });

  it('warns about a signal stabbed at, but still counts it', () => {
    // t.63 sets an expressiveness floor. Missing it is a fault to correct, not a
    // failed rep — so the streak survives and the wording is the rule's own.
    const time = clock();
    let state = drillOn(HALT);

    state = feed(state, HALT_FRAME, 500, time);
    state = feed(state, REST, 400, time);

    expect(state.attempt?.outcome).toBe('quick');
    expect(state.attempt?.message).toMatch(/too quick/i);
    expect(state.attempt?.message).toMatch(/1–2 seconds/);
    expect(attemptPassed(state.attempt!)).toBe(true);
    expect(state.streak).toBe(1);
  });

  it('ignores an arm passing through the pose on its way somewhere else', () => {
    // Two frames of a correct Halt is not an attempt at a Halt, and reporting it
    // would hand the referee a correction for a signal they never made.
    const time = clock();
    let state = drillOn(HALT);

    state = feed(state, HALT_FRAME, 100, time);
    state = feed(state, REST, 300, time);

    expect(state.attempt).toBeNull();
    expect(state.attempts).toBe(0);
  });

  it('never completes an attempt from a gesture that is not the prompt', () => {
    const time = clock();
    let state = drillOn(HALT);

    state = feed(state, ATTACK_RIGHT, 2000, time);

    expect(state.attempt).toBeNull();
    expect(state.progress).toBe(0);
    expect(state.evaluation?.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The wrong arm                                                              */
/* -------------------------------------------------------------------------- */

describe('a directional signal made with the wrong arm', () => {
  /** Attack prompted on the right; `random` ≥ 0.5 chooses that side. */
  function attackRight(): DrillState {
    return chooseSignal(createDrill({ pool: [ATTACK], random: () => 0.9 }), ATTACK, {
      random: () => 0.9,
    });
  }

  it('is caught, breaks the streak, and says which arm was wanted', () => {
    const time = clock();
    let state = attackRight();
    expect(state.prompt.side).toBe('right');

    // Bank a pass first, so the streak has something to lose.
    state = feed(state, ATTACK_RIGHT, 1400, time);
    state = feed(state, REST, 400, time);
    expect(state.streak).toBe(1);

    state = feed(state, ATTACK_LEFT, 1400, time);
    state = feed(state, REST, 400, time);

    expect(state.attempt?.outcome).toBe('wrong_side');
    expect(state.attempt?.side).toBe('left');
    expect(state.attempt?.message).toMatch(/correct Attack, but made with your left arm/i);
    expect(state.attempt?.message).toMatch(/your right arm/i);
    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(1);
    expect(state.passes).toBe(1);
    expect(state.attempts).toBe(2);
  });

  it('lets the ring fill so the mistake is visible before it costs the rep', () => {
    // The wrong arm is judged when the hold completes, not filtered out per
    // frame: a referee holding a perfect signal must not watch a ring sit at
    // zero with no explanation.
    const time = clock();
    let state = attackRight();

    state = feed(state, ATTACK_LEFT, 1400, time);

    expect(state.progress).toBe(1);
    expect(wrongArm(state)).toBe(true);
  });

  it('keeps the prompt so the referee can make it again on the right arm', () => {
    const time = clock();
    let state = attackRight();

    state = feed(state, ATTACK_LEFT, 1400, time);
    state = feed(state, REST, 2000, time);

    expect(state.prompt.spec).toBe(ATTACK);
    expect(state.prompt.side).toBe('right');
  });

  it('does not judge the arm used for a signal that names no fencer', () => {
    // Halt is the one signal in the set a referee may make with either hand.
    const time = clock();
    let state = drillOn(HALT);
    const mirrored = frame({ arms: { left: ARM_OVERHEAD, right: ARM_DOWN } });

    state = feed(state, mirrored, 1400, time);
    expect(wrongArm(state)).toBe(false);

    state = feed(state, REST, 400, time);
    expect(state.attempt?.outcome).toBe('pass');
    expect(state.attempt?.side).toBe('left');
  });
});

/* -------------------------------------------------------------------------- */
/* Live coaching                                                              */
/* -------------------------------------------------------------------------- */

describe('live feedback', () => {
  it('names the constraint that is actually wrong', () => {
    // The whole reason the classifier is rule-based: a model can say "not a
    // Halt", only a constraint list can say which part to fix.
    const time = clock();
    const state = feed(drillOn(HALT), BENT_HALT, 300, time);

    expect(state.evaluation?.pass).toBe(false);
    expect(state.evaluation?.failures[0].message).toBe('Straighten your raised arm fully');
    expect(state.evaluation?.score).toBeGreaterThan(0.5);
  });

  it('scores a near miss above a wholly different pose', () => {
    // The score drives a progress bar, so it has to mean "how close", not "how
    // certain" — a bent-arm Halt is closer than standing at rest.
    const time = clock();
    const near = feed(drillOn(HALT), BENT_HALT, 200, time);
    const far = feed(drillOn(HALT), REST, 200, time);

    expect(near.evaluation!.score).toBeGreaterThan(far.evaluation!.score);
  });
});

/* -------------------------------------------------------------------------- */
/* Moving between prompts                                                     */
/* -------------------------------------------------------------------------- */

describe('moving between prompts', () => {
  const POOL = [HALT, ATTACK];

  it('moves on by itself once a passed signal has been read and released', () => {
    const time = clock();
    const options: Partial<DrillOptions> = { pool: POOL, random: () => 0 };
    let state = createDrill(options);
    expect(state.prompt.spec).toBe(HALT);

    state = feed(state, HALT_FRAME, 1400, time, options);
    state = feed(state, REST, 400, time, options);
    // Still on the same prompt: the ✓ has to stay up long enough to read.
    expect(state.prompt.spec).toBe(HALT);
    expect(state.attempt?.outcome).toBe('pass');

    state = feed(state, REST, 1200, time, options);

    expect(state.prompt.spec).toBe(ATTACK);
    expect(state.attempt).toBeNull();
    // The score is the user's and survives the prompt change.
    expect(state.streak).toBe(1);
  });

  it('waits for the arm to come down before changing the prompt', () => {
    // A new signal appearing under an arm still held up for the last one would
    // start the next rep already wrong.
    const time = clock();
    const options: Partial<DrillOptions> = { pool: POOL, random: () => 0 };
    let state = createDrill(options);

    state = feed(state, HALT_FRAME, 1400, time, options);
    state = feed(state, REST, 400, time, options);
    state = feed(state, HALT_FRAME, 3000, time, options);

    expect(state.prompt.spec).toBe(HALT);
  });

  it('stays on a missed signal rather than moving on', () => {
    const time = clock();
    const options: Partial<DrillOptions> = { pool: [HALT, ATTACK], random: () => 0.9 };
    let state = createDrill(options);
    expect(state.prompt.spec).toBe(ATTACK);
    expect(state.prompt.side).toBe('right');

    state = feed(state, ATTACK_LEFT, 1400, time, options);
    state = feed(state, REST, 3000, time, options);

    expect(state.prompt.spec).toBe(ATTACK);
  });

  it('stays put when the user picked the signal', () => {
    // Someone working on one gesture, or arriving from the reference page, is
    // not asking to be moved along.
    const time = clock();
    const options: Partial<DrillOptions> = { pool: POOL, random: () => 0 };
    let state = chooseSignal(createDrill(options), HALT, options);

    state = feed(state, HALT_FRAME, 1400, time, options);
    state = feed(state, REST, 3000, time, options);

    expect(state.mode).toBe('fixed');
    expect(state.prompt.spec).toBe(HALT);
    expect(state.attempt?.outcome).toBe('pass');
  });

  it('drops a hold in progress when the prompt changes', () => {
    // Otherwise most of a Halt would be credited to whatever comes next.
    const time = clock();
    const options: Partial<DrillOptions> = { pool: POOL, random: () => 0 };
    let state = feed(drillOn(HALT), HALT_FRAME, 800, time);

    state = chooseSignal(state, ATTACK, { ...options, random: () => 0.9 });
    expect(state.hold.phase).toBe('idle');
    expect(state.progress).toBe(0);

    state = feed(state, ATTACK_RIGHT, 500, time, options);
    state = feed(state, REST, 400, time, options);
    expect(state.attempt?.outcome).toBe('quick');
  });

  it('returns to random prompts on a skip, keeping the score', () => {
    const time = clock();
    const options: Partial<DrillOptions> = { pool: POOL, random: () => 0 };
    let state = chooseSignal(createDrill(options), HALT, options);

    state = feed(state, HALT_FRAME, 1400, time, options);
    state = feed(state, REST, 400, time, options);
    state = nextSignal(state, options);

    expect(state.mode).toBe('random');
    expect(state.prompt.spec).toBe(ATTACK);
    expect(state.streak).toBe(1);
    expect(state.attempt).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The camera stopping                                                        */
/* -------------------------------------------------------------------------- */

describe('the camera stopping', () => {
  it('drops a hold in progress without crediting it', () => {
    // The signal was never released; stopping the camera must not score it.
    const time = clock();
    let state = feed(drillOn(HALT), HALT_FRAME, 1400, time);
    expect(state.hold.phase).toBe('held');

    state = stopDrill(state);

    expect(state.attempt).toBeNull();
    expect(state.attempts).toBe(0);
    expect(state.progress).toBe(0);
    expect(state.evaluation).toBeNull();
  });

  it('keeps the score, and grades cleanly when the camera comes back', () => {
    const time = clock();
    let state = drillOn(HALT);
    state = feed(state, HALT_FRAME, 1400, time);
    state = feed(state, REST, 400, time);
    state = stopDrill(state);

    expect(state.streak).toBe(1);
    expect(state.bestStreak).toBe(1);

    // A restarted camera hands back a clock that has moved on; the machine must
    // not treat the gap as a hold.
    time.nowMs += 60_000;
    state = feed(state, HALT_FRAME, 1400, time);
    state = feed(state, REST, 400, time);

    expect(state.streak).toBe(2);
    expect(state.attempt?.outcome).toBe('pass');
  });
});
