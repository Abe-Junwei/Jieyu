/**
 * @vitest-environment jsdom
 */

import { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { dropFailedTake, peekFailedTake, takeSaveHeld } from './oralTake';
import { useDesktopTranscriptionOralController } from './useDesktopTranscriptionOralController';

vi.mock('./oralClipWav', () => ({
  clipBytesToWav: async (bytes: Uint8Array) => bytes,
}));

class FakeRecorder {
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus';
  }

  mimeType = 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  start(): void {
    this.state = 'recording';
  }

  pause(): void {
    this.state = 'paused';
  }

  resume(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([Uint8Array.of(1, 2, 3)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

afterEach(() => {
  cleanup();
  dropFailedTake();
  vi.unstubAllGlobals();
});

describe('oral recording controller', () => {
  it('attaches the clip when the recording stops', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    const desktopCall = vi.fn(async (_session: string, method: string) => {
      if (method === 'recordings.list') return [];
      if (method === 'recordings.attach') return { fileId: 'file-1' };
      return null;
    });
    const refresh = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall,
          audioLayerIds: [],
          refresh,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      result.current.pause();
    });
    expect(result.current.paused).toBe(true);
    expect(result.current.level).toBe(0);
    act(() => {
      result.current.resume();
    });
    expect(result.current.paused).toBe(false);
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(desktopCall).not.toHaveBeenCalledWith(
      'session-1',
      'recordings.attach',
      expect.anything(),
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      result.current.stop();
    });
    await waitFor(() => {
      expect(desktopCall).toHaveBeenCalledWith(
        'session-1',
        'recordings.attach',
        expect.objectContaining({
          unitId: 'unit-1',
          layerId: 'layer-1',
          mimeType: 'audio/wav',
        }),
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('stays unrecorded until the recorder starts, then can be denied and started again', async () => {
    let calls = 0;
    let release: ((stream: { getTracks: () => { stop: () => void }[] }) => void) | undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          calls += 1;
          if (calls === 1) {
            release = resolve;
            return;
          }
          if (calls === 2) {
            reject(new DOMException('no', 'NotAllowedError'));
            return;
          }
          resolve({ getTracks: () => [{ stop() {} }] });
        }),
    );
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const desktopCall = vi.fn(async () => []);
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall,
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.start('layer-1', 'unit-1');
    });
    expect(result.current.isArming('layer-1', 'unit-1')).toBe(true);
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(false);
    await act(async () => {
      release?.({ getTracks: () => [{ stop() {} }] });
      await pending;
    });
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(true);
    expect(result.current.isArming('layer-1', 'unit-1')).toBe(false);
    act(() => {
      result.current.stop();
    });
    await waitFor(() => {
      expect(result.current.isSaving('layer-1', 'unit-1')).toBe(false);
    });
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(false);
    expect(result.current.isArming('layer-1', 'unit-1')).toBe(false);
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(true);
  });

  it('releases the microphone when start fails and the next start can record', async () => {
    const stop = vi.fn();
    let starts = 0;
    class StartFailsOnce extends FakeRecorder {
      override start(): void {
        starts += 1;
        if (starts === 1) throw new DOMException('bad', 'InvalidStateError');
        super.start();
      }
    }
    vi.stubGlobal('MediaRecorder', StartFailsOnce);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
    });
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall: vi.fn(async () => []),
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(false);
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(true);
  });

  it('releases the microphone when the recorder cannot be constructed', async () => {
    const stop = vi.fn();
    class Unconstructable {
      static isTypeSupported(): boolean {
        return true;
      }
      constructor() {
        throw new DOMException('nope', 'NotSupportedError');
      }
    }
    vi.stubGlobal('MediaRecorder', Unconstructable);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
    });
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall: vi.fn(async () => []),
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(false);
    expect(result.current.isArming('layer-1', 'unit-1')).toBe(false);
  });

  it('keeps recording after StrictMode replays the mount', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall: vi.fn(async () => []),
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      {
        wrapper: ({ children }) => (
          <StrictMode>
            <ToastProvider>{children}</ToastProvider>
          </StrictMode>
        ),
      },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(true);
  });

  it('ignores a microphone request that finishes after a newer take', async () => {
    let calls = 0;
    let release: ((stream: { getTracks: () => { stop: () => void }[] }) => void) | undefined;
    const staleStop = vi.fn();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(
          () =>
            new Promise((resolve) => {
              calls += 1;
              if (calls === 1) {
                release = resolve;
                return;
              }
              resolve({ getTracks: () => [{ stop() {} }] });
            }),
        ),
      },
    });
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall: vi.fn(async () => []),
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    act(() => {
      void result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    await act(async () => {
      release?.({ getTracks: () => [{ stop: staleStop }] });
      await Promise.resolve();
    });
    expect(staleStop).toHaveBeenCalled();
    expect(result.current.isRecording('layer-1', 'unit-1')).toBe(true);
  });

  it('keeps the bytes when saving fails and retries the same session', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    let attaches = 0;
    const desktopCall = vi.fn(async (_sessionId: string, method: string) => {
      if (method === 'recordings.attach') {
        attaches += 1;
        if (attaches === 1) throw new Error('disk');
        return { fileId: 'file-1' };
      }
      return [];
    });
    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useDesktopTranscriptionOralController({
          sessionId,
          desktopCall,
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider, initialProps: { sessionId: 'session-a' } },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    rerender({ sessionId: 'session-b' });
    act(() => {
      result.current.stop();
    });
    await waitFor(() => {
      expect(result.current.isFailed('layer-1', 'unit-1')).toBe(true);
    });
    expect(desktopCall).toHaveBeenCalledWith('session-a', 'recordings.attach', expect.anything());
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.isFailed('layer-1', 'unit-1')).toBe(false);
    });
    expect(desktopCall).toHaveBeenCalledWith('session-a', 'recordings.attach', expect.anything());
    expect(desktopCall).not.toHaveBeenCalledWith(
      'session-b',
      'recordings.attach',
      expect.anything(),
    );
  });

  it('does not save a take that the recorder reports as an error', async () => {
    let recorder: FakeRecorder | undefined;
    class Captured extends FakeRecorder {
      constructor() {
        super();
        recorder = this;
      }
    }
    vi.stubGlobal('MediaRecorder', Captured);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    const desktopCall = vi.fn(async () => []);
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall,
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      recorder?.onerror?.();
      recorder?.stop();
    });
    await waitFor(() => {
      expect(result.current.isFailed('layer-1', 'unit-1')).toBe(true);
    });
    expect(desktopCall).not.toHaveBeenCalledWith(
      'session-1',
      'recordings.attach',
      expect.anything(),
    );
  });

  it('keeps a failed take when another card tries to record', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    const desktopCall = vi.fn(async (_session: string, method: string) => {
      if (method === 'recordings.attach') throw new Error('disk');
      return [];
    });
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall,
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-a');
    });
    act(() => {
      result.current.stop();
    });
    await waitFor(() => {
      expect(result.current.isFailed('layer-1', 'unit-a')).toBe(true);
    });
    await act(async () => {
      await result.current.start('layer-1', 'unit-b');
    });
    expect(result.current.isRecording('layer-1', 'unit-b')).toBe(false);
    expect(result.current.isFailed('layer-1', 'unit-a')).toBe(true);
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(desktopCall).toHaveBeenCalledTimes(2);
    });
    expect(desktopCall).toHaveBeenLastCalledWith(
      'session-1',
      'recordings.attach',
      expect.objectContaining({ unitId: 'unit-a' }),
    );
  });

  it('does not replace a clip when the microphone track ends', async () => {
    let ended: (() => void) | undefined;
    const track = {
      stop() {},
      addEventListener(type: string, listener: () => void) {
        if (type === 'ended') ended = listener;
      },
    };
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [track],
          getAudioTracks: () => [track],
        })),
      },
    });
    const desktopCall = vi.fn(async () => []);
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall,
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      ended?.();
    });
    await waitFor(() => {
      expect(result.current.isFailed('layer-1', 'unit-1')).toBe(true);
    });
    expect(desktopCall).not.toHaveBeenCalledWith(
      'session-1',
      'recordings.attach',
      expect.anything(),
    );
  });

  it('leaves after an async stop saves, and stays when that save fails', async () => {
    class LateStop extends FakeRecorder {
      override stop(): void {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob([Uint8Array.of(9)], { type: this.mimeType }) });
          this.onstop?.();
        });
      }
    }
    vi.stubGlobal('MediaRecorder', LateStop);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    let fail = false;
    const desktopCall = vi.fn(async () => {
      if (fail) throw new Error('disk');
      return { fileId: 'file-1' };
    });
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionOralController({
          sessionId: 'session-1',
          desktopCall,
          audioLayerIds: [],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider },
    );
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    let left = false;
    act(() => {
      result.current.leave(() => {
        left = true;
      });
      result.current.saveAndLeave();
    });
    expect(left).toBe(false);
    await waitFor(() => {
      expect(left).toBe(true);
    });

    fail = true;
    left = false;
    await act(async () => {
      await result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      result.current.leave(() => {
        left = true;
      });
      result.current.saveAndLeave();
    });
    await waitFor(() => {
      expect(result.current.isFailed('layer-1', 'unit-1')).toBe(true);
    });
    expect(left).toBe(false);
  });

  it('restores a failed take after the workspace unmounts', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    let fail = true;
    const desktopCall = vi.fn(async () => {
      if (fail) throw new Error('disk');
      return { fileId: 'file-1' };
    });
    const input = {
      sessionId: 'session-1',
      desktopCall,
      audioLayerIds: [] as string[],
      refresh: async () => undefined,
    };
    const first = renderHook(() => useDesktopTranscriptionOralController(input), {
      wrapper: ToastProvider,
    });
    await act(async () => {
      await first.result.current.start('layer-1', 'unit-1');
    });
    act(() => {
      first.result.current.stop();
    });
    await waitFor(() => {
      expect(first.result.current.isFailed('layer-1', 'unit-1')).toBe(true);
    });
    first.unmount();
    expect(peekFailedTake()?.pinned.unitId).toBe('unit-1');
    fail = false;
    const second = renderHook(() => useDesktopTranscriptionOralController(input), {
      wrapper: ToastProvider,
    });
    await waitFor(() => {
      expect(second.result.current.isFailed('layer-1', 'unit-1')).toBe(true);
    });
    await act(async () => {
      second.result.current.retry();
    });
    await waitFor(() => {
      expect(second.result.current.isFailed('layer-1', 'unit-1')).toBe(false);
    });
  });

  it('blocks a second take while an unmounted save is still running, then keeps that failure', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      },
    });
    let rejectFirst: ((error: Error) => void) | undefined;
    const desktopCall = vi.fn((_session: string, method: string) => {
      if (method !== 'recordings.attach') return Promise.resolve([]);
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    });
    const input = {
      sessionId: 'session-1',
      desktopCall,
      audioLayerIds: [] as string[],
      refresh: async () => undefined,
    };
    const first = renderHook(() => useDesktopTranscriptionOralController(input), {
      wrapper: ToastProvider,
    });
    await act(async () => {
      await first.result.current.start('layer-1', 'unit-a');
    });
    act(() => {
      first.result.current.stop();
    });
    first.unmount();
    const second = renderHook(() => useDesktopTranscriptionOralController(input), {
      wrapper: ToastProvider,
    });
    await act(async () => {
      await second.result.current.start('layer-1', 'unit-b');
    });
    expect(second.result.current.isRecording('layer-1', 'unit-b')).toBe(false);
    expect(desktopCall).toHaveBeenCalledTimes(1);
    await act(async () => {
      rejectFirst?.(new Error('disk'));
    });
    await waitFor(() => {
      expect(second.result.current.isFailed('layer-1', 'unit-a')).toBe(true);
    });
    second.unmount();
    expect(peekFailedTake()?.pinned.unitId).toBe('unit-a');
    expect(takeSaveHeld()).toBe(false);
  });

  it('releases clip urls when the workspace unmounts or the session clears', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:clip');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
    const desktopCall = vi.fn(async (_session: string, method: string) => {
      if (method === 'recordings.list') return [{ unitId: 'unit-1' }];
      if (method === 'recordings.read') return { mimeType: 'audio/wav', bytes: Uint8Array.of(1) };
      return [];
    });
    const { result, rerender, unmount } = renderHook(
      (props: { sessionId: string | null }) =>
        useDesktopTranscriptionOralController({
          sessionId: props.sessionId,
          desktopCall,
          audioLayerIds: ['layer-1'],
          refresh: async () => undefined,
        }),
      { wrapper: ToastProvider, initialProps: { sessionId: 'session-1' as string | null } },
    );
    await waitFor(() => {
      expect(result.current.src('layer-1', 'unit-1')).toBe('blob:clip');
    });
    rerender({ sessionId: null });
    await waitFor(() => {
      expect(result.current.src('layer-1', 'unit-1')).toBeNull();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clip');
    rerender({ sessionId: 'session-1' });
    await waitFor(() => {
      expect(result.current.src('layer-1', 'unit-1')).toBe('blob:clip');
    });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
