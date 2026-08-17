import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CameraStage from '../components/CameraStage';
import Feedback from '../components/Feedback';
import HoldRing from '../components/HoldRing';
import PageHeader from '../components/PageHeader';
import SignalCard from '../components/SignalCard';
import { SIGNAL_ARTICLE } from '../data/rules';
import { measure } from '../cv/measurements';
import type { HandFrame, PoseFrame } from '../cv/types';
import {
  advanceDrill,
  chooseSignal,
  createDrill,
  nextSignal,
  stopDrill,
  wrongArm,
} from '../signals/drill';
import type { DrillState } from '../signals/drill';
import { getCalibratedSpec, getCalibratedSpecs } from '../signals/calibration';
import type { SignalSpec } from '../signals/evaluator';

/**
 * Mode 1 — the signal practice drill, and the app's first shippable half.
 *
 * The page holds no drill logic. Every decision about what counts as a signal,
 * how long it has to be held and what the referee should be told lives in
 * `signals/drill.ts`, which is a pure reducer over `(state, measurements,
 * nowMs)`; this file supplies frames, renders the state and owns two things that
 * genuinely belong to a page — the URL, and what happens when the camera stops.
 *
 * ## The deep link
 *
 * `?signal=halt` opens the drill pinned to one signal. Stage 14's reference
 * library links in this way — "practice this one" — and the parameter is kept in
 * step with the picker so the page can be linked to, reloaded or shared without
 * losing what it was showing.
 */

/** Query parameter carrying the pinned signal — the reference page's link in. */
const SIGNAL_PARAM = 'signal';

function initialDrill(id: string | null, pool: readonly SignalSpec[]): DrillState {
  const spec = id ? getCalibratedSpec(id) : undefined;
  const drill = createDrill({ pool });
  return spec ? chooseSignal(drill, spec) : drill;
}

export default function PracticeSignals() {
  const [params, setParams] = useSearchParams();

  // Computed once per mount: a recording saved on `/calibrate-signals` takes
  // effect on the next visit here, not live underneath a running drill.
  const calibratedSpecs = useMemo(() => getCalibratedSpecs(), []);

  const [drill, setDrill] = useState<DrillState>(() =>
    initialDrill(params.get(SIGNAL_PARAM), calibratedSpecs)
  );
  /**
   * The same drill, mirrored into a ref. `onFrame` is called from the detection
   * loop, which holds the callback identity it was given when the camera
   * started, so it cannot close over the latest state — and re-creating it per
   * frame would tear the loop down twenty times a second. Every write goes
   * through `apply`, so the two cannot drift.
   */
  const drillRef = useRef(drill);
  /**
   * Tracked separately from the drill: a running camera that has not yet seen a
   * body produces no frames at all, and "stand where I can see you" is a
   * different message from "start the camera".
   */
  const [cameraOn, setCameraOn] = useState(false);

  const apply = useCallback((next: DrillState) => {
    drillRef.current = next;
    setDrill(next);
  }, []);

  const onFrame = useCallback(
    (frame: PoseFrame, hands: HandFrame | null) => {
      // `frame.timestampMs` is the same monotonic clock the loop feeds MediaPipe,
      // so the hold machine measures against the times detection actually ran at
      // rather than against when React got round to re-rendering.
      apply(
        advanceDrill(drillRef.current, measure(frame.world, hands), frame.timestampMs, {
          pool: calibratedSpecs,
        })
      );
    },
    [apply, calibratedSpecs]
  );

  /**
   * The camera stopping ends the session, and a hold in progress dies with it.
   * The score survives — it is the user's — but crediting a signal because the
   * camera was switched off mid-gesture would be scoring the button press.
   */
  const onRunningChange = useCallback(
    (running: boolean) => {
      setCameraOn(running);
      if (!running) apply(stopDrill(drillRef.current));
    },
    [apply]
  );

  const choose = useCallback(
    (spec: SignalSpec) => {
      apply(chooseSignal(drillRef.current, spec));
      setParams({ [SIGNAL_PARAM]: spec.id }, { replace: true });
    },
    [apply, setParams]
  );

  const skip = useCallback(() => {
    apply(nextSignal(drillRef.current, { pool: calibratedSpecs }));
    // Back to random prompts, so the URL must stop pinning one.
    setParams({}, { replace: true });
  }, [apply, setParams, calibratedSpecs]);

  const { prompt, evaluation, attempt, hold } = drill;

  // Re-rendered every detected frame, so the ten-card picker is kept out of it.
  const picker = useMemo(
    () =>
      calibratedSpecs.map((spec) => (
        <li key={spec.id}>
          <SignalCard spec={spec} selected={spec === prompt.spec} onSelect={choose} />
        </li>
      )),
    [calibratedSpecs, prompt.spec, choose]
  );

  const overlay = (
    <>
      {/*
        Read from further away than anything else in the app — the referee is
        standing back from the monitor with their arms up. The prompt is sized
        for that distance, and the reference prose elsewhere on the page is not.
      */}
      <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/60 px-5 py-3 text-center text-white">
        <p className="text-xs uppercase tracking-wide text-white/70 sm:text-sm">Make this signal</p>
        <p className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
          {prompt.spec.label}
        </p>
        {prompt.side ? (
          <p className="text-base text-white/80 sm:text-xl">with your {prompt.side} arm</p>
        ) : (
          <p className="text-base text-white/80 sm:text-xl">either arm</p>
        )}
      </div>

      <div className="absolute bottom-2 right-2 flex flex-col items-center gap-2">
        <HoldRing
          progress={drill.progress}
          phase={hold.phase}
          className="h-28 w-28 sm:h-36 sm:w-36"
        />
        <p className="rounded bg-black/60 px-3 py-1.5 text-lg font-semibold text-white sm:text-xl">
          {hold.phase === 'held' ? 'Held' : hold.phase === 'forming' ? 'Hold it…' : 'Not holding'}
        </p>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title="Signal practice"
        lede={`Drill one signal at a time. The camera grades the shape of the gesture and the hold t.63 requires — “${SIGNAL_ARTICLE.durationRule}” — and tells you which part was wrong.`}
      />

      {/*
        The camera takes whatever the window has; the sidebar is a fixed column
        wide enough to read the coaching in and no wider. A proportional split
        would hand the sidebar half a 1920px monitor for three numbers.
      */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <CameraStage
            onFrame={onFrame}
            onRunningChange={onRunningChange}
            needsHands={prompt.spec.needsHands}
            overlay={overlay}
          >
            <button
              type="button"
              onClick={skip}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Next signal
            </button>
          </CameraStage>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {drill.mode === 'random'
              ? 'Signals come up at random, and the next one appears once you have made this one and lowered your arms. Pick one below to stay on it.'
              : `Drilling ${prompt.spec.label} until you move on. “Next signal” returns to random prompts.`}
          </p>
        </div>

        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800">
            {[
              { label: 'Streak', value: `${drill.streak}` },
              { label: 'Best', value: `${drill.bestStreak}` },
              { label: 'Held', value: `${drill.passes}/${drill.attempts}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {label}
                </dt>
                {/*
                  `dt` labels this visually, but nothing in the accessibility
                  tree ties the pair together — hence the explicit label, so the
                  number is not announced as a bare "3".
                */}
                <dd aria-label={label} className="mt-0.5 text-4xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <Feedback
            prompt={prompt}
            evaluation={evaluation}
            attempt={attempt}
            wrongArm={wrongArm(drill)}
            phase={hold.phase}
            live={cameraOn}
          />
        </div>
      </div>

      <section aria-labelledby="signal-picker" className="mt-10">
        <h2 id="signal-picker" className="text-lg font-semibold tracking-tight">
          Drill one signal
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          The core ten of the twenty signals in Article {SIGNAL_ARTICLE.article}. The other ten are
          reference-only for now.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{picker}</ul>
      </section>
    </>
  );
}
