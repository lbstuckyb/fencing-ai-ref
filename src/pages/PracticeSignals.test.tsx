import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PracticeSignals from './PracticeSignals';
import type { HandFrame, PoseFrame, WorldPoint } from '../cv/types';
import { ARM_DOWN, ARM_OVERHEAD, makePose } from '../test/poseFixtures';
import type { ArmSpec } from '../test/poseFixtures';
import { OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';

/** As in the CameraStage and Calibrate tests: jsdom cannot host the WASM runtime. */
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
/* Poses the referee can be holding                                           */
/* -------------------------------------------------------------------------- */

const REST = makePose({ arms: { right: ARM_DOWN, left: ARM_DOWN } });
const HALT_RIGHT = makePose({ arms: { right: ARM_OVERHEAD, left: ARM_DOWN } });
/** A Halt with the elbow folded — recognisably the signal, made wrong. */
const BENT_HALT = makePose({
  arms: {
    right: { upper: { elevation: 85, azimuth: 0 }, forearm: { elevation: 25, azimuth: 0 } },
    left: ARM_DOWN,
  },
});
const ATTACK_ARM: ArmSpec = {
  upper: { elevation: -5, azimuth: 55 },
  forearm: { elevation: 5, azimuth: 95 },
};
const ATTACK_LEFT = makePose({ arms: { left: ATTACK_ARM, right: ARM_DOWN } });
const ATTACK_RIGHT = makePose({ arms: { right: ATTACK_ARM, left: ARM_DOWN } });

/**
 * What the mocked detector is currently seeing. Tests set it, then advance the
 * clock: "hold this pose for a second and a half" is the whole vocabulary.
 */
let pose: WorldPoint[] = REST;

function poseFrame(timestampMs: number): PoseFrame {
  return {
    screen: pose.map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })),
    world: pose,
    timestampMs,
  };
}

/** Open palms, so the signals that read fingers can be satisfied. */
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

/** Renders pinned to one signal, which is the deep link stage 14 will use. */
function renderDrill(signal?: string) {
  const path = signal ? `/practice?signal=${signal}` : '/practice';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PracticeSignals />
    </MemoryRouter>
  );
}

async function startCamera() {
  await userEvent.click(screen.getByRole('button', { name: /start camera/i }));
  await screen.findByRole('button', { name: /stop camera/i });
}

/** The verdict panel, which carries the outcome as a data attribute. */
function verdict(): HTMLElement | null {
  return document.querySelector('[data-outcome]');
}

/** The streak counter, labelled because a `dt` names nothing to a screen reader. */
function streak(): HTMLElement {
  return screen.getByLabelText('Streak');
}

describe('PracticeSignals', () => {
  it('prompts the linked signal and describes it before the camera starts', () => {
    renderDrill('halt');

    // Both the overlay prompt and the feedback panel name it; the picker marks
    // it as the one being drilled.
    expect(screen.getAllByText('Halt').length).toBeGreaterThan(0);
    expect(screen.getByText(/start the camera to be graded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Halt/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('grades a correctly held signal and counts it', async () => {
    const clock = driveAnimationFrames();
    renderDrill('halt');
    await startCamera();
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());

    await clock.hold(HALT_RIGHT, 1400);
    // The duration requirement is met while the arm is still up.
    expect(screen.getByText(/held long enough/i)).toBeInTheDocument();

    await clock.hold(REST, 400);

    expect(verdict()).toHaveAttribute('data-outcome', 'pass');
    expect(verdict()).toHaveTextContent(/Halt — held 1\.\d s/);
    expect(streak()).toHaveTextContent('1');
  });

  it('warns when a signal is made too quickly', async () => {
    const clock = driveAnimationFrames();
    renderDrill('halt');
    await startCamera();
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());

    await clock.hold(HALT_RIGHT, 500);
    await clock.hold(REST, 400);

    // t.63's own wording, and still a pass — the rule sets a floor, not a bar.
    expect(verdict()).toHaveAttribute('data-outcome', 'quick');
    expect(verdict()).toHaveTextContent(/too quick/i);
  });

  it('names the constraint that is wrong while the signal is being made', async () => {
    const clock = driveAnimationFrames();
    renderDrill('halt');
    await startCamera();
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());

    await clock.hold(BENT_HALT, 300);

    expect(screen.getByText('Straighten your raised arm fully')).toBeInTheDocument();
    expect(verdict()).toBeNull();
  });

  it('catches a directional signal made with the wrong arm', async () => {
    const clock = driveAnimationFrames();
    renderDrill('attack');
    await startCamera();

    // Attack names a fencer, so the drill asks for a side; whichever it drew,
    // the other arm is the mistake this test is about.
    const asked = screen.getByText(/with your (left|right) arm/i).textContent!;
    const wanted = /right/i.test(asked) ? 'right' : 'left';
    const wrong = wanted === 'right' ? ATTACK_LEFT : ATTACK_RIGHT;

    await clock.hold(wrong, 1400);
    expect(screen.getByText(/that is the right signal, but on your/i)).toBeInTheDocument();

    await clock.hold(REST, 400);

    expect(verdict()).toHaveAttribute('data-outcome', 'wrong_side');
    expect(verdict()).toHaveTextContent(/wrong arm/i);
    // A wrong-arm call awards the phrase to the wrong fencer: it is a miss, and
    // the drill stays on the signal until it is made properly.
    expect(streak()).toHaveTextContent('0');
    expect(screen.getByText(asked)).toBeInTheDocument();
  });

  it('switches signals from the picker and pins the choice to the URL', async () => {
    renderDrill('halt');

    await userEvent.click(screen.getByRole('button', { name: /^Double hit/ }));

    expect(screen.getByRole('button', { name: /^Double hit/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /^Halt/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/drilling Double hit/i)).toBeInTheDocument();
  });

  it('returns to random prompts on “next signal”', async () => {
    const clock = driveAnimationFrames();
    renderDrill('halt');
    await startCamera();
    await clock.hold(REST, 100);

    await userEvent.click(screen.getByRole('button', { name: /next signal/i }));

    expect(screen.getByText(/signals come up at random/i)).toBeInTheDocument();
  });

  it('drops a hold in progress when the camera stops, keeping the score', async () => {
    const clock = driveAnimationFrames();
    renderDrill('halt');
    await startCamera();
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());

    await clock.hold(HALT_RIGHT, 1400);
    await clock.hold(REST, 400);
    expect(streak()).toHaveTextContent('1');

    // A second signal, interrupted by the stop button rather than released.
    await clock.hold(HALT_RIGHT, 1400);
    await userEvent.click(screen.getByRole('button', { name: /stop camera/i }));

    // Still one: switching the camera off is not a way to score a signal.
    expect(streak()).toHaveTextContent('1');
    expect(screen.getByText(/start the camera to be graded/i)).toBeInTheDocument();
  });

  it('loads the hand model only for the signals that read fingers', async () => {
    const clock = driveAnimationFrames();
    renderDrill('double_hit');
    await startCamera();
    await clock.hold(REST, 200);

    // Double hit is pure arm geometry, and the hand model roughly doubles the
    // per-frame cost.
    expect(getHandDetector).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^Halt/ }));
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());
  });
});
