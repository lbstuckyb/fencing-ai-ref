/**
 * Capture a few seconds of measurements and reduce them to min / median / max.
 *
 * A live readout tells you what a pose measures *now*, which is exactly the
 * wrong thing to write into a spec: hold a signal still and the numbers still
 * wander by several degrees as the model re-fits each frame. A threshold set
 * from one glance at a jittering number is set from noise.
 *
 * So the calibration page records a hold and reports the spread. **Median, not
 * mean**: pose estimation drops the occasional badly wrong frame — a wrist
 * snapped to the wrong side of the body, an arm briefly folded — and one such
 * outlier moves a mean by more than the tolerance being tuned. The min and max
 * are kept precisely because they show that outlier rather than hiding it, and
 * because the width between them is what tells you how loose a band has to be.
 *
 * Nothing here knows what a measurement means. It reduces `Record<id, number>`,
 * so a quantity added to `measurements.ts` is summarised without changing a line.
 */

export interface Summary {
  /** Frames in which this measurement had a usable value. */
  count: number;
  min: number;
  median: number;
  max: number;
}

/**
 * Cap on samples kept per measurement — about two minutes at detection rate.
 *
 * A recording is meant to be a few seconds, so this is never reached in normal
 * use. It exists so that a page left recording all afternoon leaks nothing worse
 * than a bounded array.
 */
export const MAX_SAMPLES = 2500;

/** Reduces one measurement's samples; `null` when there were none. */
export function summarize(samples: readonly number[]): Summary | null {
  if (samples.length === 0) return null;

  const sorted = [...samples].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  return { count: sorted.length, min: sorted[0], median, max: sorted[sorted.length - 1] };
}

export interface Recording {
  /** Frames pushed, including any in which nothing was measurable. */
  frames: number;
  /** First to last frame timestamp, in ms. */
  durationMs: number;
  /** One entry per id seen, `null` for ids that never had a usable value. */
  stats: Record<string, Summary | null>;
}

export interface Recorder {
  /** Adds one frame of measurements. Null and non-finite values are skipped. */
  push(values: Record<string, number | null>, timestampMs: number): void;
  /** Frames pushed so far. */
  readonly frames: number;
  /** Span covered so far, in ms — 0 until a second frame arrives. */
  readonly elapsedMs: number;
  /** The summary as it currently stands. Does not stop or clear anything. */
  finish(): Recording;
}

export function createRecorder(): Recorder {
  const samples = new Map<string, number[]>();
  let frames = 0;
  let firstMs: number | null = null;
  let lastMs = 0;

  return {
    push(values, timestampMs) {
      frames += 1;
      // Timestamps come from the detection loop and are monotonic within a
      // session, so first-to-last is the true span even if frames were dropped.
      firstMs ??= timestampMs;
      lastMs = timestampMs;

      for (const id of Object.keys(values)) {
        const value = values[id];
        if (value === null || !Number.isFinite(value)) {
          // Still register the id, so a measurement that was never readable is
          // reported as "no samples" rather than vanishing from the summary.
          if (!samples.has(id)) samples.set(id, []);
          continue;
        }
        const list = samples.get(id);
        if (!list) {
          samples.set(id, [value]);
        } else if (list.length < MAX_SAMPLES) {
          list.push(value);
        }
      }
    },

    get frames() {
      return frames;
    },

    get elapsedMs() {
      return firstMs === null ? 0 : lastMs - firstMs;
    },

    finish() {
      const stats: Record<string, Summary | null> = {};
      for (const [id, list] of samples) stats[id] = summarize(list);
      return { frames, durationMs: firstMs === null ? 0 : lastMs - firstMs, stats };
    },
  };
}
