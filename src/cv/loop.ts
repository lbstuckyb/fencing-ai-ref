/**
 * Detection loop pacing.
 *
 * `requestAnimationFrame` fires at the display's refresh rate — 60 Hz, often
 * 120 Hz on a laptop bought in the last few years. Running pose inference on
 * every one of those is wasted work: the model costs 10–20 ms per frame, a
 * fencing signal is a *held* pose by rule t.63, and the hold machine needs only
 * enough samples to confirm 900 ms of stillness. Burning a whole core to
 * resample a stationary arm 120 times a second makes the fan loud and the rest
 * of the page janky.
 *
 * So the loop still runs per animation frame — that is what keeps the overlay
 * in step with the compositor — but detection is gated to ~20–24 fps.
 */

/**
 * Detection rate. On a 60 Hz display the gate lands on every third frame for an
 * effective 20 fps; on 120 Hz, every sixth. Both sit inside the intended band,
 * and aliasing to a slightly lower rate is preferable to the alternative of
 * nudging the threshold until it occasionally admits two frames in a row.
 */
export const DETECTION_FPS = 22;

/**
 * Returns a gate: `true` when enough time has passed to run detection again.
 *
 * The last accepted time is stored as-is rather than advanced by a fixed step,
 * so a stall — a backgrounded tab, a slow first inference — resumes cleanly
 * instead of firing a burst of catch-up frames the moment it returns.
 */
export function createFrameLimiter(targetFps = DETECTION_FPS): (nowMs: number) => boolean {
  const minIntervalMs = 1000 / targetFps;
  let last = Number.NEGATIVE_INFINITY;

  return (nowMs: number) => {
    if (!Number.isFinite(nowMs)) return false;
    // A regressing clock would otherwise lock the gate shut until real time
    // caught up with the stale reading.
    if (nowMs < last) {
      last = nowMs;
      return true;
    }
    if (nowMs - last < minIntervalMs) return false;
    last = nowMs;
    return true;
  };
}
