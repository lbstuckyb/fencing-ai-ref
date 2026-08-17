import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCalibration,
  calibratedBand,
  clearCalibration,
  loadCalibrationStore,
  recordCalibration,
  saveCalibrationStore,
  STORAGE_KEY,
} from './calibration';
import type { CalibrationStore, SignalCalibration } from './calibration';
import { DEFAULT_TOLERANCE, elbow, hand, symmetry, wristHeight } from './evaluator';
import type { Band, Constraint, SignalSpec } from './evaluator';

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
    directional: true,
    constraints,
    ...overrides,
  };
}

function calibration(overrides: Partial<SignalCalibration> = {}): SignalCalibration {
  return {
    signalId: 'test',
    side: 'right',
    recordedAtMs: 1700000000000,
    measurements: {},
    shapes: { right: null, left: null },
    rawPoseWorld: [],
    ...overrides,
  };
}

function bandOf(constraint: Constraint): Band {
  if (constraint.kind !== 'range') throw new Error('expected a range constraint');
  return constraint.band;
}

beforeEach(() => {
  localStorage.clear();
});

/* -------------------------------------------------------------------------- */
/* calibratedBand                                                             */
/* -------------------------------------------------------------------------- */

describe('calibratedBand', () => {
  it('replaces a closed band, centred on the recording with the unit margin', () => {
    const result = calibratedBand([95, 145], 120, 'deg');
    expect(result).toEqual([120 - DEFAULT_TOLERANCE.deg, 120 + DEFAULT_TOLERANCE.deg]);
  });

  it('keeps an open lower bound open', () => {
    const result = calibratedBand([null, 0.4], 0.2, 'torso');
    expect(result).toEqual([null, 0.2 + DEFAULT_TOLERANCE.torso]);
  });

  it('keeps an open upper bound open', () => {
    const result = calibratedBand([0.15, null], 0.5, 'torso');
    expect(result).toEqual([0.5 - DEFAULT_TOLERANCE.torso, null]);
  });
});

/* -------------------------------------------------------------------------- */
/* applyCalibration                                                           */
/* -------------------------------------------------------------------------- */

describe('applyCalibration', () => {
  const oneArmed = spec([elbow('R', [95, 145]), wristHeight('L', [null, 0.4])], {
    id: 'one_armed',
  });

  it('leaves a spec with no recording unchanged, by the same reference', () => {
    const [result] = applyCalibration([oneArmed], {});
    expect(result).toBe(oneArmed);
  });

  it('mirrors a left-arm recording onto the authored R (signalling) and L (off-arm) constraints', () => {
    const store: CalibrationStore = {
      one_armed: calibration({
        signalId: 'one_armed',
        side: 'left',
        measurements: {
          'elbow.L': 170, // anatomical left elbow — the arm that signalled
          'wrist.height.R': 0.1, // anatomical right wrist — the off arm
        },
      }),
    };

    const [result] = applyCalibration([oneArmed], store);
    const [elbowConstraint, offArmConstraint] = result.constraints;

    expect(bandOf(elbowConstraint)).toEqual([
      170 - DEFAULT_TOLERANCE.deg,
      170 + DEFAULT_TOLERANCE.deg,
    ]);
    expect(bandOf(offArmConstraint)).toEqual([null, 0.1 + DEFAULT_TOLERANCE.torso]);
  });

  it('calibrates a two-armed spec independently on each side', () => {
    const twoArmed = spec([elbow('R', [140, 180]), elbow('L', [140, 180])], {
      id: 'two_armed',
      directional: false,
    });
    const store: CalibrationStore = {
      two_armed: calibration({
        signalId: 'two_armed',
        side: 'right',
        measurements: { 'elbow.R': 175, 'elbow.L': 178 },
      }),
    };

    const [result] = applyCalibration([twoArmed], store);
    const [right, left] = result.constraints;

    expect(bandOf(right)).toEqual([175 - DEFAULT_TOLERANCE.deg, 175 + DEFAULT_TOLERANCE.deg]);
    expect(bandOf(left)).toEqual([178 - DEFAULT_TOLERANCE.deg, 178 + DEFAULT_TOLERANCE.deg]);
  });

  it('never touches hand or symmetry constraints', () => {
    const mixed = spec([hand('R', 'open_palm'), symmetry('wrist.height', 0.18)], {
      id: 'mixed',
      needsHands: true,
      directional: false,
    });
    const store: CalibrationStore = {
      mixed: calibration({
        signalId: 'mixed',
        measurements: { 'wrist.height.R': 0.9, 'wrist.height.L': 0.9 },
      }),
    };

    const [result] = applyCalibration([mixed], store);
    expect(result.constraints[0]).toBe(mixed.constraints[0]);
    expect(result.constraints[1]).toBe(mixed.constraints[1]);
  });

  it('leaves a constraint unchanged when the recording has no usable value for it', () => {
    const store: CalibrationStore = {
      one_armed: calibration({
        signalId: 'one_armed',
        side: 'right',
        measurements: { 'elbow.R': null },
      }),
    };

    const [result] = applyCalibration([oneArmed], store);
    expect(result.constraints[0]).toEqual(oneArmed.constraints[0]);
  });
});

/* -------------------------------------------------------------------------- */
/* recordCalibration / clearCalibration                                      */
/* -------------------------------------------------------------------------- */

describe('recordCalibration / clearCalibration', () => {
  it('upserts and removes without mutating the input store', () => {
    const empty: CalibrationStore = {};
    const withOne = recordCalibration(empty, calibration({ signalId: 'halt' }));
    expect(empty).toEqual({});
    expect(withOne.halt).toBeDefined();

    const cleared = clearCalibration(withOne, 'halt');
    expect(cleared).toEqual({});
    expect(withOne.halt).toBeDefined();
  });

  it('clearing an id that was never recorded is a no-op', () => {
    const empty: CalibrationStore = {};
    expect(clearCalibration(empty, 'halt')).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* Persistence                                                               */
/* -------------------------------------------------------------------------- */

describe('store persistence', () => {
  it('defaults to {} when nothing is stored', () => {
    expect(loadCalibrationStore()).toEqual({});
  });

  it('round-trips a saved store', () => {
    const store = recordCalibration({}, calibration({ signalId: 'halt' }));
    saveCalibrationStore(store);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(loadCalibrationStore()).toEqual(store);
  });

  it('falls back to {} on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not json{{{');
    expect(loadCalibrationStore()).toEqual({});
  });

  it('falls back to {} when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(loadCalibrationStore()).toEqual({});
    } finally {
      spy.mockRestore();
    }
  });
});
