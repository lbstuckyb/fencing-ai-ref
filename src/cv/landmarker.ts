/**
 * MediaPipe detection: lazy singletons + per-frame detect.
 *
 * A landmarker is expensive to build (WASM runtime plus a multi-megabyte model)
 * and cheap to keep, so exactly one of each is created per session and shared by
 * every page that needs it. Consumers never close them — they just stop calling
 * `detect`. Releasing the *camera* is the caller's job; releasing a model is not.
 *
 * Pose and hands are separate singletons rather than one bundle because they are
 * needed at different times. Pose runs on every frame of every drill; hands run
 * only while the active signal spec sets `needsHands` — Halt, Point in line and
 * Nothing — because the second model roughly doubles the per-frame cost and the
 * other seven signals are decided entirely by arm geometry. Loading it lazily
 * also keeps 7.8 MB off the wire for a session that never drills those three.
 *
 * Everything is served from `public/`, vendored by `scripts/fetch-assets.mjs`.
 * Nothing here touches the network at runtime, which is what lets the privacy
 * claim on the Home page be literally true.
 */

import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { resolveHandSides } from './hands';
import type { HandFrame, PoseFrame } from './types';
import type { RawHand } from './hands';

/** Vendored asset locations, relative to the deployed base path. */
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const POSE_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;
const HAND_MODEL_URL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;

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
async function assertModelReachable(url: string, label: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'HEAD' });
  } catch (cause) {
    throw new LandmarkerError('assets-missing', `Could not reach the ${label} model at ${url}.`, {
      cause,
    });
  }

  const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false;
  if (!response.ok || isHtml) {
    throw new LandmarkerError(
      'assets-missing',
      `The ${label} model is not present at ${url}. Run \`npm run fetch-assets\` to vendor it.`
    );
  }
}

async function loadFileset() {
  // Imported dynamically so the ~150 kB vision bundle is fetched only by pages
  // that actually open a camera — Home and Reference should not pay for it.
  const { FilesetResolver } = await import('@mediapipe/tasks-vision');
  try {
    return await FilesetResolver.forVisionTasks(WASM_BASE);
  } catch (cause) {
    throw new LandmarkerError(
      'assets-missing',
      `Could not load the MediaPipe runtime from ${WASM_BASE}. Run \`npm run fetch-assets\`.`,
      { cause }
    );
  }
}

/**
 * Builds a task on the GPU delegate, retrying on CPU if that fails.
 *
 * The GPU delegate is unavailable on plenty of real machines — headless
 * browsers, blocklisted drivers, some Linux/Wayland setups. CPU is slower but
 * correct, and a working slow drill beats a broken fast one.
 */
async function withDelegateFallback<T>(
  label: string,
  create: (delegate: 'GPU' | 'CPU') => Promise<T>
): Promise<T> {
  try {
    return await create('GPU');
  } catch (gpuError) {
    console.warn(
      `[cv] GPU delegate unavailable for the ${label} model, falling back to CPU.`,
      gpuError
    );
    try {
      return await create('CPU');
    } catch (cause) {
      throw new LandmarkerError('runtime', `The ${label} landmarker failed to initialise.`, {
        cause,
      });
    }
  }
}

async function createPoseLandmarker(): Promise<PoseLandmarker> {
  await assertModelReachable(POSE_MODEL_URL, 'pose');
  const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await loadFileset();

  return withDelegateFallback('pose', (delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })
  );
}

async function createHandLandmarker(): Promise<HandLandmarker> {
  await assertModelReachable(HAND_MODEL_URL, 'hand');
  const { HandLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await loadFileset();

  return withDelegateFallback('hand', (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      // Both hands: the two-armed signals need each one classified separately,
      // and a referee's idle hand being in shot is not an error to design around.
      numHands: 2,
    })
  );
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

export interface HandDetector {
  /**
   * Runs hand detection on the current video frame.
   *
   * `pose` is the same frame's pose result, used to decide which detected hand
   * is which — see `resolveHandSides`. Pass `null` if there is none; the sides
   * then fall back to MediaPipe's handedness label, which is less trustworthy.
   */
  detect(video: HTMLVideoElement, tsMs: number, pose: PoseFrame | null): HandFrame | null;
}

function wrapPose(landmarker: PoseLandmarker): PoseDetector {
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

function wrapHands(landmarker: HandLandmarker): HandDetector {
  // Its own guard: the two models are stepped independently — hands only on the
  // frames a spec asks for them — so they do not share a timestamp sequence.
  const nextTimestamp = createTimestampGuard();

  return {
    detect(video, tsMs, pose) {
      if (video.readyState < 2) return null;

      const timestampMs = nextTimestamp(tsMs);
      if (timestampMs === null) return null;

      const result = landmarker.detectForVideo(video, timestampMs);

      const raw: RawHand[] = [];
      result.landmarks.forEach((screen, index) => {
        const world = result.worldLandmarks[index];
        const category = result.handedness[index]?.[0];
        if (!screen || !world) return;
        raw.push({
          screen,
          world,
          handedness: category?.categoryName ?? '',
          score: category?.score ?? 0,
        });
      });

      // An empty frame is still a frame: "no hands in shot" is information a
      // `needsHands` spec must act on, and is not the same as "not detected yet".
      return { hands: resolveHandSides(raw, pose), timestampMs };
    },
  };
}

/**
 * In-flight or settled loads. Cached as the *promise* so that concurrent callers
 * share one initialisation instead of racing to build two landmarkers.
 */
let posePending: Promise<PoseDetector> | null = null;
let poseInstance: PoseLandmarker | null = null;
let handPending: Promise<HandDetector> | null = null;
let handInstance: HandLandmarker | null = null;

/** Loads the shared pose detector, building it on first call. */
export function getPoseDetector(): Promise<PoseDetector> {
  posePending ??= createPoseLandmarker().then(
    (landmarker) => {
      poseInstance = landmarker;
      return wrapPose(landmarker);
    },
    (error) => {
      // Drop the rejected promise so a retry — the button on the error state —
      // gets a fresh attempt rather than the cached failure forever.
      posePending = null;
      throw error;
    }
  );
  return posePending;
}

/**
 * Loads the shared hand detector, building it on first call.
 *
 * Only call this for a spec that sets `needsHands`. It is a second 7.8 MB model
 * and a second inference per frame.
 */
export function getHandDetector(): Promise<HandDetector> {
  handPending ??= createHandLandmarker().then(
    (landmarker) => {
      handInstance = landmarker;
      return wrapHands(landmarker);
    },
    (error) => {
      handPending = null;
      throw error;
    }
  );
  return handPending;
}

/** True once the detector is built — lets the UI skip a "loading" flash. */
export function isPoseDetectorReady(): boolean {
  return poseInstance !== null;
}

export function isHandDetectorReady(): boolean {
  return handInstance !== null;
}

/** Releases the landmarkers. For test teardown and HMR disposal, not for pages. */
export function resetPoseDetector(): void {
  poseInstance?.close();
  poseInstance = null;
  posePending = null;
}

export function resetHandDetector(): void {
  handInstance?.close();
  handInstance = null;
  handPending = null;
}

export function resetDetectors(): void {
  resetPoseDetector();
  resetHandDetector();
}

if (import.meta.hot) {
  // Without this, every hot update leaks a WASM instance and its GPU context.
  import.meta.hot.dispose(() => resetDetectors());
}
