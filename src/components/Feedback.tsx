import type { Attempt, DrillPrompt } from '../signals/drill';
import type { Evaluation } from '../signals/evaluator';
import type { HoldPhase } from '../signals/holdMachine';

/**
 * What the drill has to say about the gesture being made right now, and about
 * the last one that finished.
 *
 * Two panels rather than one, because they answer different questions and a
 * referee needs both at once: the verdict is *what happened*, the coaching is
 * *what to change*. Collapsing them means either the ✓ vanishing the instant the
 * arm moves, or a correction sitting under a verdict it does not belong to.
 *
 * The coaching lists the failed constraints in the evaluator's order, worst
 * first, and shows at most a few. A referee holding a badly-made signal fails
 * five constraints at once, and a list of five instructions is not coaching — it
 * is a wall. Fix the worst, and the next one is at the top.
 */

const SHOWN_REASONS = 3;

/** Verdict styling per outcome. `wrong_side` is the only one that is a miss. */
const VERDICT = {
  pass: {
    mark: '✓',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  quick: {
    mark: '⚠',
    className:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  },
  wrong_side: {
    mark: '✗',
    className:
      'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  },
} as const;

function verdictTitle(attempt: Attempt): string {
  const seconds = (attempt.heldMs / 1000).toFixed(1);
  switch (attempt.outcome) {
    case 'pass':
      return `${attempt.label} — held ${seconds} s`;
    case 'quick':
      return `${attempt.label} — too quick`;
    case 'wrong_side':
      return `${attempt.label} — wrong arm`;
  }
}

function ScoreBar({ score }: { score: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>Shape</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-100 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface FeedbackProps {
  prompt: DrillPrompt;
  /** This frame's grading of the prompted signal. */
  evaluation: Evaluation | null;
  /** The last completed attempt, or `null` if none has finished yet. */
  attempt: Attempt | null;
  /** The prompted signal made correctly, but on the other arm. */
  wrongArm: boolean;
  phase: HoldPhase;
  /** Whether the camera is running — nothing below is live without it. */
  live: boolean;
}

export default function Feedback({
  prompt,
  evaluation,
  attempt,
  wrongArm,
  phase,
  live,
}: FeedbackProps) {
  const verdict = attempt ? VERDICT[attempt.outcome] : null;

  return (
    <div className="space-y-3">
      {attempt && verdict ? (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${verdict.className}`}
          data-outcome={attempt.outcome}
        >
          <p className="font-medium">
            <span aria-hidden className="mr-1.5">
              {verdict.mark}
            </span>
            {verdictTitle(attempt)}
          </p>
          {attempt.message ? <p className="mt-1">{attempt.message}</p> : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {prompt.spec.label}
          {prompt.side ? ` — your ${prompt.side} arm` : ''}
        </h2>

        {!live ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Start the camera to be graded. {prompt.spec.description}
          </p>
        ) : evaluation === null ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Waiting for a pose — stand back far enough that your whole upper body is in frame.
          </p>
        ) : wrongArm ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            That is the right signal, but on your {evaluation.side} arm. This one names the fencer
            on your {prompt.side}.
          </p>
        ) : evaluation.pass ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
            {phase === 'held'
              ? 'Held long enough — t.63 asks for one to two seconds.'
              : 'That is the signal — hold it.'}
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
              {evaluation.failures.slice(0, SHOWN_REASONS).map((reason) => (
                <li key={reason.measure}>{reason.message}</li>
              ))}
            </ul>
            {evaluation.failures.length > SHOWN_REASONS ? (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {evaluation.failures.length - SHOWN_REASONS} more to fix after those.
              </p>
            ) : null}
            <div className="mt-3">
              <ScoreBar score={evaluation.score} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
