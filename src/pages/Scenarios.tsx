import { useCallback, useMemo, useRef, useState } from 'react';
import CameraStage from '../components/CameraStage';
import GradeReport from '../components/GradeReport';
import HoldRing from '../components/HoldRing';
import PageHeader from '../components/PageHeader';
import ScenarioPlayer from '../components/ScenarioPlayer';
import { measure } from '../cv/measurements';
import type { HandFrame, PoseFrame } from '../cv/types';
import { WEAPON_RULES, allowedSignals } from '../data/rules';
import type { Weapon } from '../data/rules';
import { SCENARIOS, scenariosFor } from '../data/scenarios';
import {
  advanceCall,
  beginCall,
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
 * Mode 2 — watch a phrase, then call it.
 *
 * The page is a phase switch over `scenario/engine.ts`'s state machine, plus
 * one thing that belongs to the page rather than the engine: which scenario
 * is loaded in the first place. `null` scenario means "showing the bank";
 * everything else reads `engine.phase` to decide what to render.
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

  const onWatchEnded = useCallback(() => {
    if (!engineRef.current) return;
    apply(beginCall(engineRef.current));
  }, [apply]);

  const onFrame = useCallback(
    (frame: PoseFrame, hands: HandFrame | null) => {
      if (!engineRef.current) return;
      apply(advanceCall(engineRef.current, measure(frame.world, hands), frame.timestampMs, pool));
    },
    [apply, pool]
  );

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
        lede="Watch a phrase, then call it: give the full sequence of signals and get graded against an authored answer key. The legal call vocabulary follows the weapon."
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

          {engine.phase === 'watch' ? (
            <ScenarioPlayer key={scenario.id} src={scenario.video} onEnded={onWatchEnded} />
          ) : null}

          {engine.phase === 'call' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div>
                <CameraStage
                  onFrame={onFrame}
                  onRunningChange={onRunningChange}
                  needsHands={pool.some((spec) => spec.needsHands)}
                  overlay={
                    <>
                      <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/60 px-5 py-3 text-center text-white">
                        <p className="text-xs uppercase tracking-wide text-white/70 sm:text-sm">
                          Call the phrase
                        </p>
                        <p className="text-2xl font-semibold leading-tight sm:text-3xl">
                          {engine.hold.signal
                            ? (pool.find((spec) => spec.id === engine.hold.signal)?.label ??
                              engine.hold.signal)
                            : 'No signal recognised yet'}
                        </p>
                        {engine.hold.side ? (
                          <p className="text-base text-white/80">{engine.hold.side} arm</p>
                        ) : null}
                      </div>
                      <div className="absolute bottom-2 right-2 flex flex-col items-center gap-2">
                        <HoldRing
                          progress={engine.progress}
                          phase={engine.hold.phase}
                          className="h-24 w-24 sm:h-32 sm:w-32"
                        />
                      </div>
                    </>
                  }
                >
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
                </CameraStage>

                {!cameraOn ? (
                  <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                    Start the camera and give the full sequence of calls, each held properly. Submit
                    when the phrase is complete.
                  </p>
                ) : null}
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
                          <span className="ml-1 text-amber-600 dark:text-amber-400">(quick)</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : null}

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
