/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputSharedAnalysisStreamHandle } from './VoiceInputService.sharedAnalysisStream';

describe('VoiceInputSharedAnalysisStreamHandle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ensure resolves null when getUserMedia is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const h = new VoiceInputSharedAnalysisStreamHandle();
    await expect(h.ensure()).resolves.toBeNull();
  });

  it('release is idempotent', () => {
    const h = new VoiceInputSharedAnalysisStreamHandle();
    h.release();
    h.release();
  });

  it('reuses active stream from ensure without second getUserMedia', async () => {
    const getUserMedia = vi.fn(async () => ({
      active: true,
      getTracks: () => [],
      getAudioTracks: () => [],
    })) as unknown as typeof navigator.mediaDevices.getUserMedia;

    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const h = new VoiceInputSharedAnalysisStreamHandle();
    await h.ensure();
    await h.ensure();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('stops a stream that arrives after release (#553)', async () => {
    const gate: { resolve: ((stream: MediaStream) => void) | null } = { resolve: null };
    const track = { stop: vi.fn(), kind: 'audio' };
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              gate.resolve = resolve;
            }),
        ),
      },
    });
    const handle = new VoiceInputSharedAnalysisStreamHandle();
    const pending = handle.ensure();
    handle.release();
    gate.resolve?.({
      active: true,
      getTracks: () => [track as unknown as MediaStreamTrack],
      getAudioTracks: () => [track as unknown as MediaStreamTrack],
    } as MediaStream);
    await expect(pending).resolves.toBeNull();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
