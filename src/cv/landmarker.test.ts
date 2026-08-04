import { describe, expect, it } from 'vitest';
import { createTimestampGuard } from './landmarker';

/**
 * MediaPipe's VIDEO mode throws on a timestamp that does not strictly increase,
 * which turns an ordinary rAF quirk into a crash. These are the shapes that
 * actually occur.
 */
describe('createTimestampGuard', () => {
  it('passes strictly increasing timestamps through unchanged', () => {
    const next = createTimestampGuard();
    expect(next(0)).toBe(0);
    expect(next(16.7)).toBe(16.7);
    expect(next(33.4)).toBe(33.4);
  });

  it('rejects a repeated timestamp', () => {
    const next = createTimestampGuard();
    next(100);
    expect(next(100)).toBeNull();
  });

  it('rejects a regressing timestamp without poisoning the guard', () => {
    const next = createTimestampGuard();
    next(500);
    expect(next(490)).toBeNull();
    // A later frame must still be accepted: one stale clock reading should not
    // stall detection for the rest of the session.
    expect(next(510)).toBe(510);
  });

  it('rejects non-finite timestamps', () => {
    const next = createTimestampGuard();
    expect(next(Number.NaN)).toBeNull();
    expect(next(Number.POSITIVE_INFINITY)).toBeNull();
    expect(next(1)).toBe(1);
  });

  it('gives each detector its own clock', () => {
    const a = createTimestampGuard();
    const b = createTimestampGuard();
    a(1000);
    expect(b(5)).toBe(5);
  });
});
