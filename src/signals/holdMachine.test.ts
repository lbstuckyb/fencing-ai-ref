import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOLD_OPTIONS,
  DROPOUT_GRACE_MS,
  T63_HOLD_MS,
  advanceHold,
  finishHold,
  holdMatch,
  holdOptionsFor,
  holdProgress,
  idleHold,
  justCompleted,
} from './holdMachine';
import type { HoldMatch, HoldOptions, HoldResult, HoldState } from './holdMachine';
import type { Stability } from './evaluator';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** One detection interval at the loop's 22 fps, rounded — see `cv/loop.ts`. */
const FRAME_MS = 45;

const ATTACK: HoldMatch = { signal: 'attack', side: 'right' };
const ATTACK_LEFT: HoldMatch = { signal: 'attack', side: 'left' };
const PARRY: HoldMatch = { signal: 'parry', side: 'right' };

/**
 * A synthetic detection stream. `feed` advances wall-clock time in frame-sized
 * steps with the given match held throughout, which is what the real loop hands
 * the machine — including the `null` frames, without which a release is invisible.
 */
function driver(options: HoldOptions = DEFAULT_HOLD_OPTIONS) {
  let state: HoldState = idleHold();
  let now = 0;
  const results: HoldResult[] = [];

  const step = (match: HoldMatch | null, atMs: number) => {
    const next = advanceHold(state, match, atMs, options);
    const done = justCompleted(state, next);
    if (done !== null) results.push(done);
    state = next;
    now = atMs;
  };

  return {
    results,
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    step,
    feed(match: HoldMatch | null, durationMs: number) {
      const end = now + durationMs;
      for (let at = now + FRAME_MS; at <= end; at += FRAME_MS) step(match, at);
      now = end;
    },
    finish() {
      const next = finishHold(state, options);
      const done = justCompleted(state, next);
      if (done !== null) results.push(done);
      state = next;
    },
  };
}

/** The single result of a run that should have produced exactly one. */
function only(results: HoldResult[]): HoldResult {
  expect(results).toHaveLength(1);
  return results[0];
}

/* -------------------------------------------------------------------------- */
/* Duration                                                                   */
/* -------------------------------------------------------------------------- */

describe('hold duration', () => {
  it('passes a signal held past the floor', () => {
    const d = driver();
    d.feed(ATTACK, 1200);
    d.feed(null, 400);

    const result = only(d.results);
    expect(result).toMatchObject({ signal: 'attack', side: 'right', outcome: 'pass' });
    expect(result.warning).toBeNull();
    expect(result.heldMs).toBeGreaterThanOrEqual(DEFAULT_HOLD_OPTIONS.floorMs);
  });

  it('warns rather than fails when the signal is released too quickly', () => {
    const d = driver();
    d.feed(ATTACK, 400);
    d.feed(null, 400);

    const result = only(d.results);
    expect(result).toMatchObject({ signal: 'attack', outcome: 'quick' });
    expect(result.warning).toMatch(/too quick/i);
    // t.63's own numbers must appear — the warning is a rule citation, not a nag.
    expect(result.warning).toContain('1–2 seconds');
    expect(result.warning).toMatch(/expressive/);
  });

  it('declares success while the pose is still held, without waiting for release', () => {
    const d = driver();
    d.feed(ATTACK, 1000);

    expect(d.state.phase).toBe('held');
    expect(holdProgress(d.state)).toBe(1);
    expect(d.results).toHaveLength(0);

    d.feed(null, 400);
    expect(only(d.results).outcome).toBe('pass');
  });

  it('never fails a long hold — the rule is a floor, not a ceiling', () => {
    const d = driver();
    d.feed(ATTACK, 5000);
    d.feed(null, 400);

    const result = only(d.results);
    expect(result.outcome).toBe('pass');
    expect(result.heldMs).toBeGreaterThan(T63_HOLD_MS[1]);
  });

  it('credits a release that lands just under the floor', () => {
    const d = driver();
    // Long enough to earn credit, short of the floor the machine passes at.
    d.step(ATTACK, 100);
    d.step(ATTACK, 950);
    d.feed(null, 400);

    expect(d.state.phase).toBe('complete');
    expect(only(d.results)).toMatchObject({ outcome: 'pass', heldMs: 850 });
  });

  it('ignores a pose too brief to have been an attempt', () => {
    const d = driver();
    d.feed(ATTACK, 150);
    d.feed(null, 400);

    expect(d.results).toHaveLength(0);
    expect(d.state.phase).toBe('idle');
  });

  it('reports progress toward the floor while forming', () => {
    const d = driver();
    expect(holdProgress(d.state)).toBe(0);

    d.feed(ATTACK, 500);
    expect(d.state.phase).toBe('forming');
    expect(holdProgress(d.state)).toBeGreaterThan(0.4);
    expect(holdProgress(d.state)).toBeLessThan(0.6);
  });
});

/* -------------------------------------------------------------------------- */
/* Jitter and dropouts                                                        */
/* -------------------------------------------------------------------------- */

describe('jitter rejection', () => {
  it('never accumulates a hold out of alternating frames', () => {
    const d = driver();
    for (let at = FRAME_MS; at <= 3000; at += FRAME_MS) {
      d.step(at % (FRAME_MS * 2) === 0 ? null : ATTACK, at);
    }

    expect(d.results).toHaveLength(0);
    expect(d.state.heldMs).toBe(0);
  });

  it('forgives a dropped frame mid-signal instead of restarting the hold', () => {
    const d = driver();
    d.feed(ATTACK, 600);
    d.feed(null, FRAME_MS); // tracking lost for one frame
    d.feed(ATTACK, 700);
    d.feed(null, 400);

    expect(only(d.results).outcome).toBe('pass');
  });

  it('does not bank the time spent in a dropout', () => {
    const gapped = driver();
    gapped.feed(ATTACK, 600);
    gapped.feed(null, DROPOUT_GRACE_MS - FRAME_MS);
    gapped.feed(ATTACK, 600);
    gapped.finish();

    const clean = driver();
    clean.feed(ATTACK, 1200);
    clean.finish();

    expect(only(gapped.results).heldMs).toBeLessThan(only(clean.results).heldMs);
  });

  it('treats a dropout longer than the grace as a release, not sooner', () => {
    const d = driver();
    d.feed(ATTACK, 500);

    d.feed(null, DROPOUT_GRACE_MS - FRAME_MS);
    expect(d.results).toHaveLength(0);
    expect(d.state.phase).toBe('forming');

    d.feed(null, 400);
    expect(only(d.results).outcome).toBe('quick');
  });
});

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

describe('hold identity', () => {
  it('reports one gesture once, however long the referee leaves it up', () => {
    const d = driver();
    d.feed(ATTACK, 3000);
    d.feed(null, 400);
    d.feed(ATTACK, 3000);
    d.feed(null, 400);

    expect(d.results.map((r) => r.outcome)).toEqual(['pass', 'pass']);
  });

  it('ends the hold when a different signal takes over', () => {
    const d = driver();
    d.feed(ATTACK, 1200);
    d.feed(PARRY, 1200);
    d.feed(null, 400);

    expect(d.results.map((r) => r.signal)).toEqual(['attack', 'parry']);
    expect(d.results.every((r) => r.outcome === 'pass')).toBe(true);
  });

  it('treats the other arm as a different signal — side is part of the answer', () => {
    const d = driver();
    d.feed(ATTACK, 1200);
    d.feed(ATTACK_LEFT, 1200);
    d.feed(null, 400);

    expect(d.results.map((r) => r.side)).toEqual(['right', 'left']);
  });

  it('separates two holds of the same signal across a real release', () => {
    const d = driver();
    d.feed(ATTACK, 1200);
    d.feed(null, 600);
    d.feed(ATTACK, 1200);
    d.feed(null, 600);

    expect(d.results).toHaveLength(2);
    expect(d.results.every((r) => r.signal === 'attack')).toBe(true);
  });

  it('keeps the completed result stable so a caller cannot capture it twice', () => {
    let state = idleHold();
    for (let at = FRAME_MS; at <= 1200; at += FRAME_MS) state = advanceHold(state, ATTACK, at);
    for (let at = 1245; at <= 1600; at += FRAME_MS) {
      const next = advanceHold(state, null, at);
      state = next;
    }

    expect(state.phase).toBe('complete');
    const settled = advanceHold(state, null, 1645);
    expect(justCompleted(state, settled)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Clock and lifecycle                                                        */
/* -------------------------------------------------------------------------- */

describe('clock handling', () => {
  it('restarts on a regressing clock rather than crediting negative time', () => {
    const d = driver();
    d.feed(ATTACK, 1200);

    d.step(ATTACK, 100);
    expect(d.state.phase).toBe('forming');
    expect(d.state.heldMs).toBe(0);
    expect(d.results).toHaveLength(0);
  });

  it('ignores a non-finite timestamp', () => {
    const state = advanceHold(idleHold(), ATTACK, 100);
    expect(advanceHold(state, ATTACK, Number.NaN)).toBe(state);
  });
});

describe('finishHold', () => {
  it('credits a hold still in progress', () => {
    const d = driver();
    d.feed(ATTACK, 1200);
    d.finish();

    expect(only(d.results).outcome).toBe('pass');
    expect(d.state.phase).toBe('complete');
  });

  it('warns on a short hold still in progress', () => {
    const d = driver();
    d.feed(ATTACK, 500);
    d.finish();

    expect(only(d.results).outcome).toBe('quick');
  });

  it('discards a hold too brief to report, and is a no-op when idle', () => {
    const d = driver();
    d.feed(ATTACK, 150);
    d.finish();

    expect(d.results).toHaveLength(0);
    expect(d.state.phase).toBe('idle');
    expect(finishHold(d.state)).toBe(d.state);
  });
});

/* -------------------------------------------------------------------------- */
/* Options and glue                                                           */
/* -------------------------------------------------------------------------- */

describe('holdOptionsFor', () => {
  it('places t.63 defaults under the rule to absorb sampling error', () => {
    expect(DEFAULT_HOLD_OPTIONS.floorMs).toBe(900);
    expect(DEFAULT_HOLD_OPTIONS.creditMs).toBe(800);
    expect(DEFAULT_HOLD_OPTIONS.floorMs).toBeLessThan(T63_HOLD_MS[0]);
  });

  it('follows a spec that asks for a different band', () => {
    const options = holdOptionsFor({ holdMs: [1500, 3000] });
    expect(options.floorMs).toBe(1400);
    expect(options.creditMs).toBe(1300);

    const d = driver(options);
    d.feed(ATTACK, 1200);
    d.feed(null, 400);
    const result = only(d.results);
    expect(result.outcome).toBe('quick');
    expect(result.warning).toContain('1.5–3 seconds');
  });

  it('stays satisfiable for a nonsensically short band', () => {
    const options = holdOptionsFor({ holdMs: [50, 100] });
    expect(options.floorMs).toBeGreaterThanOrEqual(0);
    expect(options.creditMs).toBeGreaterThanOrEqual(0);
    expect(options.minAttemptMs).toBeLessThanOrEqual(options.creditMs);
  });
});

describe('holdMatch', () => {
  const stability = (overrides: Partial<Stability> = {}): Stability => ({
    streak: 3,
    signal: 'attack',
    side: 'right',
    stable: true,
    ...overrides,
  });

  it('passes a confirmed streak through', () => {
    expect(holdMatch(stability())).toEqual({ signal: 'attack', side: 'right' });
  });

  it('withholds a streak the evaluator has not confirmed', () => {
    expect(holdMatch(stability({ streak: 1, stable: false }))).toBeNull();
    expect(holdMatch(stability({ signal: null, side: null, stable: false }))).toBeNull();
  });
});
