import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startVoiceAgentRecording,
  stopVoiceAgentRecording,
} from './VoiceAgentService.recordingControls';
import type { VoiceInputService } from './VoiceInputService';

describe('VoiceAgentService recording controls', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts recording, advances duration, and registers cleanup timer', async () => {
    vi.useFakeTimers();
    let duration = 0;
    const setState = vi.fn((partial: { recordingDuration?: number }) => {
      if (typeof partial.recordingDuration === 'number') {
        duration = partial.recordingDuration;
      }
    });
    const setRecordingDurationInterval = vi.fn();
    const service = {
      startRecording: vi.fn(async () => undefined),
    } as unknown as VoiceInputService;

    await startVoiceAgentRecording({
      ensureVoiceService: vi.fn(async () => service),
      setState,
      getRecordingDuration: () => duration,
      getRecordingDurationInterval: () => null,
      setRecordingDurationInterval,
      onError: vi.fn(),
    });

    expect(service.startRecording).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith({ agentState: 'listening' });
    expect(setState).toHaveBeenCalledWith({ isRecording: true, recordingDuration: 0 });
    expect(setRecordingDurationInterval).toHaveBeenCalledWith(expect.any(Object));

    vi.advanceTimersByTime(1000);
    expect(setState).toHaveBeenLastCalledWith({ recordingDuration: 1 });
  });

  it('clears pending timer and reports errors when recording start fails', async () => {
    vi.useFakeTimers();
    const timer = setInterval(() => undefined, 1000);
    const setRecordingDurationInterval = vi.fn();
    const onError = vi.fn();
    const error = new Error('microphone denied');
    const service = {
      startRecording: vi.fn(async () => {
        throw error;
      }),
    } as unknown as VoiceInputService;

    await startVoiceAgentRecording({
      ensureVoiceService: vi.fn(async () => service),
      setState: vi.fn(),
      getRecordingDuration: () => 0,
      getRecordingDurationInterval: () => timer,
      setRecordingDurationInterval,
      onError,
    });

    expect(setRecordingDurationInterval).toHaveBeenCalledWith(null);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('stops recording after clearing duration timer and resetting state', async () => {
    vi.useFakeTimers();
    const timer = setInterval(() => undefined, 1000);
    const setState = vi.fn();
    const setRecordingDurationInterval = vi.fn();
    const service = {
      stopRecording: vi.fn(async () => undefined),
    } as unknown as VoiceInputService;

    await stopVoiceAgentRecording({
      voiceService: service,
      setState,
      getRecordingDurationInterval: () => timer,
      setRecordingDurationInterval,
    });

    expect(setRecordingDurationInterval).toHaveBeenCalledWith(null);
    expect(setState).toHaveBeenCalledWith({ isRecording: false, agentState: 'idle' });
    expect(service.stopRecording).toHaveBeenCalledTimes(1);
  });
});
