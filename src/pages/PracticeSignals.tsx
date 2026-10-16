import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CameraStage from '../components/CameraStage';
import Feedback from '../components/Feedback';
import Hint from '../components/Hint';
import HoldRing from '../components/HoldRing';
import SignalCard from '../components/SignalCard';
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
      if (!running) apply(stopDrill(drillRef.current));
    },
    [apply]
  );

  const choose = useCallback(
    (spec: SignalSpec) => {
      apply(chooseSignal(drillRef.current, spec));
      setParams({ [SIGNAL_PARAM]: spec.id }, { replace: true });
      setPickerOpen(false);
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

  const armLine = prompt.side ? (
    <span className={prompt.side === 'left' ? 'text-lamp-red' : 'text-lamp-green'}>
      {prompt.side} arm
    </span>
  ) : (
    <span className="text-mute">either arm</span>
  );

  const lastPass = attempt?.outcome === 'pass' ? attempt : null;

  const overlay = (
    <>
      {/*
        The lamp. A signal that names a fencer lights that fencer's edge of the
        frame — the view is mirrored, so the referee's right is the screen's —
        and one that names nobody lights the top. Keyed on the attempt count so
        each pass restarts the flash.
      */}
      {lastPass ? (
        <div
          key={drill.attempts}
          className={`absolute animate-lamp ${
            lastPass.promptedSide === 'left'
              ? 'inset-y-0 left-0 w-3 bg-lamp-red shadow-[0_0_80px_30px_var(--color-lamp-red)]'
              : lastPass.promptedSide === 'right'
                ? 'inset-y-0 right-0 w-3 bg-lamp-green shadow-[0_0_80px_30px_var(--color-lamp-green)]'
                : 'inset-x-0 top-0 h-3 bg-chalk shadow-[0_0_80px_20px_var(--color-chalk)]'
          }`}
        />
      ) : null}

      {/*
        Read from further away than anything else in the app — the referee is
        standing back from the monitor with their arms up — and sized for it.
      */}
      <div className="hud absolute left-1/2 top-16 -translate-x-1/2 px-6 py-3 text-center lg:top-3">
        <p className="display text-5xl sm:text-7xl lg:text-8xl">{prompt.spec.label}</p>
        <p className="caption mt-1 text-base sm:text-lg">{armLine}</p>
      </div>

      <div className="absolute bottom-3 left-3">
        <Feedback
          prompt={prompt}
          evaluation={evaluation}
          attempt={attempt}
          wrongArm={wrongArm(drill)}
          phase={hold.phase}
        />
      </div>

      <HoldRing
        progress={drill.progress}
        phase={hold.phase}
        side={prompt.side}
        className="absolute bottom-3 right-3 h-24 w-24 sm:h-36 sm:w-36"
      />
    </>
  );

  return (
    <div className="relative h-full min-h-[26rem]">
      <h1 className="sr-only">Drill</h1>

      {/* Outside the camera overlay: the score is the user's, camera on or off. */}
      <dl className="hud pointer-events-none absolute right-2 top-2 z-10 flex gap-4 px-3 py-2 text-center">
        {[
          { label: 'Streak', value: `${drill.streak}` },
          { label: 'Best', value: `${drill.bestStreak}` },
          { label: 'Score', value: `${drill.passes}/${drill.attempts}` },
        ].map(({ label, value }, index) => (
          <div key={label} className={index === 0 ? '' : 'hidden sm:block'}>
            {/*
              `dt` labels this visually, but nothing in the accessibility tree
              ties the pair together — hence the explicit label, so the number
              is not announced as a bare "3".
            */}
            <dd aria-label={label} className="display text-4xl tabular-nums">
              {value}
            </dd>
            <dt className="caption">{label}</dt>
          </div>
        ))}
      </dl>

      <CameraStage
        fill
        onFrame={onFrame}
        onRunningChange={onRunningChange}
        needsHands={prompt.spec.needsHands}
        overlay={overlay}
        idleContent={
          <div>
            <p className="display text-6xl sm:text-8xl">{prompt.spec.label}</p>
            <p className="caption mt-2 text-base">{armLine}</p>
          </div>
        }
      >
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-expanded={pickerOpen}
          className="btn"
        >
          ‹ Signals
        </button>
        <Hint align="left" placement="above">
          {drill.mode === 'random'
            ? 'Random order. Lower your arms after each signal to get the next. Pick one to stay on it.'
            : `Staying on ${prompt.spec.label}. Next signal goes back to random.`}
        </Hint>
        <span className="ml-auto" />
        <button type="button" onClick={skip} className="btn">
          Next signal ›
        </button>
        <Link to="/scenarios" className="btn btn-go">
          Referee ›
        </Link>
      </CameraStage>

      {pickerOpen ? (
        <section
          aria-labelledby="signal-picker"
          className="absolute inset-y-0 left-0 z-30 flex w-80 max-w-full animate-rise flex-col border-r border-line bg-panel"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 id="signal-picker" className="caption">
              Drill one signal
            </h2>
            <button type="button" onClick={() => setPickerOpen(false)} className="btn">
              Close
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">{picker}</ul>
        </section>
      ) : null}
    </div>
  );
}
