import { useCallback, useRef, useState } from 'react';
import CameraStage from '../components/CameraStage';
import PageHeader from '../components/PageHeader';
import {
  MEASUREMENT_GROUPS,
  emptyMeasurements,
  formatMeasurement,
  formatShape,
  idsOf,
  measure,
  sidedId,
} from '../cv/measurements';
import { createRecorder } from '../cv/recording';
import type { HandFrame, PoseFrame, Side } from '../cv/types';
import type { MeasurementGroup, MeasurementRow, Measurements } from '../cv/measurements';
import type { Recorder, Recording, Summary } from '../cv/recording';

/**
 * The page that turns spec authoring from guesswork into measurement.
 *
 * Every threshold in `docs/PLAN.md` was inferred from the t.63 illustrations,
 * which are drawings. This page exists so that none of them has to stay a guess:
 * stand in front of the camera, perform a signal correctly, record the hold, and
 * write the measured band into the spec. Stages 11 and 12 are gated on it.
 *
 * The numbers themselves live in `cv/measurements.ts`; this file is the surface
 * that shows them, records a few seconds of them, and says what they mean.
 */

/**
 * How often the readout re-renders. Detection runs at ~22 fps, and re-rendering
 * a sixty-row table that fast is both unreadable and pointless work. Five
 * updates a second is fast enough to feel live and slow enough to read a number
 * off. Recording is unaffected — it takes every frame.
 */
const READOUT_INTERVAL_MS = 200;

/**
 * Length of a recording. t.63 asks for a signal held 1–2 seconds, so four gives
 * time to settle into the pose and still hold it for the duration that counts.
 */
const RECORD_MS = 4000;

/**
 * Right first: specs are authored for the right arm and mirrored onto the left,
 * so the right-hand numbers are the ones being read off and written down.
 */
const COLUMNS: readonly Side[] = ['right', 'left'];

type RecordPhase =
  | { phase: 'idle' }
  | { phase: 'recording'; elapsedMs: number }
  | { phase: 'done'; recording: Recording };

function formatSummary(summary: Summary | null | undefined, row: MeasurementRow): string {
  if (!summary) return 'no samples';
  const value = (n: number) => formatMeasurement(n, row.unit);
  return `${value(summary.min)} · ${value(summary.median)} · ${value(summary.max)}`;
}

interface ValueCellProps {
  value: number | null;
  summary: Summary | null | undefined;
  row: MeasurementRow;
}

function ValueCell({ value, summary, row }: ValueCellProps) {
  return (
    <td className="py-2 pr-4 align-top tabular-nums">
      <div>{formatMeasurement(value, row.unit)}</div>
      {summary !== undefined ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {formatSummary(summary, row)}
        </div>
      ) : null}
    </td>
  );
}

interface GroupTableProps {
  group: MeasurementGroup;
  measurements: Measurements;
  recording: Recording | null;
}

function GroupTable({ group, measurements, recording }: GroupTableProps) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {group.label}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{group.note}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-md border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-slate-200 text-sm uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Measurement</th>
              {COLUMNS.map((side) => (
                <th key={side} className="py-2 pr-4 font-medium">
                  your {side}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {group.rows.map((row) => {
              const ids = idsOf(row);
              return (
                <tr key={ids[0]} className="border-b border-slate-100 dark:border-slate-800/60">
                  <th scope="row" className="py-2 pr-4 font-sans font-normal align-top">
                    <span className="font-medium">{row.label}</span>
                    {row.hint ? (
                      <span className="block text-sm text-slate-500 dark:text-slate-400">
                        {row.hint}
                      </span>
                    ) : null}
                  </th>
                  {row.kind === 'sided' ? (
                    COLUMNS.map((side) => {
                      const id = sidedId(row.base, side);
                      return (
                        <ValueCell
                          key={id}
                          row={row}
                          value={measurements.values[id]}
                          summary={recording ? recording.stats[id] : undefined}
                        />
                      );
                    })
                  ) : (
                    // One value for the whole body, so it spans both columns
                    // rather than being duplicated or arbitrarily left-aligned.
                    <td className="py-2 pr-4 align-top tabular-nums" colSpan={COLUMNS.length}>
                      <div>{formatMeasurement(measurements.values[row.id], row.unit)}</div>
                      {recording ? (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {formatSummary(recording.stats[row.id], row)}
                        </div>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {group.id === 'hand' ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {`Classified shape — ${COLUMNS.map(
            (side) => `your ${side}: ${formatShape(measurements.shapes[side])}`
          ).join(' · ')}`}
        </p>
      ) : null}
    </section>
  );
}

export default function Calibrate() {
  const lastReadoutRef = useRef(0);
  const recorderRef = useRef<Recorder | null>(null);

  const [measurements, setMeasurements] = useState<Measurements>(emptyMeasurements);
  const [record, setRecord] = useState<RecordPhase>({ phase: 'idle' });

  /**
   * Measuring costs a few dozen arithmetic operations, so it is done per frame
   * while recording and only on the readout tick otherwise — the recording needs
   * every frame it can get to make its spread meaningful, and the table does not.
   */
  const onFrame = useCallback((frame: PoseFrame, handFrame: HandFrame | null) => {
    const recorder = recorderRef.current;
    const dueForReadout = frame.timestampMs - lastReadoutRef.current >= READOUT_INTERVAL_MS;
    if (!recorder && !dueForReadout) return;

    const measured = measure(frame.world, handFrame);

    if (recorder) {
      recorder.push(measured.values, frame.timestampMs);
      if (recorder.elapsedMs >= RECORD_MS) {
        recorderRef.current = null;
        setRecord({ phase: 'done', recording: recorder.finish() });
      } else if (dueForReadout) {
        setRecord({ phase: 'recording', elapsedMs: recorder.elapsedMs });
      }
    }

    if (dueForReadout) {
      lastReadoutRef.current = frame.timestampMs;
      setMeasurements(measured);
    }
  }, []);

  const startRecording = useCallback(() => {
    recorderRef.current = createRecorder();
    setRecord({ phase: 'recording', elapsedMs: 0 });
  }, []);

  const clearRecording = useCallback(() => {
    recorderRef.current = null;
    setRecord({ phase: 'idle' });
  }, []);

  /**
   * The camera stopping ends the session the numbers came from. Keeping the last
   * frame's values on screen would leave a stale pose looking live, and a
   * half-finished recording would sit at "recording…" forever; a completed one
   * is still worth reading, so it stays.
   */
  const onRunningChange = useCallback((running: boolean) => {
    if (running) return;
    setMeasurements(emptyMeasurements());
    if (recorderRef.current) {
      recorderRef.current = null;
      setRecord({ phase: 'idle' });
    }
  }, []);

  const recording = record.phase === 'done' ? record.recording : null;

  return (
    <>
      <PageHeader
        title="Calibrate"
        lede="Live readouts of every quantity the signal specs reference. Perform a signal correctly, record the hold, and write the measured numbers into the spec — the thresholds in the plan were read off illustrations and are only estimates until they have been through this page."
      />

      <CameraStage onFrame={onFrame} onRunningChange={onRunningChange} needsHands>
        {record.phase === 'recording' ? (
          <>
            <span
              role="status"
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Recording… {(record.elapsedMs / 1000).toFixed(1)} s
            </span>
            {/*
              The clock only advances on frames that produced a pose, so a
              recording started with nobody in shot would otherwise sit here
              forever with no way out but stopping the camera.
            */}
            <button
              type="button"
              onClick={clearRecording}
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
        {recording ? (
          <button
            type="button"
            onClick={clearRecording}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Clear recording
          </button>
        ) : null}
      </CameraStage>

      <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        The view is mirrored, as a referee practising in front of a screen expects. Sides are read
        from anatomy rather than screen position, so a signal made with your right arm is graded as
        a right-arm signal wherever it appears in the frame. Check that now: raise your right arm,
        and the limb the overlay draws in cyan — and the &ldquo;your right&rdquo; column below — are
        the ones that should move.
      </p>

      {recording ? (
        <p
          role="status"
          className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          Recorded {recording.frames} frames over {(recording.durationMs / 1000).toFixed(1)} s. The
          smaller line in each cell is <strong>min · median · max</strong> across that hold. Take
          the median as the centre of a band and the spread as the tolerance it needs — a number
          that wandered ten degrees while you held still needs a band wider than ten degrees.
        </p>
      ) : null}

      {MEASUREMENT_GROUPS.map((group) => (
        <GroupTable
          key={group.id}
          group={group}
          measurements={measurements}
          recording={recording}
        />
      ))}
    </>
  );
}
