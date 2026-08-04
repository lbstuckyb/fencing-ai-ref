import { describe, expect, it } from 'vitest';
import { createFrameLimiter, DETECTION_FPS } from './loop';

describe('createFrameLimiter', () => {
  it('admits the first frame immediately', () => {
    const allow = createFrameLimiter(20);
    expect(allow(0)).toBe(true);
  });

  it('rejects frames arriving inside the interval', () => {
    const allow = createFrameLimiter(20); // 50 ms
    expect(allow(1000)).toBe(true);
    expect(allow(1016)).toBe(false);
    expect(allow(1033)).toBe(false);
    expect(allow(1050)).toBe(true);
  });

  it('paces a 60 Hz animation frame stream into the target band', () => {
    const allow = createFrameLimiter(DETECTION_FPS);
    let accepted = 0;
    // One second of 60 Hz timestamps.
    for (let i = 0; i < 60; i += 1) {
      if (allow((i * 1000) / 60)) accepted += 1;
    }
    expect(accepted).toBeGreaterThanOrEqual(20);
    expect(accepted).toBeLessThanOrEqual(24);
  });

  it('paces a 120 Hz stream into the same band', () => {
    const allow = createFrameLimiter(DETECTION_FPS);
    let accepted = 0;
    for (let i = 0; i < 120; i += 1) {
      if (allow((i * 1000) / 120)) accepted += 1;
    }
    expect(accepted).toBeGreaterThanOrEqual(20);
    expect(accepted).toBeLessThanOrEqual(24);
  });

  it('does not fire a catch-up burst after a long stall', () => {
    const allow = createFrameLimiter(20);
    allow(0);
    // Tab backgrounded for two seconds.
    expect(allow(2000)).toBe(true);
    expect(allow(2010)).toBe(false);
    expect(allow(2050)).toBe(true);
  });

  it('recovers from a regressing clock instead of locking shut', () => {
    const allow = createFrameLimiter(20);
    allow(10_000);
    expect(allow(100)).toBe(true);
    expect(allow(110)).toBe(false);
    expect(allow(150)).toBe(true);
  });

  it('rejects a non-finite timestamp', () => {
    const allow = createFrameLimiter(20);
    expect(allow(Number.NaN)).toBe(false);
  });

  it('gives each loop its own clock', () => {
    const a = createFrameLimiter(20);
    const b = createFrameLimiter(20);
    a(1000);
    expect(b(1000)).toBe(true);
  });
});
