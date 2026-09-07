import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CameraStage from '../components/CameraStage';
import GradeReport from '../components/GradeReport';
import HoldRing from '../components/HoldRing';
import PageHeader from '../components/PageHeader';
import ScenarioPlayer from '../components/ScenarioPlayer';
import type { ScenarioPlayerHandle } from '../components/ScenarioPlayer';
import { measure } from '../cv/measurements';
import type { HandFrame, PoseFrame } from '../cv/types';
import { WEAPON_RULES, allowedSignals } from '../data/rules';
import type { Weapon } from '../data/rules';
import { SCENARIOS, scenariosFor } from '../data/scenarios';
import {
  advanceFrame,
  beginCountdown,
  cameraStopped,
  createEngine,
  restart,
  submitCall,
  undoLastCall,
} from '../scenario/engine';
import type { EngineState } from '../scenario/engine';
import type { Scenario } from '../scenario/schema';
import { getCalibratedSpecs } from '../signals/calibration';
import type { SignalSpec } from '../signals/evaluator';

/**
 * Mode 2 — call a phrase as it happens.
 *
 * The page is a thin shell over `scenario/engine.ts`'s state machine, plus one
 * thing that belongs to the page rather than the engine: which scenario is
 * loaded in the first place. `null` scenario means "showing the bank".
 *
 * The layout is fixed across every phase — clip on the left, live self-view on
 * the right — and so is the camera: `CameraStage` is mounted for the whole
 * scenario view with no `key`, so ready → countdown → live → graded → retry
 * never releases the device or re-prompts for permission. Only the overlay and
 * the transport change with the phase.
 *
 * Camera-frame handling mirrors PracticeSignals: state is mirrored into a ref
 * so the detection loop's stable callback identity can always reach the
 * latest engine without being torn down and rebuilt every frame.
 */

const BUTTON =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

/** The weapon-legal, calibrated pool the call phase grades against. */
function poolFor(weapon: Weapon, calibratedSpecs: readonly SignalSpec[]): SignalSpec[] {
  const allowed = new Set<string>(allowedSignals(weapon));
  return calibratedSpecs.filter((spec) => allowed.has(spec.id));
}

function ScenarioCard({
  scenario,
  onSelect,
}: {
  scenario: Scenario;
  onSelect: (s: Scenario) => void;
}) {
  const weapon = WEAPON_RULES.find((rule) => rule.id === scenario.weapon);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(scenario)}
        className="h-full w-full rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-900"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
          {weapon?.label ?? scenario.weapon}
        </span>
        <span className="mt-1 block text-base font-medium">{scenario.title}</span>
        <span className="mt-2 block text-xs text-slate-500 dark:text-slate-500">
          Difficulty {scenario.difficulty}
        </span>
      </button>
    </li>
  );
}

export default function Scenarios() {
  const [weaponFilter, setWeaponFilter] = useState<Weapon | 'all'>('all');
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [engine, setEngine] = useState<EngineState | null>(null);
  const engineRef = useRef<EngineState | null>(null);
  const playerRef = useRef<ScenarioPlayerHandle>(null);
  const [cameraOn, setCameraOn] = useState(false);

  // Computed once per mount, same as PracticeSignals — a calibration saved
  // elsewhere takes effect on the next visit, not live underneath a call phase.
  const calibratedSpecs = useMemo(() => getCalibratedSpecs(), []);
  const pool = useMemo(
    () => (scenario ? poolFor(scenario.weapon, calibratedSpecs) : []),
    [scenario, calibratedSpecs]
  );

  const apply = useCallback((next: EngineState) => {
    engineRef.current = next;
    setEngine(next);
  }, []);

  const selectScenario = useCallback((next: Scenario) => {
    const fresh = createEngine(next);
    engineRef.current = fresh;
    setScenario(next);
    setEngine(fresh);
  }, []);

  const backToBank = useCallback(() => {
    engineRef.current = null;
    setScenario(null);
    setEngine(null);
  }, []);

  const arm = useCallback(() => {
    if (engineRef.current) apply(beginCountdown(engineRef.current));
  }, [apply]);

  const onFrame = useCallback(
    (frame: PoseFrame, hands: HandFrame | null) => {
      if (!engineRef.current) return;
      apply(advanceFrame(engineRef.current, measure(frame.world, hands), frame.timestampMs, pool));
    },
    [apply, pool]
  );

  /**
   * The countdown reached zero: roll the clip.
   *
   * Keyed on the phase string, which is stable across the twenty state objects
   * a second `advanceFrame` produces, so this fires exactly once per countdown
   * — and never again when the referee replays the clip mid-call.
   */
  const phase = engine?.phase;
  useEffect(() => {
    if (phase === 'live') playerRef.current?.play();
  }, [phase]);

  /** Camera off mid-call drops a hold in progress, same rule as PracticeSignals. */
  const onRunningChange = useCallback(
    (running: boolean) => {
      setCameraOn(running);
      if (!running && engineRef.current) apply(cameraStopped(engineRef.current));
    },
    [apply]
  );

  const undo = useCallback(() => {
    if (engineRef.current) apply(undoLastCall(engineRef.current));
  }, [apply]);

  const submit = useCallback(() => {
    if (engineRef.current) apply(submitCall(engineRef.current, pool));
  }, [apply, pool]);

  const tryAgain = useCallback(() => {
    if (engineRef.current) apply(restart(engineRef.current));
  }, [apply]);

  const scenariosShown = weaponFilter === 'all' ? SCENARIOS : scenariosFor(weaponFilter);

  return (
    <>
      <PageHeader
        title="Scenarios"
        lede="Call a phrase as it happens: the camera comes up with the clip, a five-second countdown gets you set, then give the full sequence of signals and get graded against an authored answer key. The legal call vocabulary follows the weapon."
      />

      {!scenario || !engine ? (
        <section>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by weapon">
            {(['all', ...WEAPON_RULES.map((rule) => rule.id)] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setWeaponFilter(id)}
                aria-pressed={weaponFilter === id}
                className={`${BUTTON} ${
                  weaponFilter === id
                    ? 'border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
                    : ''
                }`}
              >
                {id === 'all' ? 'All' : WEAPON_RULES.find((rule) => rule.id === id)?.label}
              </button>
            ))}
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenariosShown.map((s) => (
              <ScenarioCard key={s.id} scenario={s} onSelect={selectScenario} />
            ))}
          </ul>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{scenario.title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {WEAPON_RULES.find((rule) => rule.id === scenario.weapon)?.label} · Difficulty{' '}
                {scenario.difficulty}
              </p>
            </div>
            <button type="button" onClick={backToBank} className={BUTTON}>
              Back to bank
            </button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <ScenarioPlayer
                key={scenario.id}
                ref={playerRef}
                src={scenario.video}
                armed={engine.phase !== 'ready'}
                canArm={cameraOn}
                onArm={arm}
              />

              {engine.phase === 'ready' && !cameraOn ? (
                <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                  Waiting for the camera. The countdown is ticked by the camera’s own frames, so the
                  phrase cannot start until the self-view is live.
                </p>
              ) : null}
            </div>

            {/* No `key`: this stage is mounted for the whole scenario view, so a
                retry never releases the device or re-prompts for permission. */}
            <div className="space-y-3">
              <CameraStage
                autoStart
                compact
                onFrame={onFrame}
                onRunningChange={onRunningChange}
                needsHands={pool.some((spec) => spec.needsHands)}
                overlay={
                  engine.phase === 'countdown' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40">
                      <p className="text-sm font-medium uppercase tracking-wide text-white/80">
                        Get ready…
                      </p>
                      <p
                        aria-hidden
                        className="text-6xl font-bold leading-none text-white drop-shadow"
                      >
                        {Math.ceil(engine.countdownRemainingMs / 1000)}
                      </p>
                    </div>
                  ) : null
                }
              >
                {engine.phase === 'countdown' ? (
                  <span
                    role="status"
                    className="rounded-md bg-slate-800/80 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Starts in {Math.ceil(engine.countdownRemainingMs / 1000)}…
                  </span>
                ) : null}
              </CameraStage>

              {engine.phase === 'live' ? (
                <>
                  <div className="flex items-center gap-3">
                    <HoldRing
                      progress={engine.progress}
                      phase={engine.hold.phase}
                      className="h-16 w-16 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Call the phrase
                      </p>
                      <p className="text-lg font-semibold leading-tight">
                        {engine.hold.signal
                          ? (pool.find((spec) => spec.id === engine.hold.signal)?.label ??
                            engine.hold.signal)
                          : 'No signal recognised yet'}
                      </p>
                      {engine.hold.side ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {engine.hold.side} arm
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Calls so far
                    </h3>
                    {engine.calls.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
                        Nothing called yet.
                      </p>
                    ) : (
                      <ol className="mt-2 space-y-1.5">
                        {engine.calls.map((call, index) => (
                          <li
                            key={index}
                            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800"
                          >
                            <span className="tabular-nums text-slate-500 dark:text-slate-500">
                              {index + 1}.
                            </span>{' '}
                            {call.label}
                            {call.side ? ` — ${call.side} arm` : ''}
                            {call.outcome === 'quick' ? (
                              <span className="ml-1 text-amber-600 dark:text-amber-400">
                                (quick)
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={undo}
                      disabled={engine.calls.length === 0}
                      className={BUTTON}
                    >
                      Undo last call
                    </button>
                    <button
                      type="button"
                      onClick={submit}
                      className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      Submit call
                    </button>
                  </div>
                </>
              ) : engine.phase === 'graded' ? null : (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Get yourself framed. Press “Play the phrase” when you are ready: five seconds to
                  set, then the clip rolls and every signal you hold is captured — during the
                  phrase, after it, and across replays — until you submit.
                </p>
              )}
            </div>
          </div>

          {engine.phase === 'graded' && engine.grade ? (
            <GradeReport
              scenario={scenario}
              grade={engine.grade}
              onRetry={tryAgain}
              onChoose={backToBank}
            />
          ) : null}
        </section>
      )}
    </>
  );
}
