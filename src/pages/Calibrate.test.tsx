import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Calibrate from './Calibrate';
import type { HandFrame, PoseFrame } from '../cv/types';
import { ARM_LATERAL, makePose } from '../test/poseFixtures';
import { OPEN_PALM, makeHand, makeHandScreen } from '../test/handFixtures';

/** As in the CameraStage tests: jsdom cannot host the MediaPipe WASM runtime. */
const { getPoseDetector, getHandDetector } = vi.hoisted(() => ({
  getPoseDetector: vi.fn(),
  getHandDetector: vi.fn(),
}));
vi.mock('../cv/landmarker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cv/landmarker')>();
  return { ...actual, getPoseDetector, getHandDetector };
});

const getUserMedia = vi.fn();

/**
 * A referee holding their right arm straight out to the side — the Hit against
 * pose, and one whose true numbers are known exactly: 90° of abduction, a
 * straight elbow, the wrist level with the shoulder.
 */
const POSE = makePose({ arms: { right: ARM_LATERAL } });

function poseFrame(timestampMs: number): PoseFrame {
  return {
    screen: POSE.map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })),
    world: POSE,
    timestampMs,
  };
}

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
    ],
    timestampMs,
  };
}

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return {
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
    track,
  };
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
    /** Runs `count` frames `stepMs` apart, flushing the renders they cause. */
    async advance(count: number, stepMs: number) {
      await act(async () => {
        for (let i = 0; i < count; i += 1) {
          now += stepMs;
          const callback = pending;
          pending = null;
          callback?.(now);
        }
      });
    },
  };
}

/** The value cell for a row, by the row's label. */
function cellFor(label: string, column: 'right' | 'left'): HTMLElement {
  const row = screen.getByRole('row', { name: new RegExp(label, 'i') });
  const cells = within(row).getAllByRole('cell');
  return column === 'right' ? cells[0] : cells[1];
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
  getUserMedia.mockReset().mockResolvedValue(fakeStream().stream);
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
  await waitFor(() => expect(getHandDetector).toHaveBeenCalled());
}

describe('Calibrate', () => {
  it('lists every measurement before the camera has been started', () => {
    render(<Calibrate />);

    // The page is readable as documentation with nothing running: the rows say
    // what will be measured and what each number means.
    expect(screen.getByRole('row', { name: /elbow/i })).toHaveTextContent(/180 straight/i);
    expect(screen.getByRole('row', { name: /height vs\. nose/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /off square to camera/i })).toBeInTheDocument();
    expect(cellFor('elbow', 'right')).toHaveTextContent('—');
  });

  it('reads the live pose into the anatomically-correct column', async () => {
    const clock = driveAnimationFrames();
    render(<Calibrate />);
    await startCamera();
    await clock.advance(10, 50);

    // The fixture holds only the right arm out; the mirror trap in test form.
    expect(cellFor('elbow', 'right')).toHaveTextContent('180°');
    expect(cellFor('upper arm abduction', 'right')).toHaveTextContent('90°');
    expect(cellFor('upper arm abduction', 'left')).toHaveTextContent('0°');
    expect(cellFor('height vs. shoulder', 'right')).toHaveTextContent('0.00');
  });

  it('reports hand shape for the hand it can see', async () => {
    const clock = driveAnimationFrames();
    render(<Calibrate />);
    await startCamera();
    await clock.advance(10, 50);

    const shapes = screen.getByText(/classified shape/i);
    expect(shapes).toHaveTextContent(/your right: open palm/i);
    // Only one hand is in shot, and the other must say so rather than guess.
    expect(shapes).toHaveTextContent(/your left: not detected/i);
  });

  it('records a hold and reports its spread', async () => {
    const clock = driveAnimationFrames();
    render(<Calibrate />);
    await startCamera();

    await userEvent.click(screen.getByRole('button', { name: /record 4 s/i }));
    await clock.advance(20, 50);
    expect(screen.getByText(/recording…/i)).toBeInTheDocument();

    // Past the four seconds the recording covers.
    await clock.advance(70, 50);

    expect(screen.getByText(/recorded \d+ frames/i)).toBeInTheDocument();
    // A perfectly still fixture: min, median and max all agree, which is exactly
    // what a real hold will not do.
    expect(cellFor('elbow', 'right')).toHaveTextContent('180° · 180° · 180°');
    expect(screen.getByRole('button', { name: /clear recording/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear recording/i }));
    expect(screen.queryByText(/recorded \d+ frames/i)).not.toBeInTheDocument();
  });

  it('can abandon a recording in progress', async () => {
    // The recording clock only advances on frames that produced a pose, so one
    // started with nobody in shot needs a way out that is not stopping the
    // camera.
    const clock = driveAnimationFrames();
    getPoseDetector.mockResolvedValue({ detect: () => null });
    render(<Calibrate />);
    await startCamera();

    await userEvent.click(screen.getByRole('button', { name: /record 4 s/i }));
    await clock.advance(20, 50);
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByText(/recording…/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record 4 s/i })).toBeInTheDocument();
  });

  it('blanks the readouts when the camera stops', async () => {
    const clock = driveAnimationFrames();
    render(<Calibrate />);
    await startCamera();
    await clock.advance(10, 50);
    expect(cellFor('elbow', 'right')).toHaveTextContent('180°');

    await userEvent.click(screen.getByRole('button', { name: /stop camera/i }));

    // A stale pose left on screen would read as a live one, and these numbers
    // are meant to be copied into specs.
    expect(cellFor('elbow', 'right')).toHaveTextContent('—');
  });

  it('abandons a recording that the camera stop interrupted', async () => {
    const clock = driveAnimationFrames();
    render(<Calibrate />);
    await startCamera();

    await userEvent.click(screen.getByRole('button', { name: /record 4 s/i }));
    await clock.advance(20, 50);
    await userEvent.click(screen.getByRole('button', { name: /stop camera/i }));

    expect(screen.queryByText(/recording…/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recorded \d+ frames/i)).not.toBeInTheDocument();
  });
});
