// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTranscriptionSelfCertaintyController } from './useTranscriptionSelfCertaintyController';

describe('useTranscriptionSelfCertaintyController', () => {
  it('resolves duplicate segment ids by layer scope', () => {
    const saveUtteranceSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-a', [{ id: 'seg-1', layerId: 'layer-a', utteranceId: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 }]],
        ['layer-b', [{ id: 'seg-1', layerId: 'layer-b', utteranceId: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'layer-a', parentUtteranceId: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 },
        { id: 'seg-1', layerId: 'layer-b', parentUtteranceId: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 },
      ],
      utterances: [
        { id: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 },
        { id: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 },
      ],
      saveUtteranceSelfCertainty,
    }));

    result.current.handleSetUtteranceSelfCertaintyFromMenu(['seg-1'], 'segment', 'certain', 'layer-a');
    result.current.handleSetUtteranceSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'layer-b');

    expect(saveUtteranceSelfCertainty).toHaveBeenNthCalledWith(1, ['utt-a'], 'certain');
    expect(saveUtteranceSelfCertainty).toHaveBeenNthCalledWith(2, ['utt-b'], 'uncertain');
  });
});
