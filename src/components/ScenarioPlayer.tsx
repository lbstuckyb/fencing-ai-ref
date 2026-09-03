import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The watch half of Mode 2: a clip with the controls a referee actually wants
 * before calling it — replay, frame-step, slow-motion — none of which a bare
 * `<video>` gives you without reaching for `currentTime` and `playbackRate`
 * directly, so this wraps that up once rather than in the page.
 *
 * Deliberately dumb about *when* the call phase starts: `onEnded` fires when
 * playback reaches the end, and the page decides what that means. A referee
 * who wants one more look before calling it just presses replay.
 *
 * Holds no per-scenario reset logic: a caller switching clips should mount a
 * fresh instance (`key={src}` or equivalent) rather than rely on this component
 * to notice the prop change, so `missing`/`slow` never have to be reconciled
 * against a clip they were not set by.
 */

/** Close enough to the placeholder clips' 25 fps to feel like a frame step on any clip. */
const FRAME_STEP_S = 1 / 25;
const SLOW_RATE = 0.35;

interface ScenarioPlayerProps {
  src: string;
  /** Fires once playback reaches the end naturally — not on a manual pause. */
  onEnded: () => void;
}

export default function ScenarioPlayer({ src, onEnded }: ScenarioPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [missing, setMissing] = useState(false);

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

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void video.play();
    else video.pause();
  }, []);

  const BUTTON =
    'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-slate-800">
        {missing ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
          >
            <p className="font-medium text-white">This clip isn’t available locally</p>
            <p className="max-w-md text-sm text-slate-300">
              Placeholder scenario clips are generated, not committed. Run{' '}
              <code className="rounded bg-white/10 px-1 py-0.5">npm run make-scenarios</code> (needs
              ffmpeg on <code className="rounded bg-white/10 px-1 py-0.5">PATH</code>), or drop a
              real clip at <code className="rounded bg-white/10 px-1 py-0.5">public{src}</code>.
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            key={src}
            src={src}
            playsInline
            muted
            className="h-full w-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              onEnded();
            }}
            onError={() => setMissing(true)}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={togglePlay} disabled={missing} className={BUTTON}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={replay} disabled={missing} className={BUTTON}>
          Replay
        </button>
        <button
          type="button"
          onClick={() => step(-FRAME_STEP_S)}
          disabled={missing}
          className={BUTTON}
          aria-label="Step back one frame"
        >
          ◀ Frame
        </button>
        <button
          type="button"
          onClick={() => step(FRAME_STEP_S)}
          disabled={missing}
          className={BUTTON}
          aria-label="Step forward one frame"
        >
          Frame ▶
        </button>
        <button
          type="button"
          onClick={() => setSlow((value) => !value)}
          disabled={missing}
          aria-pressed={slow}
          className={`${BUTTON} ${slow ? 'border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40' : ''}`}
        >
          {slow ? 'Slow motion: on' : 'Slow motion: off'}
        </button>
      </div>
    </div>
  );
}
