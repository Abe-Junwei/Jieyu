import { createRef } from 'react';
import { vi } from 'vitest';
import type {
  LayerDocType,
  LayerLinkDocType,
  LayerUnitDocType,
  TranscriptionLayerDocType,
} from '../db';
import type { TranscriptionEditorContextValue } from '../contexts/TranscriptionEditorContext';

export function makeLayer(
  id: string,
  layerType: 'transcription' | 'translation',
  displayName = id,
  constraint: LayerDocType['constraint'] = 'symbolic_association',
  extras?: Pick<TranscriptionLayerDocType, 'parentLayerId'>,
): LayerDocType {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': displayName },
    languageId: 'language-1',
    createdAt: now,
    updatedAt: now,
    layerType,
    constraint,
    modality: 'text',
    ...(layerType === 'transcription' ? (extras ?? {}) : {}),
  } as LayerDocType;
}

export function makeTranslationLayer(
  id: string,
  _parentTranscriptionId: string,
  displayName = id,
  constraint: LayerDocType['constraint'] = 'symbolic_association',
): LayerDocType {
  return makeLayer(id, 'translation', displayName, constraint);
}

export function makeUnit(
  id: string,
  layerId: string,
  startTime: number,
  endTime: number,
): LayerUnitDocType {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    startTime,
    endTime,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

export function makeLayerLink(
  id: string,
  transcriptionLayerKey: string,
  hostTranscriptionLayerId: string,
  layerId: string,
  isPreferred = true,
): LayerLinkDocType {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    id,
    transcriptionLayerKey,
    hostTranscriptionLayerId,
    layerId,
    linkType: 'free',
    isPreferred,
    createdAt: now,
  };
}

export function makeEditorContext(): TranscriptionEditorContextValue {
  return {
    unitDrafts: {},
    setUnitDrafts: vi.fn(),
    translationDrafts: {},
    setTranslationDrafts: vi.fn(),
    translationTextByLayer: new Map([
      [
        'translation-1',
        new Map([
          ['u1', { text: 'shared-target' }],
          ['u2', { text: 'shared-target' }],
        ]),
      ],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'],
    focusedTranslationDraftKeyRef: createRef<string | null>() as React.MutableRefObject<
      string | null
    >,
    scheduleAutoSave: vi.fn(),
    clearAutoSaveTimer: vi.fn(),
    saveUnitText: vi.fn(async () => undefined),
    saveUnitLayerText: vi.fn(async () => undefined),
    getUnitTextForLayer: (unit) =>
      unit.id === 'u1' ? 'fixture-vertical-src-u1' : 'fixture-vertical-src-u2',
    renderLaneLabel: (layer) =>
      typeof layer.name === 'string' ? layer.name : (layer.name?.['zh-CN'] ?? layer.id),
    createLayer: vi.fn(async () => true),
    updateLayerMetadata: vi.fn(async () => true),
    deleteLayer: vi.fn(async () => undefined),
    deleteLayerWithoutConfirm: vi.fn(async () => undefined),
    checkLayerHasContent: vi.fn(async () => 0),
  };
}
