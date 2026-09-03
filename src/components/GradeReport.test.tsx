import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GradeReport from './GradeReport';
import type { CapturedCall } from '../scenario/engine';
import type { ExtraVerdict, ScenarioGrade, StepVerdict } from '../scenario/grading';
import type { Scenario } from '../scenario/schema';

/**
 * A scenario with a spoken-only step sandwiched between two gesture steps —
 * the case `gestureIndexes` exists for: `grade.steps` only covers the
 * gesture-graded ones, so the second gesture row has to read `grade.steps[1]`,
 * not `grade.steps[2]`, even though it is the third row on screen.
 */
const SCENARIO: Scenario = {
  id: 'foil-001',
  weapon: 'foil',
  video: '/scenarios/foil-001.mp4',
  title: 'Attack right, parry-riposte left',
  difficulty: 2,
  expect: [
    { signal: 'attack', side: 'right', say: ['attack'] },
    { signal: null, side: null, say: ['riposte'] },
    { signal: 'hit_scored', side: 'left', say: ['touch left'] },
  ],
  explanation: 'The attack from the right has priority; left parries it and the riposte lands.',
};

/** A single-gesture-step scenario, for cases that don't need the spoken-step offset above. */
const SINGLE_STEP_SCENARIO: Scenario = {
  id: 'sabre-001',
  weapon: 'sabre',
  video: '/scenarios/sabre-001.mp4',
  title: 'Attack right, unopposed',
  difficulty: 1,
  expect: [{ signal: 'attack', side: 'right', say: ['attack'] }],
  explanation: 'The attack from the right meets no answer and lands.',
};

function call(overrides: Partial<CapturedCall> = {}): CapturedCall {
  return {
    signal: 'attack',
    label: 'Attack',
    side: 'right',
    outcome: 'pass',
    heldMs: 1200,
    atMs: 0,
    ...overrides,
  };
}

function makeGrade(steps: StepVerdict[], extra: ExtraVerdict[] = []): ScenarioGrade {
  const correct = steps.filter((step) => step.status === 'correct').length;
  return { steps, extra, correct, total: steps.length, score: correct / steps.length };
}

describe('GradeReport', () => {
  it('shows the score, matches gesture steps to their answer-key position, and keeps the spoken step ungraded', () => {
    const attackCall = call();
    const hitCall = call({ signal: 'hit_scored', label: 'Hit scored', side: 'left' });
    const grade = makeGrade([
      {
        index: 0,
        expected: SCENARIO.expect[0] as StepVerdict['expected'],
        status: 'correct',
        call: attackCall,
        message: 'Attack with your right arm — correct.',
      },
      {
        index: 1,
        expected: SCENARIO.expect[2] as StepVerdict['expected'],
        status: 'correct',
        call: hitCall,
        message: 'Hit scored with your left arm — correct.',
      },
    ]);

    render(<GradeReport scenario={SCENARIO} grade={grade} onRetry={vi.fn()} onChoose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '2/2 correct' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    // The spoken-only middle step is shown, but carries no verdict.
    expect(screen.getByText(/Spoken, not graded — .riposte./)).toBeInTheDocument();

    expect(screen.getByText('Attack with your right arm — correct.')).toBeInTheDocument();
    expect(screen.getByText('Hit scored with your left arm — correct.')).toBeInTheDocument();

    // No extra calls made, so that section is absent entirely.
    expect(screen.queryByText('Extra calls')).not.toBeInTheDocument();

    // The explanation is shown last, after every verdict.
    expect(screen.getByText(SCENARIO.explanation)).toBeInTheDocument();
  });

  it('lists calls with no matching step under Extra calls', () => {
    const strayCall = call({ signal: 'halt', label: 'Halt', side: 'right' });
    const grade = makeGrade(
      [
        {
          index: 0,
          expected: SINGLE_STEP_SCENARIO.expect[0] as StepVerdict['expected'],
          status: 'missing',
          call: null,
          message: 'Attack with your right arm was never called.',
        },
      ],
      [{ call: strayCall, message: 'You also called Halt, which was not part of this phrase.' }]
    );

    render(
      <GradeReport
        scenario={SINGLE_STEP_SCENARIO}
        grade={grade}
        onRetry={vi.fn()}
        onChoose={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '0/1 correct' })).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Extra calls')).toBeInTheDocument();
    expect(
      screen.getByText('You also called Halt, which was not part of this phrase.')
    ).toBeInTheDocument();
  });

  it('wires the retry and choose-another buttons to their callbacks', async () => {
    const onRetry = vi.fn();
    const onChoose = vi.fn();
    const grade = makeGrade([
      {
        index: 0,
        expected: SINGLE_STEP_SCENARIO.expect[0] as StepVerdict['expected'],
        status: 'correct',
        call: call(),
        message: 'Attack with your right arm — correct.',
      },
    ]);

    render(
      <GradeReport
        scenario={SINGLE_STEP_SCENARIO}
        grade={grade}
        onRetry={onRetry}
        onChoose={onChoose}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await userEvent.click(screen.getByRole('button', { name: /choose another scenario/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
