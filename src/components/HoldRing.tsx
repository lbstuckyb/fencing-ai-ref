import type { HoldPhase } from '../signals/holdMachine';

/**
 * The t.63 hold, drawn.
 *
 * A referee cannot see how long they have held a signal, and "one to two
 * seconds" is not a duration anyone estimates well under a camera. The ring is
 * the whole of the feedback for the rule's timing criterion: it fills over the
 * required hold and turns green at the moment the requirement is met, while the
 * arm is still up.
 *
 * Purely decorative in the accessibility tree — the same information is in the
 * status text beside it, which is announced rather than watched.
 */

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TRACK: Record<HoldPhase, string> = {
  idle: 'stroke-white/20',
  forming: 'stroke-white/25',
  held: 'stroke-emerald-400/30',
  complete: 'stroke-white/20',
};

const PROGRESS: Record<HoldPhase, string> = {
  idle: 'stroke-sky-400',
  forming: 'stroke-sky-400',
  held: 'stroke-emerald-400',
  complete: 'stroke-emerald-400',
};

interface HoldRingProps {
  /** 0–1, from the hold machine. */
  progress: number;
  phase: HoldPhase;
  /**
   * Rendered size. All the geometry is in `viewBox` units, so a caller who needs
   * the ring readable from across the room only has to change this.
   */
  className?: string;
}

export default function HoldRing({ progress, phase, className = 'h-20 w-20' }: HoldRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <svg aria-hidden viewBox="0 0 80 80" className={`${className} drop-shadow`}>
      <circle cx="40" cy="40" r={RADIUS} fill="none" strokeWidth="7" className={TRACK[phase]} />
      <circle
        cx="40"
        cy="40"
        r={RADIUS}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        transform="rotate(-90 40 40)"
        className={`${PROGRESS[phase]} transition-[stroke-dashoffset] duration-100 ease-linear`}
      />
    </svg>
  );
}
