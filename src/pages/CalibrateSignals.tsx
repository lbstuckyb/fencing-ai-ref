import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import CameraStage from '../components/CameraStage';
import PageHeader from '../components/PageHeader';
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

type RecordPhase =
  | { phase: 'idle' }
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
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th className="py-2 pr-4 font-medium">Measurement</th>
            <th className="py-2 pr-4 font-medium">You recorded</th>
            <th className="py-2 pr-4 font-medium">Default band</th>
            <th className="py-2 pr-4 font-medium">New band</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800/60">
              <th scope="row" className="py-2 pr-4 font-sans font-normal">
                {row.label}
                {row.side ? ` (${row.side})` : ''}
              </th>
              <td className="py-2 pr-4">{row.recordedText}</td>
              <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                {row.defaultBandText}
              </td>
              <td
                className={`py-2 pr-4 ${
                  row.changed ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                }`}
              >
                {row.newBandText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {skipped > 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {skipped} more constraint{skipped === 1 ? '' : 's'} — hand shape or arm symmetry — not
          shown here: neither is a band a recording can widen.
        </p>
      ) : null}
    </div>
  );
}

const TOGGLE_BASE =
  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
const TOGGLE_ON = 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
const TOGGLE_OFF =
  'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

export default function CalibrateSignals() {
  const [store, setStore] = useState<CalibrationStore>(() => loadCalibrationStore());
  const [selectedSpec, setSelectedSpec] = useState<SignalSpec>(SIGNAL_SPECS[0]);
  const [selectedSide, setSelectedSide] = useState<Side>('right');
  const [record, setRecord] = useState<RecordPhase>({ phase: 'idle' });

  const recorderRef = useRef<Recorder | null>(null);
  const lastWorldRef = useRef<WorldPoint[]>([]);
  const lastShapesRef = useRef<Record<Side, HandShape | null>>({ left: null, right: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const twoArmed = useMemo(() => usesBothArms(selectedSpec), [selectedSpec]);

  const selectSignal = useCallback(
    (spec: SignalSpec) => {
      if (record.phase === 'recording') return;
      setSelectedSpec(spec);
      setSelectedSide('right');
      setRecord({ phase: 'idle' });
    },
    [record.phase]
  );

  const chooseSide = useCallback(
    (side: Side) => {
      if (record.phase === 'recording') return;
      setSelectedSide(side);
    },
    [record.phase]
  );

  const onFrame = useCallback(
    (frame: PoseFrame, handFrame: HandFrame | null) => {
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
    [selectedSpec, selectedSide, twoArmed]
  );

  const startRecording = useCallback(() => {
    recorderRef.current = createRecorder();
    setRecord({ phase: 'recording', elapsedMs: 0 });
  }, []);

  const cancelRecording = useCallback(() => {
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

  // A recording in progress is tied to a session that just ended; a completed
  // review is still worth reading, same as `/calibrate`'s finished recording.
  const onRunningChange = useCallback((running: boolean) => {
    if (running || !recorderRef.current) return;
    recorderRef.current = null;
    setRecord({ phase: 'idle' });
  }, []);

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
          <li key={spec.id} className="space-y-1">
            <SignalCard spec={spec} selected={spec === selectedSpec} onSelect={selectSignal} />
            <div className="flex items-center justify-between px-1 text-xs">
              <span
                className={
                  calibrated
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-500'
                }
              >
                {calibrated ? 'Using your recording' : 'Using default band'}
              </span>
              {calibrated ? (
                <button
                  type="button"
                  onClick={() => resetSignal(spec.id)}
                  className="text-slate-500 underline hover:no-underline dark:text-slate-400"
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
    <>
      <PageHeader
        title="Expert calibration"
        lede="Perform each signal correctly and record it — the reference future practice sessions grade against. Recording overwrites any previous take for that signal; the default band is always one reset away."
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{selectedSpec.label}</h2>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {selectedSpec.description}
          </p>
        </div>

        {!twoArmed ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Recording with your:</span>
            {(['right', 'left'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => chooseSide(side)}
                aria-pressed={selectedSide === side}
                disabled={record.phase === 'recording'}
                className={`${TOGGLE_BASE} ${selectedSide === side ? TOGGLE_ON : TOGGLE_OFF}`}
              >
                {side === 'right' ? 'Right arm' : 'Left arm'}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Both arms are recorded directly — no arm to pick.
          </p>
        )}
      </div>

      <CameraStage
        onFrame={onFrame}
        onRunningChange={onRunningChange}
        needsHands={selectedSpec.needsHands}
      >
        {record.phase === 'recording' ? (
          <>
            <span
              role="status"
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Recording… {(record.elapsedMs / 1000).toFixed(1)} s
            </span>
            <button
              type="button"
              onClick={cancelRecording}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Record {RECORD_MS / 1000} s
          </button>
        )}
      </CameraStage>

      {record.phase === 'review' ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Recorded with your {record.calibration.side} arm. Review the bands this will produce,
            then save or retake.
          </p>
          <ReviewTable spec={selectedSpec} calibration={record.calibration} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              Save
            </button>
            <button
              type="button"
              onClick={retake}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Retake
            </button>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="calibration-picker" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="calibration-picker" className="text-lg font-semibold tracking-tight">
            The core ten
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportStore}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Export recordings
            </button>
            <button
              type="button"
              onClick={triggerImport}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
            >
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
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Pick a signal to record it. Export saves every recording on this device to a file; import
          loads one back in, on top of whatever is already saved here.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{picker}</ul>
      </section>
    </>
  );
}
