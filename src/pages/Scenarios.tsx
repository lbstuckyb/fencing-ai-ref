import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CameraStage from '../components/CameraStage';
import GradeReport from '../components/GradeReport';
import Hint from '../components/Hint';
import HoldRing from '../components/HoldRing';
import ScenarioPlayer from '../components/ScenarioPlayer';
import type { ScenarioPlayerHandle } from '../components/ScenarioPlayer';
import { measure } from '../cv/measurements';
import type { HandFrame, PoseFrame } from '../cv/types';
import { CORE_SIGNALS, WEAPON_RULES, allowedSignals, weaponRule } from '../data/rules';
import type { Weapon, WeaponRule } from '../data/rules';
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
 * The layout is fixed across every phase — the clip fills the screen, the live
 * self-view sits in its corner — and so is the camera: `CameraStage` is mounted for the whole
 * scenario view with no `key`, so ready → countdown → live → graded → retry →
 * next phrase never releases the device or re-prompts for permission. Only the
 * overlay and the transport change with the phase.
 *
 * Camera-frame handling mirrors PracticeSignals: state is mirrored into a ref
 * so the detection loop's stable callback identity can always reach the
 * latest engine without being torn down and rebuilt every frame.
 */

/** The weapon-legal, calibrated pool the call phase grades against. */
function poolFor(weapon: Weapon, calibratedSpecs: readonly SignalSpec[]): SignalSpec[] {
  const allowed = new Set<string>(allowedSignals(weapon));
  return calibratedSpecs.filter((spec) => allowed.has(spec.id));
}

const SIDE_BG = { left: 'bg-lamp-red', right: 'bg-lamp-green' } as const;

function Difficulty({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Difficulty ${level}`} className="flex shrink-0 gap-1">
      {[1, 2, 3].map((pip) => (
        <span
          key={pip}
          className={`h-2 w-2 border border-chalk ${pip <= level ? 'bg-chalk' : ''}`}
        />
      ))}
    </span>
  );
}

/** What changes under this weapon — the part of the rules that decides which calls exist. */
function WeaponHint({ weapon }: { weapon: WeaponRule }) {
  const excluded = CORE_SIGNALS.filter((signal) => signal.id in weapon.excluded);
  return (
    <Hint label={`About ${weapon.label}`} align="left">
      <span className="block">{weapon.target}</span>
      {excluded.length > 0 ? (
        <span className="mt-2 block text-mute">
          Never called: {excluded.map((signal) => signal.label).join(', ')}.
        </span>
      ) : null}
    </Hint>
  );
}

/**
 * The phrase to move on to: the next of the same weapon if there is one, and
 * otherwise the next in the bank. `undefined` at the end of the bank.
 */
function nextScenario(current: Scenario): Scenario | undefined {
  const index = SCENARIOS.indexOf(current);
  const later = SCENARIOS.slice(index + 1);
  return later.find((scenario) => scenario.weapon === current.weapon) ?? later[0];
}

export default function Scenarios() {
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

  if (!scenario || !engine) {
    return (
      <div className="flex min-h-full flex-col">
        <h1 className="sr-only">Referee</h1>
        <ul className="grid flex-1 lg:grid-cols-3">
          {WEAPON_RULES.map((weapon) => (
            <li
              key={weapon.id}
              className="flex flex-col border-b border-line p-5 sm:p-8 lg:border-b-0 lg:border-r lg:last:border-r-0"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="display text-7xl sm:text-8xl">{weapon.label}</h2>
                <WeaponHint weapon={weapon} />
              </div>
              <p className="caption mt-2">
                {weapon.rightOfWay ? 'Right of way' : 'No right of way'}
              </p>

              <ul className="mt-8 border-t border-line">
                {scenariosFor(weapon.id).map((item) => (
                  <li key={item.id} className="border-b border-line">
                    <button
                      type="button"
                      onClick={() => selectScenario(item)}
                      className="focusable flex w-full items-center justify-between gap-4 px-1 py-4 text-left text-lg transition-colors hover:bg-chalk/5"
                    >
                      {item.title}
                      <Difficulty level={item.difficulty} />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const next = nextScenario(scenario);
  const framing = engine.phase === 'ready' || engine.phase === 'countdown';
  const heldSpec = pool.find((spec) => spec.id === engine.hold.signal);
  const heldLabel = engine.hold.signal ? (heldSpec?.label ?? engine.hold.signal) : null;
  /** Only where the arm names a fencer does its side get a lamp. */
  const directional = (signal: string) =>
    pool.find((spec) => spec.id === signal)?.directional ?? false;

  return (
    <div className="relative flex h-full min-h-[28rem] flex-col">
      <h1 className="sr-only">Referee</h1>

      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        <button type="button" onClick={backToBank} className="btn">
          ‹ Phrases
        </button>
        <h2 className="display min-w-0 truncate text-2xl">{scenario.title}</h2>
        <span className="caption hidden sm:inline">{weaponRule(scenario.weapon).label}</span>
        <Difficulty level={scenario.difficulty} />
        <Hint className="ml-auto">
          Frame yourself, then play the phrase. You get five seconds to set. Every signal you hold
          is captured until you submit, replays included.
        </Hint>
      </div>

      <div className="relative min-h-0 flex-1">
        <ScenarioPlayer
          key={scenario.id}
          ref={playerRef}
          src={scenario.video}
          armed={engine.phase !== 'ready'}
          canArm={cameraOn}
          onArm={arm}
          overlay={
            engine.phase === 'live' ? (
              <div className="absolute bottom-3 left-3 flex max-w-[60%] flex-col items-start gap-2">
                <div className="hud flex items-center gap-3 px-3 py-2">
                  <HoldRing
                    progress={engine.progress}
                    phase={engine.hold.phase}
                    side={heldSpec?.directional ? engine.hold.side : null}
                    className="h-14 w-14 shrink-0"
                  />
                  <p className="display text-3xl sm:text-4xl">
                    {heldLabel ?? <span className="text-mute">No signal yet</span>}
                  </p>
                </div>

                {engine.calls.length === 0 ? (
                  <p className="hud caption px-3 py-1.5">No calls yet</p>
                ) : (
                  <ol aria-label="Calls so far" className="flex flex-wrap gap-1.5">
                    {engine.calls.map((call, index) => (
                      <li key={index} className="hud flex items-center gap-2 px-2.5 py-1.5">
                        <span className="caption tabular-nums">{index + 1}</span>
                        {directional(call.signal) ? (
                          <span
                            role="img"
                            aria-label={`${call.side} arm`}
                            className={`h-2.5 w-2.5 ${SIDE_BG[call.side]}`}
                          />
                        ) : null}
                        <span className="display text-xl">{call.label}</span>
                        {call.outcome === 'quick' ? <span className="caption">quick</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null
          }
        >
          {engine.phase === 'live' ? (
            <>
              <span className="ml-auto" />
              <button
                type="button"
                onClick={undo}
                disabled={engine.calls.length === 0}
                className="btn"
              >
                Undo last call
              </button>
              <button type="button" onClick={submit} className="btn btn-go">
                Submit call
              </button>
            </>
          ) : null}
        </ScenarioPlayer>

        {/*
          No `key`: this stage is mounted for the whole scenario view, so a retry
          never releases the device or re-prompts for permission. It is large
          while the referee is finding their framing and steps back into the
          corner once the clip is what they should be watching.
        */}
        <div
          className={`absolute right-3 top-3 z-10 border border-line bg-ink transition-[width] duration-300 ${
            framing ? 'w-[min(44rem,62%)]' : 'w-[min(20rem,34%)]'
          }`}
        >
          <CameraStage
            autoStart
            compact
            onFrame={onFrame}
            onRunningChange={onRunningChange}
            needsHands={pool.some((spec) => spec.needsHands)}
            overlay={
              engine.phase === 'countdown' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <p aria-hidden className="display text-9xl">
                    {Math.ceil(engine.countdownRemainingMs / 1000)}
                  </p>
                </div>
              ) : null
            }
          >
            {engine.phase === 'countdown' ? (
              <span role="status" className="caption text-chalk">
                Starts in {Math.ceil(engine.countdownRemainingMs / 1000)}…
              </span>
            ) : null}
          </CameraStage>
        </div>
      </div>

      {engine.phase === 'graded' && engine.grade ? (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-ink">
          <GradeReport
            scenario={scenario}
            grade={engine.grade}
            onRetry={tryAgain}
            onChoose={backToBank}
            onNext={next ? () => selectScenario(next) : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
