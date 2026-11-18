/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WakeWordDetector } from './WakeWordDetector';

describe('WakeWordDetector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects when microphone access fails (#548)', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });
    const detector = new WakeWordDetector({ onWake: () => {} });
    await expect(detector.start()).rejects.toThrow('denied');
    expect(detector.active).toBe(false);
  });

  it('does not activate a stream that arrives after stop (#547)', async () => {
    const gate: { resolve: ((stream: MediaStream) => void) | null } = { resolve: null };
    const track = { stop: vi.fn() };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              gate.resolve = resolve;
            }),
        ),
      },
    });
    const detector = new WakeWordDetector({ onWake: () => {} });
    const starting = detector.start();
    detector.stop();
    gate.resolve?.({
      getTracks: () => [track as unknown as MediaStreamTrack],
      getAudioTracks: () => [track as unknown as MediaStreamTrack],
    } as MediaStream);
    await starting;
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(detector.active).toBe(false);
  });
});
