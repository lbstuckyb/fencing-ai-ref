import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import Hint from './Hint';
import { t } from '../i18n';

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
            <p className="display text-3xl text-mute">{t('player.unavailable')}</p>
            <Hint placement="above">
              {t('player.unavailableHint1')} <code>npm run make-scenarios</code>{' '}
              {t('player.unavailableHint2')} <code>public{src}</code>
              {t('player.unavailableHint3')}
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
              {playing ? t('player.pause') : t('player.play')}
            </button>
            <button type="button" onClick={replay} disabled={missing} className="btn">
              {t('player.replay')}
            </button>
            <button
              type="button"
              onClick={() => step(-FRAME_STEP_S)}
              disabled={missing}
              className="btn"
              aria-label={t('player.stepBack')}
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => step(FRAME_STEP_S)}
              disabled={missing}
              className="btn"
              aria-label={t('player.stepForward')}
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setSlow((value) => !value)}
              disabled={missing}
              aria-pressed={slow}
              aria-label={t('player.slowMotion')}
              className="btn"
            >
              {t('player.slow')}
            </button>
            {ended ? <span className="caption">{t('player.ended')}</span> : null}
            {children}
          </>
        ) : (
          <>
            <button type="button" onClick={onArm} disabled={!canArm} className="btn btn-go">
              {missing ? t('player.getReady') : t('player.playPhrase')}
            </button>
            {canArm ? null : <span className="caption">{t('player.waiting')}</span>}
          </>
        )}
      </div>
    </div>
  );
}
