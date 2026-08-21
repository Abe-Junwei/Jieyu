import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../../db';
import { getTranscriptionOverlaysMessages } from '../../i18n/messages';
import { buildTranscriptionUnitContextMenuItems } from './buildTranscriptionUnitContextMenuItems';

const NOW = new Date().toISOString();

function makeLayer(): LayerDocType {
  return {
    id: 'layer_default',
    textId: 't1',
    key: 'trc_default',
    name: { zho: '转写' },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function makeUnit(): LayerUnitDocType {
  return {
    id: 'utt_1',
    textId: 't1',
    mediaId: 'm1',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

describe('buildTranscriptionUnitContextMenuItems find similar', () => {
  it('adds a similar-units action for a single transcription unit', () => {
    const onFindSimilarUnitsFromMenu = vi.fn();
    const items = buildTranscriptionUnitContextMenuItems({
      ctxMenu: {
        x: 10,
        y: 10,
        unitId: 'utt_1',
        layerId: 'layer_default',
        unitKind: 'unit',
        splitTime: 0.5,
        menuSurface: 'timeline-annotation',
        layerType: 'transcription',
      },
      locale: 'zh-CN',
      messages: getTranscriptionOverlaysMessages('zh-CN'),
      selectedUnitIds: new Set(['utt_1']),
      units: [makeUnit()],
      transcriptionLayers: [makeLayer()],
      translationLayers: [],
      speakerFilterOptions: [],
      speakerOptions: [],
      onAssignSpeakerFromMenu: vi.fn(),
      onOpenNoteFromMenu: vi.fn(),
      onOpenSpeakerManagementPanelFromMenu: vi.fn(),
      runDeleteSelection: vi.fn(),
      runMergeSelection: vi.fn(),
      runSelectBefore: vi.fn(),
      runSelectAfter: vi.fn(),
      runDeleteOne: vi.fn(),
      runMergePrev: vi.fn(),
      runMergeNext: vi.fn(),
      runSplitAtTime: vi.fn(),
      onFindSimilarUnitsFromMenu,
    });

    const similar = items.find((item) => item.label === '检索相似句');
    expect(similar).toBeTruthy();
    similar?.onClick?.();
    expect(onFindSimilarUnitsFromMenu).toHaveBeenCalledWith('utt_1');
  });
});
