/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { useDesktopTranscriptionOralController } from './useDesktopTranscriptionOralController';

vi.mock('./oralClipWav', () => ({
  clipBytesToWav: async (bytes: Uint8Array) => bytes,
}));

class FakeRecorder {
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus';
  }

  mimeType = 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start(): void {
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
});
