import { useCallback, useRef } from 'react';
import CameraStage from '../components/CameraStage';
import ComingSoon from '../components/ComingSoon';
import PageHeader from '../components/PageHeader';
import { POSE } from '../cv/types';
import type { PoseFrame } from '../cv/types';

/** How often the dev-console detection log prints. Per-frame would be unreadable. */
const LOG_INTERVAL_MS = 1000;

export default function Calibrate() {
  const lastLogRef = useRef(0);

  /**
   * Stage 4's verification hook: proves world landmarks are arriving, and that
   * they are the *metric* set. Both wrists are printed because this is also the
   * mirror check — raise your real right hand and `right.y` should be the one
   * that climbs, regardless of which side of the mirrored image it appears on.
   */
  const onFrame = useCallback((frame: PoseFrame) => {
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

      <CameraStage onFrame={onFrame} />

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        The view is mirrored, as a referee practising in front of a screen expects. Sides are read
        from anatomy rather than screen position, so a signal made with your right arm is graded as
        a right-arm signal wherever it appears in the frame. Check it now: raise your right arm, and
        the limb the overlay draws in cyan is the one that should move.
      </p>

      <div className="mt-6">
        <ComingSoon stage="8">
          The camera, pose detection and skeleton overlay run here now. The joint-angle readouts
          still need the geometry primitives and the hand-shape classifier.
        </ComingSoon>
      </div>
    </>
  );
}
