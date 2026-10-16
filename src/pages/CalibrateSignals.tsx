import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import CameraStage from '../components/CameraStage';
import Hint from '../components/Hint';
import ToolTabs from '../components/ToolTabs';
import SignalCard from '../components/SignalCard';
import { MEASUREMENT_BY_ID, formatMeasurement, measure } from '../cv/measurements';
import { createRecorder } from '../cv/recording';
import type { Recorder } from '../cv/recording';
import type { HandFrame, HandShape, PoseFrame, Side, WorldPoint } from '../cv/types';
import {
  clearCalibration,
  loadCalibrationStore,
  recordCalibration,
  saveCalibrationStore,
} from '../signals/calibration';
import type { CalibrationStore, SignalCalibration } from '../signals/calibration';
import { calibratedBand } from '../signals/calibration';
import { formatBand, resolve } from '../signals/evaluator';
import type { SignalSpec } from '../signals/evaluator';
import { SIGNAL_SPECS } from '../signals/specs';

/**
 * Record-and-save companion to `/calibrate`: where that page only reads live
 * numbers off the camera, this one turns a hold into a saved
 * {@link SignalCalibration} — the expert-recorded reference `signals/
 * calibration.ts` layers over the mannequin-authored bands. Stage 16 is what
 * makes `/practice` actually grade against it; this page only records and
 * saves.
 */

/**
 * t.63 asks for a signal held 1–2 seconds; three gives room to settle into the
 * pose and still capture a full second of the hold itself.
 */
const RECORD_MS = 3000;

/**
 * A get-ready beat before capture starts. Recording used to begin the instant
 * "Record" was clicked, which meant the first frames — while a hand was still
 * on the mouse and the body hadn't moved yet — were part of the 3 s median.
 * This gives a visible 3…2…1 on screen instead, so the referee knows exactly
 * when the window opens.
 */
const COUNTDOWN_MS = 3000;

type RecordPhase =
  | { phase: 'idle' }
  | { phase: 'countdown'; remainingMs: number }
  | { phase: 'recording'; elapsedMs: number }
  | { phase: 'review'; calibration: SignalCalibration };

/**
 * The hard trio are the only specs that grade the second arm outright — an
 * `elbow.L` constraint of their own, rather than just requiring it stay down —
 * so that's what distinguishes "both arms recorded directly" from "one arm,
 * mirrored" for the purposes of this wizard.
 */
function usesBothArms(spec: SignalSpec): boolean {
  return spec.constraints.some(
    (constraint) => constraint.kind === 'range' && constraint.measure === 'elbow.L'
  );
}

interface ReviewRow {
  key: string;
  label: string;
  side: Side | null;
  recordedText: string;
  defaultBandText: string;
  newBandText: string;
  changed: boolean;
}

function buildReviewRows(spec: SignalSpec, calibration: SignalCalibration): ReviewRow[] {
  return spec.constraints.flatMap((constraint, index) => {
    if (constraint.kind !== 'range') return [];

    const anatomical = resolve(constraint.measure, calibration.side);
    const info = MEASUREMENT_BY_ID.get(anatomical);
    const unit = info?.unit ?? 'ratio';
    const recorded = calibration.measurements[anatomical] ?? null;
    const changed = recorded !== null && Number.isFinite(recorded);
    const newBand = changed ? calibratedBand(constraint.band, recorded, unit) : constraint.band;

    return [
      {
        key: `${constraint.measure}-${index}`,
        label: info?.label ?? constraint.measure,
        side: info?.side ?? null,
        recordedText: formatMeasurement(recorded, unit),
        defaultBandText: formatBand(constraint.band, unit),
        newBandText: formatBand(newBand, unit),
        changed,
      },
    ];
  });
}

function ReviewTable({ spec, calibration }: { spec: SignalSpec; calibration: SignalCalibration }) {
  const rows = useMemo(() => buildReviewRows(spec, calibration), [spec, calibration]);
  const skipped = spec.constraints.length - rows.length;

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-md border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-mute">
            <th className="py-2 pr-4 font-medium">Measurement</th>
            <th className="py-2 pr-4 font-medium">You recorded</th>
            <th className="py-2 pr-4 font-medium">Default band</th>
            <th className="py-2 pr-4 font-medium">New band</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line">
              <th scope="row" className="py-2 pr-4 font-sans font-normal">
                {row.label}
                {row.side ? ` (${row.side})` : ''}
              </th>
              <td className="py-2 pr-4">{row.recordedText}</td>
              <td className="py-2 pr-4 text-mute">{row.defaultBandText}</td>
              <td className={`py-2 pr-4 ${row.changed ? 'font-bold text-chalk' : 'text-mute'}`}>
                {row.newBandText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {skipped > 0 ? (
        <p className="mt-2 text-sm text-mute">
          {skipped} more constraint{skipped === 1 ? '' : 's'} — hand shape or arm symmetry — not
          shown here: neither is a band a recording can widen.
        </p>
      ) : null}
    </div>
  );
}

export default function CalibrateSignals() {
  const [store, setStore] = useState<CalibrationStore>(() => loadCalibrationStore());
  const [selectedSpec, setSelectedSpec] = useState<SignalSpec>(SIGNAL_SPECS[0]);
  const [selectedSide, setSelectedSide] = useState<Side>('right');
  const [record, setRecord] = useState<RecordPhase>({ phase: 'idle' });

  const recorderRef = useRef<Recorder | null>(null);
  /** Set to the first frame's timestamp once a countdown begins, cleared after. */
  const countdownStartRef = useRef<number | null>(null);
  const lastWorldRef = useRef<WorldPoint[]>([]);
  const lastShapesRef = useRef<Record<Side, HandShape | null>>({ left: null, right: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const twoArmed = useMemo(() => usesBothArms(selectedSpec), [selectedSpec]);

  const busy = record.phase === 'countdown' || record.phase === 'recording';

  const selectSignal = useCallback(
    (spec: SignalSpec) => {
      if (busy) return;
      setSelectedSpec(spec);
      setSelectedSide('right');
      setRecord({ phase: 'idle' });
    },
    [busy]
  );

  const chooseSide = useCallback(
    (side: Side) => {
      if (busy) return;
      setSelectedSide(side);
    },
    [busy]
  );

  const onFrame = useCallback(
    (frame: PoseFrame, handFrame: HandFrame | null) => {
      if (record.phase === 'countdown') {
        // Anchor the countdown to frame timestamps, not wall-clock time, so it
        // tracks the same clock the recording itself is measured against.
        countdownStartRef.current ??= frame.timestampMs;
        const remainingMs = COUNTDOWN_MS - (frame.timestampMs - countdownStartRef.current);

        if (remainingMs > 0) {
          setRecord({ phase: 'countdown', remainingMs });
          return;
        }

        countdownStartRef.current = null;
        recorderRef.current = createRecorder();
        setRecord({ phase: 'recording', elapsedMs: 0 });
        return;
      }

      const recorder = recorderRef.current;
      if (!recorder) return;

      const measured = measure(frame.world, handFrame);
      recorder.push(measured.values, frame.timestampMs);
      lastWorldRef.current = frame.world;
      lastShapesRef.current = measured.shapes;

      if (recorder.elapsedMs < RECORD_MS) {
        setRecord({ phase: 'recording', elapsedMs: recorder.elapsedMs });
        return;
      }

      recorderRef.current = null;
      const recording = recorder.finish();
      const measurements: Record<string, number | null> = {};
      for (const id of Object.keys(recording.stats)) {
        measurements[id] = recording.stats[id]?.median ?? null;
      }

      setRecord({
        phase: 'review',
        calibration: {
          signalId: selectedSpec.id,
          side: twoArmed ? 'right' : selectedSide,
          recordedAtMs: Date.now(),
          measurements,
          shapes: lastShapesRef.current,
          rawPoseWorld: lastWorldRef.current,
        },
      });
    },
    [record.phase, selectedSpec, selectedSide, twoArmed]
  );

  const startRecording = useCallback(() => {
    countdownStartRef.current = null;
    setRecord({ phase: 'countdown', remainingMs: COUNTDOWN_MS });
  }, []);

  const cancelRecording = useCallback(() => {
    countdownStartRef.current = null;
    recorderRef.current = null;
    setRecord({ phase: 'idle' });
  }, []);

  const retake = useCallback(() => setRecord({ phase: 'idle' }), []);

  const save = useCallback(() => {
    if (record.phase !== 'review') return;
    const { calibration } = record;
    setStore((prev) => {
      const next = recordCalibration(prev, calibration);
      saveCalibrationStore(next);
      return next;
    });
    setRecord({ phase: 'idle' });
  }, [record]);

  const resetSignal = useCallback((id: string) => {
    setStore((prev) => {
      const next = clearCalibration(prev, id);
      saveCalibrationStore(next);
      return next;
    });
  }, []);

  // A countdown or recording in progress is tied to a session that just ended;
  // a completed review is still worth reading, same as `/calibrate`'s finished
  // recording.
  const onRunningChange = useCallback(
    (running: boolean) => {
      if (running || !busy) return;
      countdownStartRef.current = null;
      recorderRef.current = null;
      setRecord({ phase: 'idle' });
    },
    [busy]
  );

  const exportStore = useCallback(() => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'far-signal-calibration.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  const triggerImport = useCallback(() => fileInputRef.current?.click(), []);

  const importFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object') return;
        setStore((prev) => {
          const merged = { ...prev, ...(parsed as CalibrationStore) };
          saveCalibrationStore(merged);
          return merged;
        });
      })
      .catch((error: unknown) => {
        console.error('[calibrate-signals] import failed', error);
      });
  }, []);

  const picker = useMemo(
    () =>
      SIGNAL_SPECS.map((spec) => {
        const calibrated = spec.id in store;
        return (
          <li key={spec.id} className="border-b border-line py-1">
            <SignalCard spec={spec} selected={spec === selectedSpec} onSelect={selectSignal} />
            <div className="flex items-center justify-between px-4 pb-1 text-xs">
              <span className={calibrated ? 'text-chalk' : 'text-mute'}>
                {calibrated ? 'Using your recording' : 'Using default band'}
              </span>
              {calibrated ? (
                <button
                  type="button"
                  onClick={() => resetSignal(spec.id)}
                  className="text-mute underline hover:no-underline"
                >
                  Reset to default
                </button>
              ) : null}
            </div>
          </li>
        );
      }),
    [store, selectedSpec, selectSignal, resetSignal]
  );

  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <ToolTabs />
      <div className="mb-6 flex items-center gap-3">
        <h1 className="display text-5xl">Expert calibration</h1>
        <Hint align="left">
          Record yourself making each signal correctly. Drills then grade against your recording
          instead of the default. A new take replaces the old one; reset brings the default back.
        </Hint>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-4xl">{selectedSpec.label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-mute">{selectedSpec.description}</p>
        </div>

        {!twoArmed ? (
          <div className="flex items-center gap-2">
            <span className="caption">Arm</span>
            {(['right', 'left'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => chooseSide(side)}
                aria-pressed={selectedSide === side}
                disabled={busy}
                className="btn"
              >
                {side === 'right' ? 'Right arm' : 'Left arm'}
              </button>
            ))}
          </div>
        ) : (
          <p className="caption">Both arms</p>
        )}
      </div>

      <CameraStage
        onFrame={onFrame}
        onRunningChange={onRunningChange}
        needsHands={selectedSpec.needsHands}
        overlay={
          record.phase === 'countdown' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
              <p aria-hidden className="display text-9xl">
                {Math.ceil(record.remainingMs / 1000)}
              </p>
            </div>
          ) : record.phase === 'recording' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="caption bg-chalk px-3 py-1.5 text-ink">Recording</p>
              <p aria-hidden className="display text-8xl">
                {((RECORD_MS - record.elapsedMs) / 1000).toFixed(1)}s
              </p>
            </div>
          ) : null
        }
      >
        {busy ? (
          <>
            <span role="status" className="caption text-chalk">
              {record.phase === 'countdown'
                ? `Starts in ${Math.ceil(record.remainingMs / 1000)}…`
                : `Recording… ${(record.elapsedMs / 1000).toFixed(1)} s`}
            </span>
            <button type="button" onClick={cancelRecording} className="btn">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={startRecording} className="btn btn-go">
            Record {RECORD_MS / 1000} s
          </button>
        )}
      </CameraStage>

      {record.phase === 'review' ? (
        <div className="mt-3 border border-line bg-panel p-3">
          <p className="caption">Recorded with your {record.calibration.side} arm</p>
          <ReviewTable spec={selectedSpec} calibration={record.calibration} />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} className="btn btn-go">
              Save
            </button>
            <button type="button" onClick={retake} className="btn">
              Retake
            </button>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="calibration-picker" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="calibration-picker" className="caption flex items-center gap-2">
            The core ten
            <Hint align="left">
              Pick a signal to record it. Export saves every recording on this device to a file;
              import loads one back in, on top of what is already saved.
            </Hint>
          </h2>
          <div className="flex gap-2">
            <button type="button" onClick={exportStore} className="btn">
              Export recordings
            </button>
            <button type="button" onClick={triggerImport} className="btn">
              Import recordings
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={importFile}
              className="hidden"
            />
          </div>
        </div>
        <ul className="mt-3 grid gap-x-6 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {picker}
        </ul>
      </section>
    </div>
  );
}
