import type { Attempt, DrillPrompt } from '../signals/drill';
import type { Evaluation } from '../signals/evaluator';
import type { HoldPhase } from '../signals/holdMachine';
import Hint from './Hint';
import { t } from '../i18n';

/**
 * What the drill has to say about the gesture being made right now, and about
 * the last one that finished — as two lines over the video.
 *
 * Two lines rather than one, because they answer different questions and a
 * referee needs both at once: the verdict is *what happened*, the coaching is
 * *what to change*.
 *
 * The coaching shows the single worst failed constraint. A referee holding a
 * badly-made signal fails five at once, and five instructions read from across
 * a room are none; fix the worst, and the next one takes its place.
 */

const SIDE_TEXT = { left: 'text-lamp-red', right: 'text-lamp-green' } as const;

function verdictTitle(attempt: Attempt): string {
  const signal = attempt.label;
  switch (attempt.outcome) {
    case 'pass':
      return t('feedbackUi.held', { signal, s: (attempt.heldMs / 1000).toFixed(1) });
    case 'quick':
      return t('feedbackUi.quick', { signal });
    case 'wrong_side':
      return t('feedbackUi.wrongArm', { signal });
  }
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
}

export default function Feedback({ prompt, evaluation, attempt, wrongArm, phase }: FeedbackProps) {
  return (
    <div className="flex max-w-[min(34rem,70vw)] flex-col items-start gap-2">
      {attempt ? (
        <p
          role="status"
          data-outcome={attempt.outcome}
          className="hud pointer-events-auto flex items-center gap-2 px-3 py-1.5"
        >
          <span className="caption text-chalk">{verdictTitle(attempt)}</span>
          {attempt.message ? (
            <Hint label={t('common.why')} align="left" placement="above">
              {attempt.message}
            </Hint>
          ) : null}
        </p>
      ) : null}

      {evaluation === null ? null : wrongArm && prompt.side ? (
        <p className="hud display px-3 py-2 text-3xl sm:text-4xl">
          {t('feedbackUi.wrongArmUse')}{' '}
          <span className={SIDE_TEXT[prompt.side]}>{t(`side.arm.${prompt.side}`)}</span>
        </p>
      ) : evaluation.pass ? (
        <p className="hud display px-3 py-2 text-3xl sm:text-4xl">
          {phase === 'held' ? t('feedbackUi.holding') : t('feedbackUi.holdIt')}
        </p>
      ) : evaluation.failures.length > 0 ? (
        <p className="hud px-3 py-2 text-2xl font-medium sm:text-3xl">
          {evaluation.failures[0].message}
          <span className="caption ml-3 whitespace-nowrap">
            {t('feedbackUi.shape', {
              n: Math.round(Math.min(1, Math.max(0, evaluation.score)) * 100),
            })}
          </span>
        </p>
      ) : null}
    </div>
  );
}
