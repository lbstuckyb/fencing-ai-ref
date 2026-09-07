import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CameraStage from './CameraStage';
import { LandmarkerError } from '../cv/landmarker';
import { POSE_LANDMARK_COUNT } from '../cv/types';
import type { HandFrame, PoseFrame } from '../cv/types';

/**
 * The real module pulls in the MediaPipe WASM runtime, which jsdom cannot host.
 * `LandmarkerError` stays real — classification depends on `instanceof`.
 */
const { getPoseDetector, getHandDetector } = vi.hoisted(() => ({
  getPoseDetector: vi.fn(),
  getHandDetector: vi.fn(),
}));
vi.mock('../cv/landmarker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cv/landmarker')>();
  return { ...actual, getPoseDetector, getHandDetector };
});

const getUserMedia = vi.fn();

/** A stream whose tracks record whether they were stopped. */
function fakeStream() {
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

/** A frame of pose data — landmark values are irrelevant, arrival is the point. */
function fakeFrame(timestampMs = 0): PoseFrame {
  const points = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  return { screen: points, world: points, timestampMs };
}

/** A frame with one detected hand. Its landmarks are never read here. */
function fakeHandFrame(timestampMs = 0): HandFrame {
  return {
    hands: [{ screen: [], world: [], side: 'right', handedness: 'Left', score: 0.9 }],
    timestampMs,
  };
}

/** A 2D context stub — jsdom has no canvas backend at all. */
function stubCanvasContext() {
  const context = {
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
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    strokeStyle: '',
    fillStyle: '',
  };
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue(context) as unknown as HTMLCanvasElement['getContext'];
  return context;
}

/**
 * Replaces the animation-frame clock so the detection loop can be stepped a
 * frame at a time — the throttle is defined in milliseconds, and a test that
 * waited on the real one would be both slow and flaky.
 */
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
    /** Runs `count` animation frames `stepMs` apart. */
    advance(count: number, stepMs: number) {
      for (let i = 0; i < count; i += 1) {
        now += stepMs;
        const callback = pending;
        pending = null;
        callback?.(now);
      }
    },
  };
}

beforeAll(() => {
  // jsdom implements none of these — no media pipeline, and no layout, so a
  // canvas would otherwise report a 0x0 box and never be drawn into.
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    writable: true,
    value: null,
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { value: 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 720 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { value: 640 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { value: 360 });
});

beforeEach(() => {
  getUserMedia.mockReset();
  getPoseDetector.mockReset().mockResolvedValue({ detect: () => null });
  getHandDetector.mockReset().mockResolvedValue({ detect: () => fakeHandFrame() });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  // The component logs failures for the console-reading user; keep test output
  // readable without hiding a genuinely unexpected throw.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function startCamera() {
  await userEvent.click(screen.getByRole('button', { name: /start camera/i }));
}

describe('CameraStage', () => {
  it('does not touch the camera until the user starts it', () => {
    render(<CameraStage />);
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('runs and offers a stop control once the stream and model are ready', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    render(<CameraStage />);
    await startCamera();

    expect(await screen.findByRole('button', { name: /stop camera/i })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: 'user' }),
      })
    );
  });

  it('releases the camera device when stopped', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    render(<CameraStage />);
    await startCamera();
    await userEvent.click(await screen.findByRole('button', { name: /stop camera/i }));

    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
  });

  it('releases the camera device on unmount', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    const { unmount } = render(<CameraStage />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });
    unmount();

    expect(track.stop).toHaveBeenCalled();
  });

  /**
   * A page holding state that only means something while the camera is live —
   * a calibration recording, a drill mid-hold — needs the falling edge, whatever
   * caused it. Missing it leaves an ended session still on screen.
   */
  it('reports both edges of the running state', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const onRunningChange = vi.fn();

    render(<CameraStage onRunningChange={onRunningChange} />);
    expect(onRunningChange).not.toHaveBeenCalled();

    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });
    expect(onRunningChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: /stop camera/i }));
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
  });

  it('reports the camera stopping when it fails or the page is left', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const onRunningChange = vi.fn();

    const { unmount } = render(<CameraStage onRunningChange={onRunningChange} />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    unmount();
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
  });

  it('explains a denied permission and offers a retry', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    render(<CameraStage />);
    await startCamera();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/permission was denied/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('reports an absent camera distinctly from a denied one', async () => {
    getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'));

    render(<CameraStage />);
    await startCamera();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no camera found/i);
  });

  it('reports a camera held by another application', async () => {
    getUserMedia.mockRejectedValue(new DOMException('busy', 'NotReadableError'));

    render(<CameraStage />);
    await startCamera();

    expect(await screen.findByRole('alert')).toHaveTextContent(/camera is in use/i);
  });

  it('reports an insecure context and does not offer a pointless retry', async () => {
    // Browsers omit mediaDevices entirely on a non-secure origin.
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });

    render(<CameraStage />);
    await startCamera();

    expect(await screen.findByRole('alert')).toHaveTextContent(/secure context/i);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('names the fix when the vendored model is missing, and frees the stream', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    getPoseDetector.mockRejectedValue(
      new LandmarkerError('assets-missing', 'The pose model is not present.')
    );

    render(<CameraStage />);
    await startCamera();

    expect(await screen.findByRole('alert')).toHaveTextContent(/npm run fetch-assets/i);
    // A model failure must not leave the camera light on.
    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });

  it('distinguishes a runtime model failure from a missing asset', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    getPoseDetector.mockRejectedValue(new LandmarkerError('runtime', 'init failed'));

    render(<CameraStage />);
    await startCamera();

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to start/i);
  });
});

/**
 * `autoStart` is for a page whose own opening gesture already asked for the
 * camera — /scenarios' card click. It moves which act starts the camera; it
 * must not weaken anything else, least of all the failure handling.
 */
describe('CameraStage autoStart', () => {
  it('runs without a click, and never offers the start button', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    render(<CameraStage autoStart />);

    expect(await screen.findByRole('button', { name: /stop camera/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start camera/i })).not.toBeInTheDocument();
  });

  it('lands on the same failure panel, with the retry still on offer', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    render(<CameraStage autoStart />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('stays stopped once the user stops it', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    render(<CameraStage autoStart />);
    await userEvent.click(await screen.findByRole('button', { name: /stop camera/i }));

    expect(track.stop).toHaveBeenCalled();
    // Back to the manual panel rather than being restarted by the effect.
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe('CameraStage compact', () => {
  beforeEach(() => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    stubCanvasContext();
  });

  it('drops the fps numbers but keeps the mirror legend', async () => {
    getPoseDetector.mockResolvedValue({ detect: () => fakeFrame() });
    const clock = driveAnimationFrames();

    render(<CameraStage compact />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    // A full second of frames, so the stats readout has something to report.
    await act(async () => {
      clock.advance(30, 40);
    });

    expect(screen.queryByText(/fps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/landmarks/i)).not.toBeInTheDocument();
    // Side decides `wrong_side` in scenario grading, so the mirror check is
    // more load-bearing in a self-view than less.
    expect(screen.getByText('your right')).toBeInTheDocument();
    expect(screen.getByText('your left')).toBeInTheDocument();
  });

  it('still warns when nobody is in shot', async () => {
    getPoseDetector.mockResolvedValue({ detect: () => null });
    const clock = driveAnimationFrames();

    render(<CameraStage compact />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    await act(async () => {
      clock.advance(30, 40);
    });

    expect(screen.getByText(/no pose in frame/i)).toBeInTheDocument();
  });
});

describe('CameraStage detection loop', () => {
  beforeEach(() => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
  });

  it('reports every detected frame and draws the skeleton over the video', async () => {
    const detect = vi.fn(() => fakeFrame());
    getPoseDetector.mockResolvedValue({ detect });
    const context = stubCanvasContext();
    const clock = driveAnimationFrames();
    const onFrame = vi.fn();

    render(<CameraStage onFrame={onFrame} />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    clock.advance(4, 100);

    expect(detect).toHaveBeenCalledTimes(4);
    expect(onFrame).toHaveBeenCalledTimes(4);
    expect(context.stroke).toHaveBeenCalled();
    // Registration: the canvas is drawn in CSS pixels, scaled by the ratio
    // between its backing store and its box.
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('throttles inference well below the animation frame rate', async () => {
    const detect = vi.fn(() => fakeFrame());
    getPoseDetector.mockResolvedValue({ detect });
    stubCanvasContext();
    const clock = driveAnimationFrames();

    render(<CameraStage />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    // One second of 60 Hz frames.
    clock.advance(60, 1000 / 60);

    expect(detect.mock.calls.length).toBeGreaterThanOrEqual(20);
    expect(detect.mock.calls.length).toBeLessThanOrEqual(24);
  });

  it('clears the overlay when the referee leaves the frame', async () => {
    const detect = vi.fn<() => PoseFrame | null>(() => fakeFrame());
    getPoseDetector.mockResolvedValue({ detect });
    const context = stubCanvasContext();
    const clock = driveAnimationFrames();

    render(<CameraStage />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    clock.advance(1, 100);
    expect(context.clearRect).toHaveBeenCalledTimes(1);

    // Tracking lost: the last skeleton must be wiped rather than left frozen
    // over a body that has moved on.
    detect.mockReturnValue(null);
    clock.advance(1, 100);
    expect(context.clearRect).toHaveBeenCalledTimes(2);

    // With nothing drawn, further empty frames do no canvas work at all.
    clock.advance(2, 100);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
  });

  it('leaves the canvas alone when the skeleton is switched off', async () => {
    const detect = vi.fn(() => fakeFrame());
    getPoseDetector.mockResolvedValue({ detect });
    const context = stubCanvasContext();
    const clock = driveAnimationFrames();
    const onFrame = vi.fn();

    render(<CameraStage showSkeleton={false} onFrame={onFrame} />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    clock.advance(4, 100);

    expect(onFrame).toHaveBeenCalledTimes(4);
    expect(context.stroke).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  });
});

/**
 * The hand model is a second inference per frame and a second 7.8 MB download,
 * and only three of the ten signals need it. What these check is that the cost
 * is genuinely tied to `needsHands` rather than merely intended to be.
 */
describe('CameraStage hand detection', () => {
  beforeEach(() => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    getPoseDetector.mockResolvedValue({ detect: () => fakeFrame() });
    stubCanvasContext();
  });

  it('does not load or run the hand model unless a spec asks for it', async () => {
    const clock = driveAnimationFrames();
    const onFrame = vi.fn();

    render(<CameraStage onFrame={onFrame} />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });
    clock.advance(4, 100);

    expect(getHandDetector).not.toHaveBeenCalled();
    expect(onFrame).toHaveBeenLastCalledWith(expect.anything(), null);
  });

  it('runs the hand model and passes the hands alongside the pose', async () => {
    const handDetect = vi.fn(() => fakeHandFrame());
    getHandDetector.mockResolvedValue({ detect: handDetect });
    const clock = driveAnimationFrames();
    const onFrame = vi.fn();

    render(<CameraStage needsHands onFrame={onFrame} />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });
    // The model loads asynchronously once the camera is running.
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());

    clock.advance(4, 100);

    expect(handDetect).toHaveBeenCalledTimes(4);
    // Sides are resolved against the pose, so the pose frame has to reach it.
    expect(handDetect).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(Number),
      expect.objectContaining({ world: expect.anything() })
    );
    expect(onFrame).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ hands: expect.any(Array) })
    );
  });

  it('skips hand inference on a frame with no pose in it', async () => {
    const handDetect = vi.fn(() => fakeHandFrame());
    getHandDetector.mockResolvedValue({ detect: handDetect });
    getPoseDetector.mockResolvedValue({ detect: () => null });
    const clock = driveAnimationFrames();

    render(<CameraStage needsHands />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });
    await waitFor(() => expect(getHandDetector).toHaveBeenCalled());

    clock.advance(4, 100);

    expect(handDetect).not.toHaveBeenCalled();
  });

  /**
   * A missing hand model must not cost the user their camera: arm geometry is
   * still gradeable, and the seven signals that need no finger detail work
   * exactly as before.
   */
  it('keeps the camera running when the hand model fails to load', async () => {
    getHandDetector.mockRejectedValue(new LandmarkerError('assets-missing', 'nope'));
    const clock = driveAnimationFrames();
    const onFrame = vi.fn();

    render(<CameraStage needsHands onFrame={onFrame} />);
    await startCamera();
    await screen.findByRole('button', { name: /stop camera/i });

    expect(await screen.findByRole('status')).toHaveTextContent(/hand detail is unavailable/i);
    expect(screen.getByRole('button', { name: /stop camera/i })).toBeInTheDocument();

    clock.advance(4, 100);
    expect(onFrame).toHaveBeenCalledTimes(4);
    expect(onFrame).toHaveBeenLastCalledWith(expect.anything(), null);
  });
});
