import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ScenarioPlayer from './ScenarioPlayer';

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

describe('ScenarioPlayer', () => {
  it('reports the end of playback, but not a manual pause', async () => {
    const onEnded = vi.fn();
    render(<ScenarioPlayer src="/scenarios/foil-001.mp4" onEnded={onEnded} />);

    fireEvent.pause(video());
    expect(onEnded).not.toHaveBeenCalled();

    fireEvent.ended(video());
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('toggles the play/pause label with playback state', async () => {
    render(<ScenarioPlayer src="/scenarios/foil-001.mp4" onEnded={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    fireEvent.play(video());
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    fireEvent.pause(video());
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('replay restarts the clip from the beginning', async () => {
    render(<ScenarioPlayer src="/scenarios/foil-001.mp4" onEnded={vi.fn()} />);
    const el = video();
    el.currentTime = 7;

    await userEvent.click(screen.getByRole('button', { name: 'Replay' }));

    expect(el.currentTime).toBe(0);
    expect(el.play).toHaveBeenCalled();
  });

  it('steps forward and back by one frame, clamped to the clip', async () => {
    render(<ScenarioPlayer src="/scenarios/foil-001.mp4" onEnded={vi.fn()} />);
    const el = video();
    el.currentTime = 0;

    await userEvent.click(screen.getByRole('button', { name: 'Step back one frame' }));
    expect(el.currentTime).toBe(0); // clamped at zero, not negative

    await userEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
    expect(el.currentTime).toBeCloseTo(1 / 25, 5);
    expect(el.pause).toHaveBeenCalled();
  });

  it('toggles slow motion and sets the video playback rate', async () => {
    render(<ScenarioPlayer src="/scenarios/foil-001.mp4" onEnded={vi.fn()} />);
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
    render(<ScenarioPlayer src="/scenarios/missing.mp4" onEnded={vi.fn()} />);
    const el = video();

    fireEvent.error(el);

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn.t available locally/i);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replay' })).toBeDisabled();
  });
});
