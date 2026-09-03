import { describe, expect, it } from 'vitest';
import {
  advanceCall,
  beginCall,
  cameraStopped,
  createEngine,
  restart,
  submitCall,
  undoLastCall,
} from './engine';
import type { EngineState } from './engine';
import type { Scenario } from './schema';
import { SIGNAL_SPECS } from '../signals/specs';
import type { SignalSpec } from '../signals/evaluator';
import { measure } from '../cv/measurements';
import type { Measurements } from '../cv/measurements';
import { ARM_DOWN, makePose } from '../test/poseFixtures';
import type { ArmSpec, PoseOptions } from '../test/poseFixtures';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function frame(options: PoseOptions): Measurements {
  return measure(makePose(options), null);
}

/** Out to the side, elbow bent, forearm lateral — `specs.test.ts`'s Attack pose. */
const ATTACK_ARM: ArmSpec = {
  upper: { elevation: -5, azimuth: 55 },
  forearm: { elevation: 5, azimuth: 95 },
};

const ATTACK_RIGHT_FRAME = frame({ arms: { right: ATTACK_ARM, left: ARM_DOWN } });
const ATTACK_LEFT_FRAME = frame({ arms: { left: ATTACK_ARM, right: ARM_DOWN } });
/** Standing at rest: matches nothing, which is how a signal gets released. */
const REST_FRAME = frame({ arms: { right: ARM_DOWN, left: ARM_DOWN } });

const STEP_MS = 50;

interface Clock {
  nowMs: number;
}

function clock(): Clock {
  return { nowMs: 0 };
}

/** Feeds `ms` worth of frames of one pose, at detection rate. See `drill.test.ts`. */
function feed(
  state: EngineState,
  measurements: Measurements,
  ms: number,
  clockRef: Clock,
  pool: readonly SignalSpec[]
): EngineState {
  let next = state;
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
    clockRef.nowMs += STEP_MS;
    next = advanceCall(next, measurements, clockRef.nowMs, pool);
  }
  return next;
}

const SCENARIO: Scenario = {
  id: 'engine-test',
  weapon: 'foil',
  video: '/scenarios/engine-test.mp4',
  title: 'Engine test',
  difficulty: 1,
  expect: [
    { signal: 'attack', side: 'right', say: ['attack'] },
    { signal: 'attack', side: 'left', say: ['attack'] },
  ],
  explanation: 'A scenario built for engine tests.',
};

/** A held Attack, right arm, then released — one full captured call. */
function captureOneAttack(pool: readonly SignalSpec[] = SIGNAL_SPECS): {
  state: EngineState;
  clockRef: Clock;
} {
  const clockRef = clock();
  let state = beginCall(createEngine(SCENARIO));
  state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, pool);
  state = feed(state, REST_FRAME, 400, clockRef, pool);
  return { state, clockRef };
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                     */
/* -------------------------------------------------------------------------- */

describe('phases', () => {
  it('starts in the watch phase, with nothing captured', () => {
    const state = createEngine(SCENARIO);
    expect(state.phase).toBe('watch');
    expect(state.calls).toEqual([]);
    expect(state.grade).toBeNull();
  });

  it('opens the call phase once the clip ends', () => {
    const state = beginCall(createEngine(SCENARIO));
    expect(state.phase).toBe('call');
  });

  it('ignores frames outside the call phase', () => {
    const watching = createEngine(SCENARIO);
    const fed = advanceCall(watching, ATTACK_RIGHT_FRAME, 50, SIGNAL_SPECS);
    expect(fed).toBe(watching);
  });
});

/* -------------------------------------------------------------------------- */
/* Free recognition and capture                                              */
/* -------------------------------------------------------------------------- */

describe('advanceCall', () => {
  it('captures a held signal without being prompted for it', () => {
    const { state } = captureOneAttack();
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({ signal: 'attack', side: 'right', outcome: 'pass' });
  });

  it('resolves the captured label from the matching spec', () => {
    const { state } = captureOneAttack();
    expect(state.calls[0].label).toBe('Attack');
  });

  it('captures more than one signal across the call phase, in order', () => {
    const clockRef = clock();
    let state = beginCall(createEngine(SCENARIO));
    state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, SIGNAL_SPECS);
    state = feed(state, REST_FRAME, 400, clockRef, SIGNAL_SPECS);
    state = feed(state, ATTACK_LEFT_FRAME, 1400, clockRef, SIGNAL_SPECS);
    state = feed(state, REST_FRAME, 400, clockRef, SIGNAL_SPECS);

    expect(state.calls.map((c) => c.side)).toEqual(['right', 'left']);
  });

  it('never recognises a signal excluded from the pool', () => {
    // Épée excludes `attack` outright; a call phase restricted to épée's legal
    // signals must never turn an Attack pose into a captured call.
    const pool = SIGNAL_SPECS.filter((spec) => spec.id !== 'attack');
    const clockRef = clock();
    let state = beginCall(createEngine({ ...SCENARIO, weapon: 'epee' }));
    state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, pool);

    expect(state.calls).toEqual([]);
  });

  it('shows a quick pass with the t.63 warning still carried on the captured call', () => {
    const clockRef = clock();
    let state = beginCall(createEngine(SCENARIO));
    state = feed(state, ATTACK_RIGHT_FRAME, 500, clockRef, SIGNAL_SPECS);
    state = feed(state, REST_FRAME, 400, clockRef, SIGNAL_SPECS);

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].outcome).toBe('quick');
  });
});

describe('undoLastCall', () => {
  it('drops the most recently captured call', () => {
    const { state } = captureOneAttack();
    expect(undoLastCall(state).calls).toEqual([]);
  });

  it('does nothing when nothing has been captured', () => {
    const state = beginCall(createEngine(SCENARIO));
    expect(undoLastCall(state)).toBe(state);
  });
});

describe('cameraStopped', () => {
  it('keeps calls already captured but drops a hold in progress', () => {
    const clockRef = clock();
    let state = beginCall(createEngine(SCENARIO));
    state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, SIGNAL_SPECS);
    state = feed(state, REST_FRAME, 400, clockRef, SIGNAL_SPECS);
    // A second Attack, started but not released.
    state = feed(state, ATTACK_LEFT_FRAME, 500, clockRef, SIGNAL_SPECS);
    expect(state.calls).toHaveLength(1);

    const stopped = cameraStopped(state);
    expect(stopped.calls).toHaveLength(1);
    expect(stopped.hold.phase).toBe('idle');
  });
});

/* -------------------------------------------------------------------------- */
/* Submitting                                                                 */
/* -------------------------------------------------------------------------- */

describe('submitCall', () => {
  it('grades the captured sequence against the scenario', () => {
    const clockRef = clock();
    let state = beginCall(createEngine(SCENARIO));
    state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, SIGNAL_SPECS);
    state = feed(state, REST_FRAME, 400, clockRef, SIGNAL_SPECS);
    state = feed(state, ATTACK_LEFT_FRAME, 1400, clockRef, SIGNAL_SPECS);

    const submitted = submitCall(state, SIGNAL_SPECS);
    expect(submitted.phase).toBe('graded');
    expect(submitted.grade).not.toBeNull();
    expect(submitted.grade?.correct).toBe(2);
  });

  it('credits a hold still in progress rather than discarding it', () => {
    const clockRef = clock();
    let state = beginCall(createEngine(SCENARIO));
    // Held past the pass floor but never released before submitting.
    state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, SIGNAL_SPECS);

    const submitted = submitCall(state, SIGNAL_SPECS);
    expect(submitted.calls).toHaveLength(1);
    expect(submitted.calls[0].side).toBe('right');
  });

  it('does nothing outside the call phase', () => {
    const state = createEngine(SCENARIO);
    expect(submitCall(state, SIGNAL_SPECS)).toBe(state);
  });
});

describe('restart', () => {
  it('returns to a fresh watch phase for the same scenario, score discarded', () => {
    const clockRef = clock();
    let state = beginCall(createEngine(SCENARIO));
    state = feed(state, ATTACK_RIGHT_FRAME, 1400, clockRef, SIGNAL_SPECS);
    const graded = submitCall(state, SIGNAL_SPECS);

    const fresh = restart(graded);
    expect(fresh.phase).toBe('watch');
    expect(fresh.calls).toEqual([]);
    expect(fresh.grade).toBeNull();
    expect(fresh.scenario).toBe(SCENARIO);
  });
});
