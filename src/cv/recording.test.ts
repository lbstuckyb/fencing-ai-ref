import { describe, expect, it } from 'vitest';
import { MAX_SAMPLES, createRecorder, summarize } from './recording';

describe('summarize', () => {
  it('has nothing to report for no samples', () => {
    expect(summarize([])).toBeNull();
  });

  it('reports the spread of a single sample as itself', () => {
    expect(summarize([12.5])).toEqual({ count: 1, min: 12.5, median: 12.5, max: 12.5 });
  });

  it('takes the middle value of an odd count', () => {
    expect(summarize([5, 1, 3])).toEqual({ count: 3, min: 1, median: 3, max: 5 });
  });

  it('averages the two middle values of an even count', () => {
    expect(summarize([1, 2, 4, 5])).toEqual({ count: 4, min: 1, median: 3, max: 5 });
  });

  it('is not dragged by an outlier the way a mean would be', () => {
    // The case this exists for: pose estimation drops the occasional badly wrong
    // frame — a wrist snapped across the body — and one of those moves a mean by
    // more than the tolerance being tuned. The median holds; min and max show
    // the outlier rather than hiding it.
    const held = [88, 89, 90, 91, 92];
    const withGlitch = [...held, 5];
    expect(summarize(withGlitch)?.median).toBeCloseTo(89.5, 6);
    expect(summarize(withGlitch)?.min).toBe(5);
    expect(summarize(withGlitch)?.max).toBe(92);
  });

  it('does not modify the samples it was given', () => {
    const samples = [3, 1, 2];
    summarize(samples);
    expect(samples).toEqual([3, 1, 2]);
  });
});

describe('createRecorder', () => {
  it('summarises each measurement independently', () => {
    const recorder = createRecorder();
    recorder.push({ 'elbow.R': 170, 'wrist.height.R': 1.1 }, 0);
    recorder.push({ 'elbow.R': 174, 'wrist.height.R': 1.0 }, 50);
    recorder.push({ 'elbow.R': 178, 'wrist.height.R': 1.2 }, 100);

    const recording = recorder.finish();
    expect(recording.frames).toBe(3);
    expect(recording.durationMs).toBe(100);
    expect(recording.stats['elbow.R']).toEqual({ count: 3, min: 170, median: 174, max: 178 });
    expect(recording.stats['wrist.height.R']?.median).toBeCloseTo(1.1, 6);
  });

  it('skips frames in which a measurement was unavailable', () => {
    // Tracking drops out mid-hold, or a hand leaves the frame. Those frames must
    // not count toward the sample, and must not poison the summary either.
    const recorder = createRecorder();
    recorder.push({ 'elbow.R': 170, 'hand.index.R': null }, 0);
    recorder.push({ 'elbow.R': null, 'hand.index.R': 1.3 }, 50);
    recorder.push({ 'elbow.R': Number.NaN, 'hand.index.R': 1.4 }, 100);

    const { stats, frames } = recorder.finish();
    expect(frames).toBe(3);
    expect(stats['elbow.R']).toEqual({ count: 1, min: 170, median: 170, max: 170 });
    expect(stats['hand.index.R']?.count).toBe(2);
  });

  it('reports a measurement that was never readable rather than dropping it', () => {
    const recorder = createRecorder();
    recorder.push({ 'hand.index.R': null }, 0);

    const { stats } = recorder.finish();
    // The id is present with a null summary: "you recorded, and this never
    // resolved" is a finding — usually that the hand model was not running.
    expect(Object.keys(stats)).toEqual(['hand.index.R']);
    expect(stats['hand.index.R']).toBeNull();
  });

  it('tracks frames and elapsed time as it goes', () => {
    const recorder = createRecorder();
    expect(recorder.frames).toBe(0);
    expect(recorder.elapsedMs).toBe(0);

    // Timestamps come from the detection loop, so they start wherever that
    // session's clock happens to be rather than at zero.
    recorder.push({ 'elbow.R': 1 }, 8000);
    expect(recorder.elapsedMs).toBe(0);
    recorder.push({ 'elbow.R': 1 }, 9200);
    expect(recorder.frames).toBe(2);
    expect(recorder.elapsedMs).toBe(1200);
  });

  it('summarises without stopping the recording', () => {
    const recorder = createRecorder();
    recorder.push({ 'elbow.R': 100 }, 0);
    expect(recorder.finish().stats['elbow.R']?.max).toBe(100);

    recorder.push({ 'elbow.R': 200 }, 50);
    expect(recorder.finish().stats['elbow.R']?.max).toBe(200);
  });

  it('bounds the samples it keeps', () => {
    const recorder = createRecorder();
    for (let i = 0; i < MAX_SAMPLES + 100; i += 1) recorder.push({ 'elbow.R': 90 }, i * 45);

    const { stats, frames } = recorder.finish();
    expect(frames).toBe(MAX_SAMPLES + 100);
    expect(stats['elbow.R']?.count).toBe(MAX_SAMPLES);
  });
});
