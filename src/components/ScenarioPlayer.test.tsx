import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ScenarioPlayer from './ScenarioPlayer';
import type { ScenarioPlayerHandle } from './ScenarioPlayer';

beforeAll(() => {
  // jsdom implements no media pipeline: `duration` is settable but playback
  // itself is not, so `play`/`pause` are stubbed and `currentTime` just holds
  // whatever was last assigned.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    value: 10,
  });
});

function video(): HTMLVideoElement {
  return document.querySelector('video')!;
}

/** The full transport, as the page shows it once a call is armed. */
function renderArmed(props: Partial<ComponentProps<typeof ScenarioPlayer>> = {}) {
  return render(<ScenarioPlayer src="/scenarios/foil-001.mp4" armed onArm={vi.fn()} {...props} />);
}

describe('ScenarioPlayer before the call is armed', () => {
  it('offers one button, which arms rather than playing', async () => {
    const onArm = vi.fn();
    render(<ScenarioPlayer src="/scenarios/foil-001.mp4" armed={false} onArm={onArm} />);

    // No transport at all: the clip is started by the page, at the end of its
    // countdown, not by a Play button that would jump the gun.
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /play the phrase/i }));

    expect(onArm).toHaveBeenCalledTimes(1);
    expect(video().play).not.toHaveBeenCalled();
  });

  it('cannot be armed while the camera is not running', async () => {
    const onArm = vi.fn();
    render(
      <ScenarioPlayer src="/scenarios/foil-001.mp4" armed={false} canArm={false} onArm={onArm} />
    );

    expect(screen.getByRole('button', { name: /play the phrase/i })).toBeDisabled();
    expect(onArm).not.toHaveBeenCalled();
  });

  /**
   * The placeholder clips are generated rather than committed, so a missing one
   * is the default state of a fresh checkout. Arming has to work without it, or
   * every scenario is unreachable.
   */
  it('still arms when the clip is missing', async () => {
    const onArm = vi.fn();
    render(<ScenarioPlayer src="/scenarios/missing.mp4" armed={false} onArm={onArm} />);

    fireEvent.error(video());

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn.t available locally/i);
    const arm = screen.getByRole('button', { name: /get ready to call/i });
    expect(arm).toBeEnabled();

    await userEvent.click(arm);
    expect(onArm).toHaveBeenCalledTimes(1);
  });

  it('shows the transport, not the arm button, once armed', () => {
    renderArmed();
    expect(screen.queryByRole('button', { name: /play the phrase/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});

describe('ScenarioPlayer transport', () => {
  it('plays from the top on demand through its ref, so the page can roll the clip itself', () => {
    const ref = createRef<ScenarioPlayerHandle>();
    renderArmed({ ref });
    // Where a previous attempt left it — a retry starts the phrase again, it
    // does not resume.
    video().currentTime = 7;

    ref.current!.play();

    expect(video().currentTime).toBe(0);
    expect(video().play).toHaveBeenCalled();
  });

  it('reports the end of playback, but not a manual pause', () => {
    const onEnded = vi.fn();
    renderArmed({ onEnded });

    fireEvent.pause(video());
    expect(onEnded).not.toHaveBeenCalled();

    fireEvent.ended(video());
    expect(onEnded).toHaveBeenCalledTimes(1);
    // A hint only: the call is still open, and replaying is expected.
    expect(screen.getByText(/still being captured/i)).toBeInTheDocument();
  });

  it('toggles the play/pause label with playback state', () => {
    renderArmed();

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    fireEvent.play(video());
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    fireEvent.pause(video());
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('replay restarts the clip from the beginning', async () => {
    renderArmed();
    const el = video();
    el.currentTime = 7;

    await userEvent.click(screen.getByRole('button', { name: 'Replay' }));

    expect(el.currentTime).toBe(0);
    expect(el.play).toHaveBeenCalled();
  });

  it('steps forward and back by one frame, clamped to the clip', async () => {
    renderArmed();
    const el = video();
    el.currentTime = 0;

    await userEvent.click(screen.getByRole('button', { name: 'Step back one frame' }));
    expect(el.currentTime).toBe(0); // clamped at zero, not negative

    await userEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
    expect(el.currentTime).toBeCloseTo(1 / 25, 5);
    expect(el.pause).toHaveBeenCalled();
  });

  it('toggles slow motion and sets the video playback rate', async () => {
    renderArmed();
    const el = video();
    const toggle = screen.getByRole('button', { name: /slow motion/i });

    expect(toggle).toHaveTextContent('Slow motion: off');
    expect(el.playbackRate).toBe(1);

    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent('Slow motion: on');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(el.playbackRate).toBe(0.35);

    await userEvent.click(toggle);
    expect(el.playbackRate).toBe(1);
  });

  it('falls back to a message and disables the transport when the clip fails to load', async () => {
    render(<ScenarioPlayer src="/scenarios/missing.mp4" armed onArm={vi.fn()} />);

    fireEvent.error(video());

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn.t available locally/i);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replay' })).toBeDisabled();
  });
});
