/**
 * MediaPipe pose detection: lazy singleton + per-frame detect.
 *
 * The landmarker is expensive to build (WASM runtime + a 5.8 MB model) and
 * cheap to keep, so exactly one is created per session and shared by every page
 * that needs it. Consumers never close it — they just stop calling `detect`.
 * Releasing the *camera* is the caller's job; releasing the model is not.
 *
 * Everything is served from `public/`, vendored by `scripts/fetch-assets.mjs`.
 * Nothing here touches the network at runtime, which is what lets the privacy
 * claim on the Home page be literally true.
 */

import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseFrame } from './types';

/** Vendored asset locations, relative to the deployed base path. */
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const POSE_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

/**
 * Why loading failed, in terms the UI can act on. `assets-missing` is by far the
 * most likely during development and has a one-command fix, so it is worth
 * distinguishing from a genuine runtime failure.
 */
export type LandmarkerErrorKind = 'assets-missing' | 'runtime';

export class LandmarkerError extends Error {
  readonly kind: LandmarkerErrorKind;

  constructor(kind: LandmarkerErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LandmarkerError';
    this.kind = kind;
  }
}

/* -------------------------------------------------------------------------- */
/* Timestamp guard                                                            */
/* -------------------------------------------------------------------------- */

/**
 * MediaPipe's VIDEO running mode requires strictly increasing timestamps and
 * throws on a duplicate or a regressing one. That is easy to hit by accident:
 * an rAF loop can fire twice within the same millisecond, and a page that is
 * backgrounded and restored can hand back a stale clock.
 *
 * The guard returns `null` for any frame that must be skipped. Skipping — as
 * opposed to nudging the timestamp forward — is the honest choice: a repeated
 * timestamp means the camera has not produced a new frame, so there is nothing
 * new to detect anyway.
 *
 * Exported as a factory so it can be unit tested without a WASM runtime.
 */
export function createTimestampGuard(): (tsMs: number) => number | null {
  let last = Number.NEGATIVE_INFINITY;
  return (tsMs: number) => {
    if (!Number.isFinite(tsMs) || tsMs <= last) return null;
    last = tsMs;
    return tsMs;
  };
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Confirms the model file is actually there before handing the URL to the WASM
 * runtime, which reports a missing model as an opaque abort.
 *
 * The content-type check is the important half: a dev server's SPA fallback
 * answers an unknown path with `index.html` and a cheerful 200, so "the request
 * succeeded" is not evidence that a model came back.
 */
async function assertModelReachable(url: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'HEAD' });
  } catch (cause) {
    throw new LandmarkerError('assets-missing', `Could not reach the pose model at ${url}.`, {
      cause,
    });
  }

  const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false;
  if (!response.ok || isHtml) {
    throw new LandmarkerError(
      'assets-missing',
      `The pose model is not present at ${url}. Run \`npm run fetch-assets\` to vendor it.`
    );
  }
}

async function createLandmarker(): Promise<PoseLandmarker> {
  await assertModelReachable(POSE_MODEL_URL);

  // Imported dynamically so the ~150 kB vision bundle is fetched only by pages
  // that actually open a camera — Home and Reference should not pay for it.
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');

  let fileset;
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  } catch (cause) {
    throw new LandmarkerError(
      'assets-missing',
      `Could not load the MediaPipe runtime from ${WASM_BASE}. Run \`npm run fetch-assets\`.`,
      { cause }
    );
  }

  const options = {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
  };

  try {
    return await PoseLandmarker.createFromOptions(fileset, options);
  } catch (gpuError) {
    // The GPU delegate is unavailable on plenty of real machines — headless
    // browsers, blocklisted drivers, some Linux/Wayland setups. CPU is slower
    // but correct, and a working slow drill beats a broken fast one.
    console.warn('[cv] GPU delegate unavailable, falling back to CPU.', gpuError);
    try {
      return await PoseLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    } catch (cause) {
      throw new LandmarkerError('runtime', 'The pose landmarker failed to initialise.', { cause });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Detector singleton                                                         */
/* -------------------------------------------------------------------------- */

export interface PoseDetector {
  /**
   * Runs detection on the current video frame.
   *
   * Returns `null` — rather than throwing — when there is nothing to report:
   * the video has no frame ready, the timestamp did not advance, or no pose is
   * in shot. Callers redraw on `null` without special-casing it.
   */
  detect(video: HTMLVideoElement, tsMs: number): PoseFrame | null;
}

function wrap(landmarker: PoseLandmarker): PoseDetector {
  const nextTimestamp = createTimestampGuard();

  return {
    detect(video, tsMs) {
      // HAVE_CURRENT_DATA. Detecting against a video with no decoded frame
      // yields garbage at best, and the element is briefly in this state every
      // time the stream is attached.
      if (video.readyState < 2) return null;

      const timestampMs = nextTimestamp(tsMs);
      if (timestampMs === null) return null;

      const result = landmarker.detectForVideo(video, timestampMs);
      const screen = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (!screen || !world) return null;

      return { screen, world, timestampMs };
    },
  };
}

/**
 * In-flight or settled load. Cached as the *promise* so that concurrent callers
 * share one initialisation instead of racing to build two landmarkers.
 */
let pending: Promise<PoseDetector> | null = null;
let instance: PoseLandmarker | null = null;

/** Loads the shared pose detector, building it on first call. */
export function getPoseDetector(): Promise<PoseDetector> {
  pending ??= createLandmarker().then(
    (landmarker) => {
      instance = landmarker;
      return wrap(landmarker);
    },
    (error) => {
      // Drop the rejected promise so a retry — the button on the error state —
      // gets a fresh attempt rather than the cached failure forever.
      pending = null;
      throw error;
    }
  );
  return pending;
}

/** True once the detector is built — lets the UI skip a "loading" flash. */
export function isPoseDetectorReady(): boolean {
  return instance !== null;
}

/** Releases the landmarker. For test teardown and HMR disposal, not for pages. */
export function resetPoseDetector(): void {
  instance?.close();
  instance = null;
  pending = null;
}

if (import.meta.hot) {
  // Without this, every hot update leaks a WASM instance and its GPU context.
  import.meta.hot.dispose(() => resetPoseDetector());
}
