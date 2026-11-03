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
    expect(lastRecorder!.onstop).toBeNull();
    expect(saveVoiceTranslation).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
  });
});

describe('useRecording concurrent start (#496)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects a second start while getUserMedia for the first is still pending', async () => {
    const saveVoiceTranslation = vi.fn().mockResolvedValue(undefined);
    const setSaveState = vi.fn();
    const selectUnit = vi.fn();
    const manualSelectTsRef = { current: 0 };

    type Pending = { resolve: (stream: MediaStream) => void };
    const pending: Pending[] = [];
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          pending.push({ resolve });
        }),
    );

    const recorders: Array<{ start: ReturnType<typeof vi.fn>; state: string }> = [];
    class MockMediaRecorder {
      static isTypeSupported = () => false;
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      stop = vi.fn(() => {
        this.state = 'inactive';
      });
      start = vi.fn(() => {
        this.state = 'recording';
      });
      constructor(_stream: MediaStream) {
        recorders.push(this);
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const { result } = renderHook(() =>
      useRecording({
        saveVoiceTranslation,
        setSaveState,
        selectUnit,
        manualSelectTsRef,
      }),
    );

    const trackStopA = vi.fn();
    const trackStopB = vi.fn();

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.startRecordingForUnit(
        { id: 'u-a', layerId: 'l1' } as never,
        { id: 'l1', modality: 'audio' } as never,
      );
    });

    // Occupied before permission resolves: UI/hook must refuse another unit.
    expect(result.current.recordingUnitId).toBe('u-a');
    expect(result.current.recording).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    let second!: Promise<void>;
    await act(async () => {
      second = result.current.startRecordingForUnit(
        { id: 'u-b', layerId: 'l1' } as never,
        { id: 'l1', modality: 'audio' } as never,
      );
    });

    // Critical: must not open a second permission prompt / session.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.recordingUnitId).toBe('u-a');

    await act(async () => {
      await second;
    });

    await act(async () => {
      pending[0]!.resolve({
        getTracks: () => [{ stop: trackStopA }],
      } as unknown as MediaStream);
      await first;
    });

    await waitFor(() => {
      expect(result.current.recording).toBe(true);
    });
    expect(recorders).toHaveLength(1);
    expect(recorders[0]!.start).toHaveBeenCalledTimes(1);
    expect(trackStopB).not.toHaveBeenCalled();
    expect(result.current.recordingUnitId).toBe('u-a');
  });
});

describe('useRecording pending permission unmount (#497)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not start an unmanaged recorder after unmount while getUserMedia is pending', async () => {
    const saveVoiceTranslation = vi.fn().mockResolvedValue(undefined);
    const setSaveState = vi.fn();
    const selectUnit = vi.fn();
    const manualSelectTsRef = { current: 0 };

    type Pending = { resolve: (stream: MediaStream) => void };
    const pending: Pending[] = [];
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          pending.push({ resolve });
        }),
    );

    const recorders: Array<{ start: ReturnType<typeof vi.fn>; state: string }> = [];
    class MockMediaRecorder {
      static isTypeSupported = () => false;
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      stop = vi.fn(() => {
        this.state = 'inactive';
      });
      start = vi.fn(() => {
        this.state = 'recording';
      });
      constructor(_stream: MediaStream) {
        recorders.push(this);
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const { result, unmount } = renderHook(() =>
      useRecording({
        saveVoiceTranslation,
        setSaveState,
        selectUnit,
        manualSelectTsRef,
      }),
    );

    const trackStop = vi.fn();
    let started!: Promise<void>;
    await act(async () => {
      started = result.current.startRecordingForUnit(
        { id: 'u1', layerId: 'l1' } as never,
        { id: 'l1', modality: 'audio' } as never,
      );
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      pending[0]!.resolve({
        getTracks: () => [{ stop: trackStop }],
      } as unknown as MediaStream);
      await started;
    });

    expect(recorders).toHaveLength(0);
    expect(trackStop).toHaveBeenCalled();
    expect(saveVoiceTranslation).not.toHaveBeenCalled();
  });
});
