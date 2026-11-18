/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVoiceAgentTransportControls } from './useVoiceAgentTransportControls';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useVoiceAgentTransportControls (#545)', () => {
  it('does not restore recording state when stop wins an in-flight start', async () => {
    vi.useFakeTimers();
    let releaseStart: (() => void) | null = null;
    const setIsRecording = vi.fn();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const service = {
      isRecording: false,
      startRecording: () =>
        new Promise<void>((resolve) => {
          releaseStart = resolve;
        }),
      stopRecording: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() => {
      const serviceRef = useRef(service);
      return useVoiceAgentTransportControls({
        locale: 'zh-CN',
        listening: false,
        voiceActivateGenerationRef: useRef(0),
        exclusiveStartPromiseRef: useRef(null),
        start: async () => undefined,
        stopDictationPipeline: () => undefined,
        clearInteractionPrompts: () => undefined,
        loadVoiceSessionStoreRuntime: async () =>
          ({ saveVoiceSession: async () => undefined }) as never,
        serviceRef: serviceRef as never,
        sessionRef: useRef({ entries: [] }) as never,
        executeActionRef: useRef(() => undefined) as never,
        pendingAiResponseCountRef: useRef(0),
        recordingDurationIntervalRef: useRef(null),
        setListening: vi.fn(),
        setSpeechActive: vi.fn(),
        setInterimText: vi.fn(),
        setAgentState: vi.fn(),
        setIsRecording,
        setRecordingDuration: vi.fn(),
        setError: vi.fn(),
        setEngine: vi.fn(),
      });
    });

    let starting: Promise<void> = Promise.resolve();
    act(() => {
      starting = result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });
    service.isRecording = false;
    await act(async () => {
      releaseStart?.();
      await starting;
    });

    expect(setIsRecording).not.toHaveBeenCalledWith(true);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
