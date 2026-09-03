import type { ExtraVerdict, ScenarioGrade, StepStatus, StepVerdict } from '../scenario/grading';
import type { Scenario } from '../scenario/schema';

/**
 * The result of a call phase: the full expected sequence — spoken-only steps
 * included, so the referee sees the whole phrase they were meant to call, not
 * just the part that was graded — each gesture step's verdict, any extra
 * calls, the score, and finally the scenario's `explanation`.
 *
 * The explanation is deliberately the last thing on the page: showing it
 * first would answer the question before the referee has seen their own
 * mistakes named.
 */

const STATUS_STYLE: Record<StepStatus, { mark: string; className: string }> = {
  correct: {
    mark: '✓',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  out_of_order: {
    mark: '⚠',
    className:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  },
  wrong_side: {
    mark: '⚠',
    className:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  },
  wrong_signal: {
    mark: '✗',
    className:
      'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  },
  missing: {
    mark: '✗',
    className:
      'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  },
};

const EXTRA_CLASS =
  'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';

interface StepRowProps {
  verdict: StepVerdict;
}

function StepRow({ verdict }: StepRowProps) {
  const style = STATUS_STYLE[verdict.status];
  return (
    <li
      data-status={verdict.status}
      className={`rounded-lg border p-3 text-base ${style.className}`}
    >
      <span aria-hidden className="mr-2 text-lg">
        {style.mark}
      </span>
      {verdict.message}
    </li>
  );
}

interface SpokenRowProps {
  say: readonly string[];
}

function SpokenRow({ say }: SpokenRowProps) {
  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-base text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <span aria-hidden className="mr-2 text-lg">
        💬
      </span>
      Spoken, not graded — “{say[0]}”
    </li>
  );
}

function ExtraRow({ verdict }: { verdict: ExtraVerdict }) {
  return (
    <li className={`rounded-lg border p-3 text-base ${EXTRA_CLASS}`}>
      <span aria-hidden className="mr-2 text-lg">
        +
      </span>
      {verdict.message}
    </li>
  );
}

interface GradeReportProps {
  scenario: Scenario;
  grade: ScenarioGrade;
  onRetry: () => void;
  onChoose: () => void;
}

export default function GradeReport({ scenario, grade, onRetry, onChoose }: GradeReportProps) {
  const percent = Math.round(grade.score * 100);

  // The full authored sequence, spoken-only steps and all — matched back up
  // against `grade.steps`, which only covers the gesture-graded ones, so each
  // step's position in that shorter list is derived rather than tracked with a
  // running counter.
  const gestureIndexes = scenario.expect.reduce<number[]>((indexes, step) => {
    const previous = indexes.length ? indexes[indexes.length - 1] : -1;
    indexes.push(step.signal === null ? previous : previous + 1);
    return indexes;
  }, []);

  const rows = scenario.expect.map((step, index) => {
    if (step.signal === null) {
      return <SpokenRow key={index} say={step.say} />;
    }
    return <StepRow key={index} verdict={grade.steps[gestureIndexes[index]]} />;
  });

  return (
    <div className="space-y-6">
      <div role="status" className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {grade.correct}/{grade.total} correct
          </h2>
          <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="space-y-2">{rows}</ol>

      {grade.extra.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Extra calls
          </h3>
          <ul className="mt-2 space-y-2">
            {grade.extra.map((verdict, index) => (
              <ExtraRow key={index} verdict={verdict} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-base text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
          What happened
        </h3>
        <p className="mt-1">{scenario.explanation}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-sky-600 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onChoose}
          className="rounded-md border border-slate-300 px-4 py-2 text-base font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Choose another scenario
        </button>
      </div>
    </div>
  );
}
