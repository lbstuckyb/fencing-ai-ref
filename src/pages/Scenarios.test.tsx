import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Scenarios from './Scenarios';
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

async function startCamera() {
  await userEvent.click(screen.getByRole('button', { name: /start camera/i }));
  await screen.findByRole('button', { name: /stop camera/i });
}

/** Ends the currently-playing clip, which is what opens the call phase. */
function endClip() {
  const video = document.querySelector('video');
  if (!video) throw new Error('no <video> is mounted — not in the watch phase');
  fireEvent.ended(video);
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

describe('watch → call → grade', () => {
  it('plays the clip, opens the call phase on end, and grades a fully correct phrase', async () => {
    const clock = driveAnimationFrames();
    render(<Scenarios />);

    await userEvent.click(screen.getByRole('button', { name: /Attack right, unopposed/ }));
    expect(document.querySelector('video')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start camera/i })).not.toBeInTheDocument();

    endClip();
    expect(await screen.findByRole('button', { name: /start camera/i })).toBeInTheDocument();

    await startCamera();
    expect(screen.getByText('No signal recognised yet')).toBeInTheDocument();

    await clock.hold(ATTACK_RIGHT, 1400);
    await clock.hold(REST, 400);
    expect(callsList()).toEqual([expect.stringMatching(/1\.\s*Attack — right arm/)]);

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

    // Try again returns to the watch phase for another attempt at the same clip.
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('drops the last call on undo before submitting', async () => {
    const clock = driveAnimationFrames();
    render(<Scenarios />);

    await userEvent.click(screen.getByRole('button', { name: /Attack right, unopposed/ }));
    endClip();
    await startCamera();

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

    await userEvent.click(screen.getByRole('button', { name: /Both lights, inside the lockout/ }));
    endClip();
    await startCamera();

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
