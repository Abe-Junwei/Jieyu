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
});
