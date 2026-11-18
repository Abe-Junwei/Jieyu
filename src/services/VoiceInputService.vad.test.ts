/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VadMonitorRuntime } from './VoiceInputService.vad';

describe('VadMonitorRuntime (#553)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not install a timer when stop wins the microphone request', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn() },
    });
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const gate: { resolve: ((stream: MediaStream) => void) | null } = { resolve: null };
    const track = { stop: vi.fn() };
    const runtime = new VadMonitorRuntime({
      createAnalysisCloneStream: () =>
        new Promise((resolve) => {
          gate.resolve = resolve;
        }),
      setSpeaking: () => {},
      emitEnergyLevel: () => {},
      stop: () => {},
      isDisposed: () => false,
      isListening: () => true,
      isIntentionalStop: () => false,
    });

    const starting = runtime.start({ vadEnabled: true });
    runtime.stop();
    gate.resolve?.({
      getTracks: () => [track as unknown as MediaStreamTrack],
      getAudioTracks: () => [track as unknown as MediaStreamTrack],
    } as MediaStream);
    await starting;

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
