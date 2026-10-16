import type { Side } from '../cv/types';
import type { HoldPhase } from '../signals/holdMachine';

/**
 * The t.63 hold, drawn.
 *
 * A referee cannot see how long they have held a signal, and "one to two
 * seconds" is not a duration anyone estimates well under a camera. The ring is
 * the whole of the feedback for the rule's timing criterion: it closes over the
 * required hold and its centre fills in at the moment the requirement is met,
 * while the arm is still up.
 *
 * Purely decorative in the accessibility tree — the same information is in the
 * status text beside it, which is announced rather than watched.
 */

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The lamp of the fencer the signal names; chalk where it names nobody. */
const TONE = {
  left: { stroke: 'stroke-lamp-red', fill: 'fill-lamp-red' },
  right: { stroke: 'stroke-lamp-green', fill: 'fill-lamp-green' },
  none: { stroke: 'stroke-chalk', fill: 'fill-chalk' },
} as const;

interface HoldRingProps {
  /** 0–1, from the hold machine. */
  progress: number;
  phase: HoldPhase;
  /**
   * Rendered size. All the geometry is in `viewBox` units, so a caller who needs
   * the ring readable from across the room only has to change this.
   */
  className?: string;
  /** The arm the signal is being made with, where that names a fencer. */
  side?: Side | null;
}

export default function HoldRing({
  progress,
  phase,
  className = 'h-20 w-20',
  side = null,
}: HoldRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const tone = TONE[side ?? 'none'];
  // The requirement being met is shown by the ring filling in, not by a change
  // of colour: colour here says which fencer, and nothing else.
  const met = phase === 'held' || phase === 'complete';

  return (
    <svg aria-hidden viewBox="0 0 80 80" className={`${className} drop-shadow`}>
      <circle cx="40" cy="40" r={RADIUS} strokeWidth="7" className="fill-ink/50 stroke-chalk/20" />
      {met ? <circle cx="40" cy="40" r="22" className={tone.fill} /> : null}
      <circle
        cx="40"
        cy="40"
        r={RADIUS}
        fill="none"
        strokeWidth="7"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        transform="rotate(-90 40 40)"
        className={`${tone.stroke} transition-[stroke-dashoffset] duration-100 ease-linear`}
      />
    </svg>
  );
}
