// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTranscriptionSelectionGuards } from './useTranscriptionSelectionGuards';
import type { LayerDocType } from '../db';

function makeLayer(id: string, layerType: 'transcription' | 'translation'): LayerDocType {
  const now = '2026-03-26T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { zho: id },
    layerType,
    languageId: 'zho',
    modality: 'text',
    acceptsAudio: false,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

describe('useTranscriptionSelectionGuards', () => {
  it('keeps selectedLayerId when selected independent transcription layer still exists', () => {
    const setSelectedLayerId = vi.fn();
    const setLayerToDeleteId = vi.fn();
    const layers = [
      makeLayer('trc-default', 'transcription'),
      makeLayer('trc-independent', 'transcription'),
    ];

    renderHook(() => useTranscriptionSelectionGuards({
      selectedLayerId: 'trc-independent',
      setSelectedLayerId,
      layers,
      layerToDeleteId: '',
      setLayerToDeleteId,
      deletableLayers: layers,
    }));

    expect(setSelectedLayerId).not.toHaveBeenCalledWith('');
  });
});
