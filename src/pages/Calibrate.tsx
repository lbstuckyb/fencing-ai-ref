import { useCallback, useRef, useState } from 'react';
import CameraStage from '../components/CameraStage';
import ComingSoon from '../components/ComingSoon';
import PageHeader from '../components/PageHeader';
import { handForSide, handMetrics } from '../cv/hands';
import { POSE, SIDES } from '../cv/types';
import type { HandFrame, HandShape, PoseFrame, Side } from '../cv/types';
import type { HandMetrics } from '../cv/hands';

/** How often the dev-console detection log prints. Per-frame would be unreadable. */
const LOG_INTERVAL_MS = 1000;

/**
 * How often the hand readout re-renders. Detection runs at ~22 fps; re-rendering
 * that fast would be unreadable to a human and pointless work for React. Five
 * updates a second is fast enough to feel live and slow enough to read.
 */
const READOUT_INTERVAL_MS = 200;

type HandReadout = Partial<Record<Side, HandMetrics | null>>;

const SHAPE_LABELS: Record<HandShape, string> = {
  open_palm: 'open palm',
  fist: 'fist',
  index_point: 'index point',
  unknown: '—',
};

function formatRatio(ratio: number | null): string {
  return ratio === null ? '—' : ratio.toFixed(2);
}

export default function Calibrate() {
  const lastLogRef = useRef(0);
  const lastReadoutRef = useRef(0);
  const [hands, setHands] = useState<HandReadout>({});

  /**
   * Stage 4's verification hook: proves world landmarks are arriving, and that
   * they are the *metric* set. Both wrists are printed because this is also the
   * mirror check — raise your real right hand and `right.y` should be the one
   * that climbs, regardless of which side of the mirrored image it appears on.
   *
   * Stage 7 adds the hand half: shapes are measured per anatomical side, so the
   * same mirror check applies to the fingers.
   */
  const onFrame = useCallback((frame: PoseFrame, handFrame: HandFrame | null) => {
    if (frame.timestampMs - lastReadoutRef.current >= READOUT_INTERVAL_MS) {
      lastReadoutRef.current = frame.timestampMs;
      const next: HandReadout = {};
      for (const side of SIDES) {
        const hand = handFrame ? handForSide(handFrame.hands, side) : null;
        next[side] = hand ? handMetrics(hand.world) : null;
      }
      setHands(next);
    }

    if (!import.meta.env.DEV) return;
    if (frame.timestampMs - lastLogRef.current < LOG_INTERVAL_MS) return;
    lastLogRef.current = frame.timestampMs;

    const right = frame.world[POSE.RIGHT_WRIST];
    const left = frame.world[POSE.LEFT_WRIST];
    console.log(
      `[cv] ${frame.world.length} world landmarks · wrist R y=${right.y.toFixed(2)} · wrist L y=${left.y.toFixed(2)}`
    );
  }, []);

  return (
    <>
      <PageHeader
        title="Calibrate"
        lede="Live numeric readouts of every joint angle the signal specs reference. Perform a signal correctly, read the true numbers, and tune the thresholds against them."
      />

      <CameraStage onFrame={onFrame} needsHands />

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        The view is mirrored, as a referee practising in front of a screen expects. Sides are read
        from anatomy rather than screen position, so a signal made with your right arm is graded as
        a right-arm signal wherever it appears in the frame. Check it now: raise your right arm, and
        the limb the overlay draws in cyan is the one that should move.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Hand shape
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Three signals turn on finger detail: Halt&rsquo;s open palm, Point in line&rsquo;s
          extended index, and Nothing&rsquo;s flat palms. Each number is the extension ratio for
          that finger — tip-to-wrist over knuckle-to-wrist — so above roughly 1.15 is out and below
          0.95 is folded.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-md border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Hand</th>
                <th className="py-2 pr-4 font-medium">Shape</th>
                <th className="py-2 pr-4 font-medium">Index</th>
                <th className="py-2 pr-4 font-medium">Middle</th>
                <th className="py-2 pr-4 font-medium">Ring</th>
                <th className="py-2 pr-4 font-medium">Pinky</th>
                <th className="py-2 font-medium">Thumb</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {SIDES.map((side) => {
                const metrics = hands[side];
                return (
                  <tr key={side} className="border-b border-slate-100 dark:border-slate-800/60">
                    <th scope="row" className="py-2 pr-4 font-sans font-medium">
                      your {side}
                    </th>
                    <td className="py-2 pr-4">
                      {metrics ? SHAPE_LABELS[metrics.shape] : 'not detected'}
                    </td>
                    <td className="py-2 pr-4">{formatRatio(metrics?.ratios.index ?? null)}</td>
                    <td className="py-2 pr-4">{formatRatio(metrics?.ratios.middle ?? null)}</td>
                    <td className="py-2 pr-4">{formatRatio(metrics?.ratios.ring ?? null)}</td>
                    <td className="py-2 pr-4">{formatRatio(metrics?.ratios.pinky ?? null)}</td>
                    <td className="py-2">{formatRatio(metrics?.thumb.ratio ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6">
        <ComingSoon stage="8">
          The camera, pose detection, the skeleton overlay and hand-shape classification run here
          now. The joint-angle readouts and the record-and-summarise button still need building.
        </ComingSoon>
      </div>
    </>
  );
}
