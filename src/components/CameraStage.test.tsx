import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CameraStage from './CameraStage';
import { LandmarkerError } from '../cv/landmarker';

/**
 * The real module pulls in the MediaPipe WASM runtime, which jsdom cannot host.
 * `LandmarkerError` stays real — classification depends on `instanceof`.
 */
const getPoseDetector = vi.hoisted(() => vi.fn());
vi.mock('../cv/landmarker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cv/landmarker')>();
  return { ...actual, getPoseDetector };
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

beforeAll(() => {
  // jsdom implements neither of these on HTMLMediaElement.
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    writable: true,
    value: null,
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

beforeEach(() => {
  getUserMedia.mockReset();
  getPoseDetector.mockReset().mockResolvedValue({ detect: () => null });
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
