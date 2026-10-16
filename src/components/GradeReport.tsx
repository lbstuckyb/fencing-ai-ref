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

const STATUS_LABEL: Record<StepStatus, string> = {
  correct: 'Correct',
  out_of_order: 'Out of order',
  wrong_side: 'Wrong arm',
  wrong_signal: 'Wrong signal',
  missing: 'Missing',
};

const ROW = 'flex items-baseline gap-4 border-b border-line py-3';
const TAG = 'caption w-28 shrink-0';

interface StepRowProps {
  verdict: StepVerdict;
}

function StepRow({ verdict }: StepRowProps) {
  const correct = verdict.status === 'correct';
  return (
    <li data-status={verdict.status} className={ROW}>
      <span className={`${TAG} ${correct ? 'text-chalk' : ''}`}>
        {STATUS_LABEL[verdict.status]}
      </span>
      <span className={correct ? 'text-lg' : 'text-lg text-chalk/70'}>{verdict.message}</span>
    </li>
  );
}

interface SpokenRowProps {
  say: readonly string[];
}

function SpokenRow({ say }: SpokenRowProps) {
  return (
    <li className={ROW}>
      <span className={TAG}>Spoken</span>
      <span className="text-lg text-mute">“{say[0]}”</span>
    </li>
  );
}

function ExtraRow({ verdict }: { verdict: ExtraVerdict }) {
  return (
    <li className={ROW}>
      <span className={TAG}>Extra</span>
      <span className="text-lg text-chalk/70">{verdict.message}</span>
    </li>
  );
}

interface GradeReportProps {
  scenario: Scenario;
  grade: ScenarioGrade;
  onRetry: () => void;
  onChoose: () => void;
  /** Moves straight on to another phrase; omitted when there is none left. */
  onNext?: () => void;
}

export default function GradeReport({
  scenario,
  grade,
  onRetry,
  onChoose,
  onNext,
}: GradeReportProps) {
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
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-8 p-5 sm:p-10 lg:flex-row lg:gap-14">
      <div role="status" className="shrink-0 animate-rise">
        <p className="display text-[clamp(6rem,20vw,15rem)] tabular-nums">{percent}%</p>
        <h2 className="caption mt-2 text-lg text-chalk">
          {grade.correct}/{grade.total} correct
        </h2>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <ol className="border-t border-line">{rows}</ol>

        {grade.extra.length > 0 ? (
          <div>
            <h3 className="caption">Extra calls</h3>
            <ul className="mt-2 border-t border-line">
              {grade.extra.map((verdict, index) => (
                <ExtraRow key={index} verdict={verdict} />
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="caption">What happened</h3>
          <p className="mt-1 text-lg">{scenario.explanation}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRetry} className="btn">
            Try again
          </button>
          <button type="button" onClick={onChoose} className="btn">
            All phrases
          </button>
          {onNext ? (
            <button type="button" onClick={onNext} className="btn btn-go ml-auto">
              Next phrase ›
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
