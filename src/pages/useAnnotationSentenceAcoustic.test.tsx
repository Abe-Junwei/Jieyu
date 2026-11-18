/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockListMediaByTextId } = vi.hoisted(() => ({
  mockListMediaByTextId: vi.fn(),
}));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    media: {
      listByTextId: mockListMediaByTextId,
    },
  },
}));

import { useAnnotationSentenceAcoustic } from './useAnnotationSentenceAcoustic';

describe('useAnnotationSentenceAcoustic (#533)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockListMediaByTextId.mockReset();
  });

  it('does not revoke the current preview when a cancelled request later fails', async () => {
    const revoked: string[] = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(String(url));
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-b');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = async () => ({
          sampleRate: 16000,
          getChannelData: () => new Float32Array(32),
        });
        close = async () => undefined;
      },
    );
    let rejectA: ((error: Error) => void) | null = null;
    mockListMediaByTextId
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectA = reject;
          }),
      )
      .mockResolvedValueOnce([{ id: 'media-b', url: 'https://example.test/b.wav' }]);

    const { result, rerender } = renderHook(
      (props: { textId: string }) =>
        useAnnotationSentenceAcoustic({
          textId: props.textId,
          mediaId: '',
          startTime: 0,
          endTime: 0.001,
          enabled: true,
        }),
      { initialProps: { textId: 'text-a' } },
    );

    rerender({ textId: 'text-b' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.audioUrl).toBe('blob:preview-b');

    await act(async () => {
      rejectA?.(new Error('cancelled request failed'));
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.audioUrl).toBe('blob:preview-b');
    expect(revoked).not.toContain('blob:preview-b');
  });
});
