// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { recordingStartFailureDictKey, useRecording } from './useRecording';

describe('recordingStartFailureDictKey', () => {
  it('maps NotAllowedError to mic permission key', () => {
    expect(
      recordingStartFailureDictKey(new DOMException('Permission denied', 'NotAllowedError')),
    ).toBe('transcription.timeline.audio.error.micPermissionDenied');
  });

  it('maps NotFoundError', () => {
    expect(
      recordingStartFailureDictKey(new DOMException('Requested device not found', 'NotFoundError')),
    ).toBe('transcription.timeline.audio.error.micNotFound');
  });

  it('maps NotReadableError', () => {
    expect(
      recordingStartFailureDictKey(
        new DOMException('Could not start audio source', 'NotReadableError'),
      ),
    ).toBe('transcription.timeline.audio.error.micBusy');
  });

  it('falls back to generic start failed', () => {
    expect(recordingStartFailureDictKey(new Error('network'))).toBe(
      'transcription.timeline.audio.error.startFailed',
    );
  });
});

describe('useRecording unmount cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not persist voice translation when unmounted during recording', async () => {
    const saveVoiceTranslation = vi.fn().mockResolvedValue(undefined);
    const setSaveState = vi.fn();
    const selectUnit = vi.fn();
    const manualSelectTsRef = { current: 0 };

    const trackStop = vi.fn();
    let lastRecorder: { stop: ReturnType<typeof vi.fn>; onstop: (() => void) | null } | null = null;

    class MockMediaRecorder {
      static isTypeSupported = () => false;

      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      stop = vi.fn(() => {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.onstop?.();
        });
      });

      constructor(_stream: MediaStream) {
        lastRecorder = this as { stop: ReturnType<typeof vi.fn>; onstop: (() => void) | null };
      }

      start() {
        this.state = 'recording';
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: trackStop }],
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useRecording({
        saveVoiceTranslation,
        setSaveState,
        selectUnit,
        manualSelectTsRef,
      }),
    );

    await act(async () => {
      await result.current.startRecordingForUnit(
        { id: 'u1', layerId: 'l1' } as never,
        { id: 'l1', modality: 'audio' } as never,
      );
    });

    await waitFor(() => {
      expect(result.current.recording).toBe(true);
    });

    unmount();

    expect(lastRecorder).not.toBeNull();
    expect(lastRecorder!.stop).toHaveBeenCalled();
    expect(saveVoiceTranslation).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
  });

  it('persists voice translation when stopped then unmounted before onstop runs', async () => {
    const saveVoiceTranslation = vi.fn().mockResolvedValue(undefined);
    const setSaveState = vi.fn();
    const selectUnit = vi.fn();
    const manualSelectTsRef = { current: 0 };

    class MockMediaRecorder {
      static isTypeSupported = () => false;

      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      stop = vi.fn(() => {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.onstop?.();
        });
      });

      constructor(_stream: MediaStream) {}

      start() {
        this.state = 'recording';
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useRecording({
        saveVoiceTranslation,
        setSaveState,
        selectUnit,
        manualSelectTsRef,
      }),
    );

    await act(async () => {
      await result.current.startRecordingForUnit(
        { id: 'u1', layerId: 'l1' } as never,
        { id: 'l1', modality: 'audio' } as never,
      );
    });

    act(() => {
      result.current.stopRecording();
      unmount();
    });

    await waitFor(() => {
      expect(saveVoiceTranslation).toHaveBeenCalledTimes(1);
    });
  });
});
