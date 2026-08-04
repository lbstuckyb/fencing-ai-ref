import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getHandDetector, getPoseDetector, LandmarkerError } from '../cv/landmarker';
import type { HandDetector } from '../cv/landmarker';
import { createFrameLimiter } from '../cv/loop';
import { drawSkeleton, SKELETON_COLORS, syncCanvasSize } from '../cv/skeleton';
import type { HandFrame, PoseFrame } from '../cv/types';

/**
 * Camera + pose detection surface, shared by every drill page.
 *
 * The camera does not start on mount. A page that opens a webcam the instant it
 * loads is hostile, and the app claims on the Home page that the camera is only
 * on while you are drilling — so starting is an explicit act, and stopping
 * genuinely releases the device.
 *
 * Failure handling is most of this component on purpose. A denied permission or
 * an absent camera is the *first* thing many users will hit, and an unhandled
 * rejection there looks identical to a broken app.
 */

type Phase = 'idle' | 'starting' | 'running' | 'error';

/** Everything that can go wrong, in terms that map to distinct user advice. */
type FailureKind =
  | 'insecure-context'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-busy'
  | 'camera-lost'
  | 'model-assets'
  | 'model-runtime'
  | 'unknown';

interface Failure {
  kind: FailureKind;
  title: string;
  detail: string;
  /** Whether retrying without changing anything could plausibly work. */
  retryable: boolean;
}

const FAILURES: Record<FailureKind, Omit<Failure, 'kind'>> = {
  'insecure-context': {
    title: 'The browser will not share a camera on this page',
    detail:
      'Camera access needs a secure context. Open the app over https, or on localhost during development.',
    retryable: false,
  },
  'permission-denied': {
    title: 'Camera permission was denied',
    detail:
      'Grant camera access for this site — usually the camera icon in the address bar — then start again. Nothing you record is uploaded; the video is processed in this tab and discarded.',
    retryable: true,
  },
  'no-camera': {
    title: 'No camera found',
    detail: 'Connect a webcam and start again. The drills need a live view of your upper body.',
    retryable: true,
  },
  'camera-busy': {
    title: 'The camera is in use',
    detail: 'Another application or browser tab is holding the camera. Close it, then start again.',
    retryable: true,
  },
  'camera-lost': {
    title: 'The camera stopped',
    detail: 'The video track ended — the device may have been unplugged or its permission revoked.',
    retryable: true,
  },
  'model-assets': {
    title: 'The pose model is missing',
    detail:
      'The MediaPipe model and runtime are vendored into public/ rather than fetched from a CDN. Run `npm run fetch-assets`, then start again.',
    retryable: true,
  },
  'model-runtime': {
    title: 'Pose detection failed to start',
    detail:
      'The pose landmarker could not initialise in this browser. A recent Chrome, Edge, Firefox or Safari is required.',
    retryable: true,
  },
  unknown: {
    title: 'The camera could not be started',
    detail: 'Something unexpected went wrong. The browser console has the details.',
    retryable: true,
  },
};

function classify(error: unknown): FailureKind {
  if (error instanceof LandmarkerError) {
    return error.kind === 'assets-missing' ? 'model-assets' : 'model-runtime';
  }
  if (error instanceof DOMException) {
    switch (error.name) {
      // Both spellings exist in the wild: the modern name and the legacy one.
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'permission-denied';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
      case 'OverconstrainedError':
        return 'no-camera';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'camera-busy';
      case 'SecurityError':
        return 'insecure-context';
    }
  }
  return 'unknown';
}

function toFailure(kind: FailureKind): Failure {
  return { kind, ...FAILURES[kind] };
}

export interface CameraStageProps {
  /**
   * Called once per detected frame. `null` frames are not reported — a page
   * that needs to know detection dropped out should track the timestamp.
   *
   * `hands` is `null` unless `needsHands` is set and the hand model is loaded;
   * an *empty* hand frame is a different thing, and means no hands were in shot.
   */
  onFrame?: (frame: PoseFrame, hands: HandFrame | null) => void;
  /**
   * Called with `true` when detection starts and `false` when it stops, for any
   * reason — the stop button, a failure, or navigating away.
   *
   * A page holding state that only means something while the camera is live —
   * a recording in progress, a drill mid-hold — needs the falling edge, or it
   * goes on displaying a session that ended.
   */
  onRunningChange?: (running: boolean) => void;
  /**
   * Run the hand landmarker as well, for the signals whose spec sets
   * `needsHands` — Halt, Point in line, Nothing. It is a second model and
   * roughly doubles the per-frame cost, so the other seven signals leave it off.
   * Safe to toggle mid-session: the model loads on demand and stays loaded.
   */
  needsHands?: boolean;
  /**
   * Absolutely-positioned content layered over the video — prompts, progress
   * rings. Drawn above the skeleton, inside the mirrored frame's box but *not*
   * mirrored itself, so text stays readable.
   */
  overlay?: ReactNode;
  /** Draw the tracked skeleton over the video. On by default. */
  showSkeleton?: boolean;
  /** Extra controls shown alongside the stop button while running. */
  children?: ReactNode;
}

export default function CameraStage({
  onFrame,
  onRunningChange,
  needsHands = false,
  overlay,
  showSkeleton = true,
  children,
}: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  /**
   * Bumped by every start and stop. An async start that is superseded — the user
   * pressed stop, or the component unmounted, while permission was pending —
   * checks this and releases the stream instead of attaching a dead one.
   */
  const runRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<Failure | null>(null);
  /**
   * Proof-of-life readout, recomputed once a second rather than per frame.
   * `fps` counts loop iterations and `detections` counts frames that produced a
   * pose — separating them is what distinguishes "the loop has died" from "the
   * loop is fine, nobody is in shot", which look identical on a single counter.
   */
  const [stats, setStats] = useState({ fps: 0, detections: 0, landmarks: 0, hands: 0 });
  /**
   * Set when a `needsHands` drill asked for finger detail and the model would
   * not load. Not a full failure: pose keeps running, so arm geometry still
   * grades and the user is told which part is missing rather than losing the
   * whole camera over it.
   */
  const [handsUnavailable, setHandsUnavailable] = useState(false);

  // Kept in refs so the detection loop never has to be torn down and rebuilt
  // when a parent re-renders with a fresh callback identity or toggles a flag.
  const onFrameRef = useRef(onFrame);
  const onRunningChangeRef = useRef(onRunningChange);
  const showSkeletonRef = useRef(showSkeleton);
  const needsHandsRef = useRef(needsHands);
  const handDetectorRef = useRef<HandDetector | null>(null);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onRunningChangeRef.current = onRunningChange;
    showSkeletonRef.current = showSkeleton;
    needsHandsRef.current = needsHands;
  }, [onFrame, onRunningChange, showSkeleton, needsHands]);

  // Both edges from one effect, so the falling one cannot be missed: whatever
  // ends the session — stop, failure, unmount — leaving `running` runs the
  // cleanup.
  useEffect(() => {
    if (phase !== 'running') return;
    onRunningChangeRef.current?.(true);
    return () => onRunningChangeRef.current?.(false);
  }, [phase]);

  const releaseStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    releaseStream();
    setPhase('idle');
    setFailure(null);
    setStats({ fps: 0, detections: 0, landmarks: 0, hands: 0 });
  }, [releaseStream]);

  const fail = useCallback(
    (kind: FailureKind) => {
      runRef.current += 1;
      releaseStream();
      setFailure(toFailure(kind));
      setPhase('error');
    },
    [releaseStream]
  );

  const start = useCallback(async () => {
    const run = (runRef.current += 1);
    const superseded = () => runRef.current !== run;

    setFailure(null);
    setHandsUnavailable(false);
    setPhase('starting');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Chrome and Firefox omit `mediaDevices` entirely on an insecure origin,
      // so this is the common shape of "http://192.168.x.x" rather than a
      // genuinely ancient browser.
      fail('insecure-context');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (error) {
      console.error('[camera] getUserMedia failed', error);
      if (!superseded()) fail(classify(error));
      return;
    }

    if (superseded()) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    let detector;
    try {
      detector = await getPoseDetector();
    } catch (error) {
      console.error('[camera] pose detector failed to load', error);
      stream.getTracks().forEach((track) => track.stop());
      if (!superseded()) fail(classify(error));
      return;
    }

    const video = videoRef.current;
    if (superseded() || !video) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    // Fires when the device is unplugged or permission is revoked mid-session;
    // without it the view freezes on the last frame with no explanation.
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (!superseded()) fail('camera-lost');
      });
    });

    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      console.error('[camera] video playback failed', error);
      if (!superseded()) fail('unknown');
      return;
    }
    if (superseded()) return;

    setPhase('running');

    // Detection loop. It runs per animation frame so the overlay stays in step
    // with the compositor, but inference itself is gated to ~20–24 fps — see
    // cv/loop.ts for why that is enough for a held signal.
    const allowDetection = createFrameLimiter();

    let attempts = 0;
    let detections = 0;
    let landmarks = 0;
    let hands = 0;
    let windowStart = performance.now();

    /**
     * Acquired lazily and cached: a page that never sees a pose never pays for
     * a 2D context, and jsdom — which has no canvas backend — is never asked
     * for one during component tests.
     */
    let ctx: CanvasRenderingContext2D | null | undefined;
    let painted = false;

    const paint = (frame: PoseFrame | null) => {
      const canvas = canvasRef.current;
      // Nothing drawn and nothing to draw: skip before touching the canvas.
      if (!canvas || (!frame && !painted)) return;

      ctx ??= canvas.getContext('2d');
      if (!ctx) return;

      const size = syncCanvasSize(canvas, window.devicePixelRatio);
      if (!size) return;

      const ratio = canvas.width / size.width;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      painted = frame
        ? drawSkeleton(ctx, frame.screen, {
            source: { width: video.videoWidth, height: video.videoHeight },
            dest: size,
            mirror: true,
          })
        : false;
    };

    const tick = () => {
      if (superseded()) return;
      rafRef.current = requestAnimationFrame(tick);

      const now = performance.now();
      if (!allowDetection(now)) return;
      attempts += 1;

      const frame = detector.detect(video, now);
      if (frame) {
        detections += 1;
        landmarks = frame.world.length;

        // Hands are gated on a pose: they cost a second inference, and their
        // sides are resolved against the pose's wrists, so a frame with nobody
        // in it has nothing to spend that on.
        const handDetector = handDetectorRef.current;
        const handFrame =
          needsHandsRef.current && handDetector ? handDetector.detect(video, now, frame) : null;
        hands = handFrame?.hands.length ?? 0;

        onFrameRef.current?.(frame, handFrame);
      }
      if (showSkeletonRef.current) paint(frame);

      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        const scale = 1000 / elapsed;
        setStats({
          fps: Math.round(attempts * scale),
          detections: Math.round(detections * scale),
          // Falls back to 0 when tracking is lost, so the readout cannot go on
          // reporting a stale 33 after the referee walks out of frame.
          landmarks: detections > 0 ? landmarks : 0,
          hands: detections > 0 ? hands : 0,
        });
        attempts = 0;
        detections = 0;
        windowStart = now;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [fail]);

  /**
   * Loads the hand model the first time a drill actually needs it.
   *
   * Deliberately not part of `start`: a practice session moves between signals,
   * and only three of the ten want finger detail. Loading here means the 7.8 MB
   * model is fetched when the first such signal comes up and never for a session
   * that skips them — while still being ready before the drill that asked for it
   * has produced a single gradeable frame.
   */
  useEffect(() => {
    if (!needsHands || phase !== 'running' || handDetectorRef.current) return;

    let cancelled = false;
    getHandDetector().then(
      (detector) => {
        if (!cancelled) handDetectorRef.current = detector;
      },
      (error) => {
        console.error('[camera] hand detector failed to load', error);
        if (!cancelled) setHandsUnavailable(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needsHands, phase]);

  // Unmount is the one path that must always release the device — navigating
  // away from a drill page has to turn the camera light off.
  useEffect(() => {
    return () => {
      runRef.current += 1;
      releaseStream();
    };
  }, [releaseStream]);

  const running = phase === 'running';

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-slate-800">
        <video
          ref={videoRef}
          playsInline
          muted
          // Mirrored because a referee practising in front of a screen expects a
          // mirror. Side is never inferred from screen position — see Side in
          // cv/types.ts — so this transform is purely cosmetic.
          className={`h-full w-full -scale-x-100 object-cover ${running ? '' : 'invisible'}`}
        />

        {running ? (
          <>
            {showSkeleton ? (
              // Sized by CSS and drawn in CSS pixels; the mirroring is done in
              // the projection rather than with a transform here, so anything
              // drawn on this layer later is not written backwards.
              <canvas
                ref={canvasRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0">{overlay}</div>
            <p className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white">
              {stats.fps} fps ·{' '}
              {stats.detections > 0
                ? `${stats.landmarks} landmarks @ ${stats.detections}/s`
                : 'no pose in frame'}
              {needsHands ? ` · ${stats.hands} hand${stats.hands === 1 ? '' : 's'}` : ''}
            </p>

            {handsUnavailable ? (
              <p
                role="status"
                className="absolute right-2 top-2 max-w-56 rounded bg-amber-900/80 px-2 py-1 text-xs text-amber-50"
              >
                Hand detail is unavailable — the hand model did not load. Arm geometry still grades;
                run <code>npm run fetch-assets</code>.
              </p>
            ) : null}
            {showSkeleton ? (
              // The mirror check, in the corner where it is cheap to glance at:
              // raise your right arm and the cyan limb must be the one that
              // moves. Sides are anatomical everywhere in this app, and a
              // silently inverted one would wreck every directional signal.
              <p className="absolute bottom-2 left-2 flex items-center gap-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SKELETON_COLORS.right }}
                  />
                  your right
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SKELETON_COLORS.left }}
                  />
                  your left
                </span>
              </p>
            ) : null}
          </>
        ) : null}

        {phase === 'idle' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-sm text-sm text-slate-300">
              The camera stays off until you start it, and every frame is processed in this tab.
              Nothing is uploaded or recorded.
            </p>
            <button
              type="button"
              onClick={start}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              Start camera
            </button>
          </div>
        ) : null}

        {phase === 'starting' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-slate-300">Starting camera and loading the pose model…</p>
            <p className="text-xs text-slate-400">
              The model is about 6 MB and is only loaded once per session.
            </p>
          </div>
        ) : null}

        {phase === 'error' && failure ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p className="font-medium text-white">{failure.title}</p>
            <p className="max-w-md text-sm text-slate-300">{failure.detail}</p>
            {failure.retryable ? (
              <button
                type="button"
                onClick={start}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {running ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={stop}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Stop camera
          </button>
          {children}
        </div>
      ) : null}
    </div>
  );
}
