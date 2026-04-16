// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';

function makeLayer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as LayerDocType;
}

function makeUnit(id: string, startTime: number, endTime: number, speakerId: string): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    speakerId,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as LayerUnitDocType;
}

function makeTranslation(
  id: string,
  layerId: string,
  unitId: string,
  updatedAt: string,
  translationAudioMediaId?: string,
): LayerUnitContentDocType {
  return {
    id,
    unitId,
    layerId,
    textId: 'text-1',
    modality: 'audio',
    sourceType: 'human',
    text: '',
    createdAt: updatedAt,
    updatedAt,
    ...(translationAudioMediaId ? { translationAudioMediaId } : {}),
  } as LayerUnitContentDocType;
}

type HookInput = Parameters<typeof useTranscriptionTimelineController>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const units = [
    makeUnit('utt-1', 0, 1, 'spk-a'),
    makeUnit('utt-2', 5, 6, 'spk-a'),
    makeUnit('utt-3', 9, 10, 'spk-b'),
  ];
  const transcriptionLayers = [makeLayer('layer-main'), makeLayer('layer-alt')];

  return {
    activeSpeakerFilterKey: 'all',
    unitsOnCurrentMedia: units,
    getUnitSpeakerKey: (unit) => unit.speakerId ?? '',
    rulerView: null,
    playerDuration: 12,
    translations: [],
    selectedBatchUnits: [units[0]!],
    transcriptionLayers,
    selectedLayerId: 'layer-alt',
    getUnitTextForLayer: (unit, layerId) => `${layerId ?? 'default'}:${unit.id}`,
    unitDrafts: {},
    setUnitDrafts: vi.fn() as unknown as Dispatch<SetStateAction<Record<string, string>>>,
    translationDrafts: {},
    setTranslationDrafts: vi.fn() as unknown as Dispatch<SetStateAction<Record<string, string>>>,
    translationTextByLayer: new Map(),
    focusedTranslationDraftKeyRef: createRef<string | null>() as HookInput['focusedTranslationDraftKeyRef'],
    scheduleAutoSave: vi.fn(),
    clearAutoSaveTimer: vi.fn(),
    saveUnitText: vi.fn(async () => undefined),
    saveUnitLayerText: vi.fn(async () => undefined),
    renderLaneLabel: (layer) => layer.id,
    createLayer: vi.fn(async () => true),
    deleteLayer: vi.fn(async () => undefined),
    deleteLayerWithoutConfirm: vi.fn(async () => undefined),
    checkLayerHasContent: vi.fn(async () => 0),
    ...overrides,
  };
}

describe('useTranscriptionTimelineController', () => {
  it('filters units by speaker and visible ruler window', () => {
    const { result } = renderHook(() => useTranscriptionTimelineController(createBaseInput({
      activeSpeakerFilterKey: 'spk-a',
      rulerView: { start: 4, end: 6 },
    })));

    expect(result.current.filteredUnitsOnCurrentMedia.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
    expect(result.current.timelineRenderUnits.map((item) => item.id)).toEqual(['utt-2']);
  });

  it('keeps latest translation audio mapping and batch/editor context composition', () => {
    const translations = [
      makeTranslation('tr-1', 'layer-tr', 'utt-1', '2026-03-30T00:00:00.000Z', 'audio-old'),
      makeTranslation('tr-2', 'layer-tr', 'utt-1', '2026-03-30T00:01:00.000Z', 'audio-new'),
    ];
    const createLayer = vi.fn(async () => true);
    const deleteLayer = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionTimelineController(createBaseInput({
      translations,
      createLayer,
      deleteLayer,
    })));

    expect(result.current.translationAudioByLayer.get('layer-tr')?.get('utt-1')?.id).toBe('tr-2');
    expect(result.current.selectedBatchUnitTextById).toEqual({ 'utt-1': 'default:utt-1' });
    expect(result.current.batchPreviewLayerOptions.map((item) => item.id)).toEqual(['layer-main', 'layer-alt']);
    expect(result.current.batchPreviewTextByLayerId['layer-main']?.['utt-2']).toBe('layer-main:utt-2');
    expect(result.current.defaultBatchPreviewLayerId).toBe('layer-alt');
    expect(result.current.editorContextValue.createLayer).toBe(createLayer);
    expect(result.current.editorContextValue.deleteLayer).toBe(deleteLayer);
  });
});