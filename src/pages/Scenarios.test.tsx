import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Scenarios from './Scenarios';
import { COUNTDOWN_MS } from '../scenario/engine';
import type { HandFrame, PoseFrame, WorldPoint } from '../cv/types';
import { ARM_DOWN, ARM_LATERAL, makePose } from '../test/poseFixtures';
import type { ArmSpec } from '../test/poseFixtures';
import { OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';

/** As in CameraStage/PracticeSignals: jsdom cannot host the WASM runtime. */
const { getPoseDetector, getHandDetector } = vi.hoisted(() => ({
  getPoseDetector: vi.fn(),
  getHandDetector: vi.fn(),
}));
vi.mock('../cv/landmarker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cv/landmarker')>();
  return { ...actual, getPoseDetector, getHandDetector };
});

const getUserMedia = vi.fn();

/* -------------------------------------------------------------------------- */
/* Poses — the same fixtures specs.test.ts uses to author Attack/Hit scored,   */
/* plus the Double hit pose reused from poseFixtures' own doc comment.        */
/* -------------------------------------------------------------------------- */

const REST = makePose({ arms: { right: ARM_DOWN, left: ARM_DOWN } });
const ATTACK_ARM: ArmSpec = {
  upper: { elevation: -5, azimuth: 55 },
  forearm: { elevation: 5, azimuth: 95 },
};
const HIT_SCORED_ARM: ArmSpec = {
  upper: { elevation: 15, azimuth: 65 },
  forearm: { elevation: 85, azimuth: 40 },
};
const ATTACK_RIGHT = makePose({ arms: { right: ATTACK_ARM, left: ARM_DOWN } });
const HIT_SCORED_RIGHT = makePose({ arms: { right: HIT_SCORED_ARM, left: ARM_DOWN } });
const DOUBLE_HIT = makePose({ arms: { right: ARM_LATERAL, left: ARM_LATERAL } });

let pose: WorldPoint[] = REST;

function poseFrame(timestampMs: number): PoseFrame {
  return {
    screen: pose.map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })),
    world: pose,
    timestampMs,
  };
}

/** Open palms, so hand-reading signals in the pool are gradeable too. */
function handFrame(timestampMs: number): HandFrame {
  return {
    hands: [
      {
        screen: makeHandScreen(0.4, 0.5),
        world: makeHand(OPEN_PALM),
        side: 'right',
        handedness: 'Left',
        score: 0.95,
      },
      {
        screen: makeHandScreen(0.6, 0.5),
        world: makeHand(OPEN_PALM),
        side: 'left',
        handedness: 'Right',
        score: 0.95,
      },
    ],
    timestampMs,
  };
}

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

/** Steps the detection loop by hand; see CameraStage.test.tsx. */
function driveAnimationFrames() {
  let pending: FrameRequestCallback | null = null;
  let now = 0;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    /** Holds `next` for `ms`, at roughly detection rate. */
    async hold(next: WorldPoint[], ms: number) {
      pose = next;
      await act(async () => {
        for (let elapsed = 0; elapsed < ms; elapsed += 50) {
          now += 50;
          const callback = pending;
          pending = null;
          callback?.(now);
        }
      });
    },
  };
}

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { writable: true, value: null });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { value: 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 720 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { value: 640 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { value: 360 });
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
  }) as unknown as HTMLCanvasElement['getContext'];
});

beforeEach(() => {
  pose = REST;
  localStorage.clear();
  getUserMedia.mockReset().mockResolvedValue(fakeStream());
  getPoseDetector
    .mockReset()
    .mockResolvedValue({ detect: (_: unknown, ts: number) => poseFrame(ts) });
  getHandDetector
    .mockReset()
    .mockResolvedValue({ detect: (_: unknown, ts: number) => handFrame(ts) });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Opens a scenario from the bank. The card click is also the gesture the camera
 * permission prompt needs, so the camera comes up on the back of it — no
 * "Start camera" button is ever shown here.
 */
async function openScenario(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name }));
  await screen.findByRole('button', { name: /stop camera/i });
  expect(screen.queryByRole('button', { name: /start camera/i })).not.toBeInTheDocument();
}

/**
 * Arms the call and runs the five-second countdown out on rest frames. The
 * countdown is ticked by camera frames, so this is also what proves the clock
 * behind it is the detection loop's.
 */
async function armAndGetReady(clock: { hold: (pose: WorldPoint[], ms: number) => Promise<void> }) {
  await userEvent.click(screen.getByRole('button', { name: /play the phrase/i }));
  expect(screen.getByRole('status')).toHaveTextContent(/starts in 5/i);
  await clock.hold(REST, COUNTDOWN_MS + 50);
}

/**
 * The scenario clip, told apart from the camera's own `<video>` by its `src` —
 * the camera attaches a stream through `srcObject` and sets no attribute.
 * `play` is stubbed on the prototype for every media element, so watching the
 * clip's own playback means giving it its own spy.
 */
function clipVideo(): HTMLVideoElement {
  const clip = document.querySelector<HTMLVideoElement>('video[src]');
  if (!clip) throw new Error('the scenario clip is not mounted');
  return clip;
}

function spyOnClipPlayback() {
  const play = vi.fn().mockResolvedValue(undefined);
  clipVideo().play = play;
  return play;
}

function callsList(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

describe('Scenarios bank', () => {
  it('shows the whole bank by default and narrows it by weapon filter', async () => {
    render(<Scenarios />);

    expect(
      screen.getByRole('button', { name: /Both lights, inside the lockout/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Attack right, parry-riposte left/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Attack right, unopposed/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Épée' }));

    expect(
      screen.getByRole('button', { name: /Both lights, inside the lockout/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Attack right, parry-riposte left/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Attack right, unopposed/ })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: /Attack right, unopposed/ })).toBeInTheDocument();
  });
});

describe('ready → countdown → live → graded', () => {
  it('counts down, rolls the clip itself, and grades a fully correct phrase', async () => {
    const clock = driveAnimationFrames();
    render(<Scenarios />);

    await openScenario(/Attack right, unopposed/);
    const play = spyOnClipPlayback();
    // The clip waits for the countdown; opening a scenario does not start it.
    expect(play).not.toHaveBeenCalled();
    // Nothing is being captured yet, so there is no readout to read.
    expect(screen.queryByText('No signal recognised yet')).not.toBeInTheDocument();

    await armAndGetReady(clock);

    // Zero: the page starts playback, and the capture window is open.
    expect(play).toHaveBeenCalled();
    expect(screen.getByText('No signal recognised yet')).toBeInTheDocument();

    await clock.hold(ATTACK_RIGHT, 1400);
    await clock.hold(REST, 400);
    expect(callsList()).toEqual([expect.stringMatching(/1\.\s*Attack — right arm/)]);

    // A replay mid-call must not reset or re-arm anything.
    await userEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(callsList()).toHaveLength(1);

    await clock.hold(HIT_SCORED_RIGHT, 1400);
    await clock.hold(REST, 400);
    expect(callsList()).toEqual([
      expect.stringMatching(/1\.\s*Attack — right arm/),
      expect.stringMatching(/2\.\s*Hit scored — right arm/),
    ]);

    await userEvent.click(screen.getByRole('button', { name: /submit call/i }));

    expect(screen.getByRole('heading', { name: '2/2 correct' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(/Attack with your right arm — correct\./)).toBeInTheDocument();
    expect(screen.getByText(/Hit scored with your right arm — correct\./)).toBeInTheDocument();

    // Try again is ready for another attempt with the camera still live — no
    // second permission prompt, and the arm button back.
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('button', { name: /play the phrase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop camera/i })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  /**
   * The countdown exists so that finding your framing is not mistaken for a
   * call. A signal held all the way through it must be worth nothing.
   */
  it('captures nothing held during the countdown', async () => {
    const clock = driveAnimationFrames();
    render(<Scenarios />);

    await openScenario(/Attack right, unopposed/);
    await userEvent.click(screen.getByRole('button', { name: /play the phrase/i }));

    await clock.hold(ATTACK_RIGHT, COUNTDOWN_MS + 50);

    expect(screen.getByText(/nothing called yet/i)).toBeInTheDocument();
    // And the hold has to be given again, in full, from inside the window.
    await clock.hold(ATTACK_RIGHT, 1400);
    await clock.hold(REST, 400);
    expect(callsList()).toHaveLength(1);
  });

  it('drops the last call on undo before submitting', async () => {
    const clock = driveAnimationFrames();
    render(<Scenarios />);

    await openScenario(/Attack right, unopposed/);
    await armAndGetReady(clock);

    await clock.hold(ATTACK_RIGHT, 1400);
    await clock.hold(REST, 400);
    expect(callsList()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /undo last call/i }));
    expect(screen.getByText(/nothing called yet/i)).toBeInTheDocument();
  });
});

describe('the legal call vocabulary follows the weapon', () => {
  it('offers no priority signals in épée: an Attack call is not recognised', async () => {
    const clock = driveAnimationFrames();
    render(<Scenarios />);

    await openScenario(/Both lights, inside the lockout/);
    await armAndGetReady(clock);

    // Attack is excluded from épée's legal palette (data/rules.ts), so this
    // pose must never be recognised, however long it is held.
    await clock.hold(ATTACK_RIGHT, 1400);
    expect(screen.getByText('No signal recognised yet')).toBeInTheDocument();
    await clock.hold(REST, 400);
    expect(screen.getByText(/nothing called yet/i)).toBeInTheDocument();

    // Double hit is épée's own call, and still works.
    await clock.hold(DOUBLE_HIT, 1400);
    await clock.hold(REST, 400);
    expect(callsList()).toEqual([expect.stringMatching(/1\.\s*Double hit/)]);

    await userEvent.click(screen.getByRole('button', { name: /submit call/i }));
    expect(screen.getByRole('heading', { name: '1/1 correct' })).toBeInTheDocument();
  });
});
