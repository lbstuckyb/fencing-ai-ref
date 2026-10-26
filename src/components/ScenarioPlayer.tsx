import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import Hint from './Hint';

/**
 * The clip half of Mode 2: a phrase with the controls a referee actually wants
 * while calling it — replay, frame-step, slow-motion — none of which a bare
 * `<video>` gives you without reaching for `currentTime` and `playbackRate`
 * directly, so this wraps that up once rather than in the page.
 *
 * Deliberately dumb about the call itself. Before the referee has armed a call
 * the transport collapses to one button that reports the arm and plays nothing;
 * the page runs its get-ready countdown and then plays the clip through `ref`.
 * After that the full transport is live and every control acts on the video
 * directly, so a replay is just a replay — it never re-arms anything.
 *
 * Holds no per-scenario reset logic: a caller switching clips should mount a
 * fresh instance (`key={src}` or equivalent) rather than rely on this component
 * to notice the prop change, so `missing`/`slow` never have to be reconciled
 * against a clip they were not set by.
 */

/** Close enough to the placeholder clips' 25 fps to feel like a frame step on any clip. */
const FRAME_STEP_S = 1 / 25;
const SLOW_RATE = 0.35;

export interface ScenarioPlayerHandle {
  /**
   * Rolls the clip from the top; a no-op if the clip is missing. From the top
   * rather than from wherever it was left, because the page calls this when a
   * countdown reaches zero — and a retry must not resume the last attempt.
   */
  play: () => void;
}

interface ScenarioPlayerProps {
  src: string;
  /**
   * Whether the referee has armed a call. False shows only the arm button;
   * true shows the transport.
   */
  armed: boolean;
  /** The arm button was pressed. The page decides what happens next. */
  onArm: () => void;
  /**
   * Whether arming is possible yet. The page's countdown is driven by camera
   * frames, so it passes `false` while the camera is starting or failed — a
   * countdown with no clock behind it would sit at five forever.
   */
  canArm?: boolean;
  /**
   * Fires once playback reaches the end naturally — not on a manual pause.
   * Only a hint for the page: nothing about the call depends on it.
   */
  onEnded?: () => void;
  /** Absolutely-positioned content layered over the clip. */
  overlay?: ReactNode;
  /** Extra controls at the end of the transport row, once armed. */
  children?: ReactNode;
  ref?: Ref<ScenarioPlayerHandle>;
}

export default function ScenarioPlayer({
  src,
  armed,
  onArm,
  canArm = true,
  onEnded,
  overlay,
  children,
  ref,
}: ScenarioPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [missing, setMissing] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = slow ? SLOW_RATE : 1;
  }, [slow]);

  const step = useCallback((deltaS: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaS));
  }, []);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play();
  }, []);

  useImperativeHandle(ref, () => ({ play: replay }), [replay]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void video.play();
    else video.pause();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {missing ? (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center gap-3 p-6 text-center"
          >
            <p className="display text-3xl text-mute">Clip unavailable</p>
            <Hint placement="above">
              Placeholder clips are generated, not committed. Run{' '}
              <code>npm run make-scenarios</code> (needs ffmpeg), or drop a clip at{' '}
              <code>public{src}</code>. You can still make and grade the call.
            </Hint>
          </div>
        ) : (
          <video
            ref={videoRef}
            key={src}
            src={`${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`}
            playsInline
            muted
            className="h-full w-full object-contain"
            onPlay={() => {
              setPlaying(true);
              setEnded(false);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setEnded(true);
              onEnded?.();
            }}
            onError={() => setMissing(true)}
          />
        )}
        <div className="pointer-events-none absolute inset-0">{overlay}</div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        {armed ? (
          <>
            <button type="button" onClick={togglePlay} disabled={missing} className="btn">
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={replay} disabled={missing} className="btn">
              Replay
            </button>
            <button
              type="button"
              onClick={() => step(-FRAME_STEP_S)}
              disabled={missing}
              className="btn"
              aria-label="Step back one frame"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => step(FRAME_STEP_S)}
              disabled={missing}
              className="btn"
              aria-label="Step forward one frame"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setSlow((value) => !value)}
              disabled={missing}
              aria-pressed={slow}
              aria-label="Slow motion"
              className="btn"
            >
              Slow
            </button>
            {ended ? <span className="caption">Clip ended · still capturing</span> : null}
            {children}
          </>
        ) : (
          <>
            <button type="button" onClick={onArm} disabled={!canArm} className="btn btn-go">
              {missing ? 'Get ready to call' : 'Play the phrase'}
            </button>
            {canArm ? null : <span className="caption">Waiting for camera</span>}
          </>
        )}
      </div>
    </div>
  );
}
