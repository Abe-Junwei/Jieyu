import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { buildTranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

function utteranceView(id: string, layerId: string): TimelineUnitView {
  return {
    id,
    kind: 'utterance',
    mediaId: 'media-1',
    layerId,
    startTime: 1,
    endTime: 3,
    text: '',
  };
}

function segmentView(id: string, layerId: string, parentUtteranceId?: string): TimelineUnitView {
  return {
    id,
    kind: 'segment',
    mediaId: 'media-1',
    layerId,
    startTime: 1.2,
    endTime: 1.8,
    text: '',
    ...(parentUtteranceId ? { parentUtteranceId } : {}),
  };
}

function makeLayer(id: string, layerType: LayerDocType['layerType'] = 'transcription'): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType,
    languageId: layerType === 'translation' ? 'en' : 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as LayerDocType;
}

function makeUtterance(id: string): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime: 1,
    endTime: 3,
    transcription: { default: '默认转写' },
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as UtteranceDocType;
}

function makeSegment(id: string): LayerSegmentDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId: 'layer-seg',
    startTime: 1.2,
    endTime: 1.8,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as LayerSegmentDocType;
}

describe('buildTranscriptionSelectionSnapshot', () => {
  it('uses the selected layer text for utterance selection', () => {
    const utterance = makeUtterance('utt-1');
    const translationLayer = makeLayer('layer-tr', 'translation');

    const snapshot = buildTranscriptionSelectionSnapshot({
      selectedTimelineUnit: { layerId: 'layer-tr', unitId: 'utt-1', kind: 'utterance' },
      selectedTimelineSegment: null,
      selectedTimelineOwnerUnit: utterance,
      primaryUnitView: utteranceView('utt-1', 'layer-tr'),
      selectedTimelineRowMeta: { rowNumber: 2, start: 1, end: 3 },
      selectedLayerId: 'layer-tr',
      layers: [makeLayer('layer-main'), translationLayer],
      segmentContentByLayer: new Map(),
      getUtteranceTextForLayer: (_target, layerId) => (layerId === 'layer-tr' ? 'translated text' : '默认转写'),
      formatTime: (seconds) => seconds.toFixed(1),
    });

    expect(snapshot.selectedText).toBe('translated text');
    expect(snapshot.selectedLayerType).toBe('translation');
    expect(snapshot.selectedTranslationLayerId).toBe('layer-tr');
    expect(snapshot.selectedTimeRangeLabel).toBe('1.0-3.0');
  });

  it('keeps segment selection time and content aligned', () => {
    const segment = makeSegment('seg-1');
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' };

    const snapshot = buildTranscriptionSelectionSnapshot({
      selectedTimelineUnit,
      selectedTimelineSegment: segment,
      selectedTimelineOwnerUnit: makeUtterance('utt-1'),
      primaryUnitView: segmentView('seg-1', 'layer-seg', 'utt-1'),
      selectedTimelineRowMeta: { rowNumber: 1, start: 1, end: 3 },
      selectedLayerId: 'layer-seg',
      layers: [makeLayer('layer-seg')],
      segmentContentByLayer: new Map([
        ['layer-seg', new Map([['seg-1', { text: 'segment text' }]])],
      ]),
      getUtteranceTextForLayer: () => '默认转写',
      formatTime: (seconds) => seconds.toFixed(1),
    });

    expect(snapshot.selectedUnitKind).toBe('segment');
    expect(snapshot.selectedText).toBe('segment text');
    expect(snapshot.selectedTimeRangeLabel).toBe('1.2-1.8');
    expect(snapshot.selectedUnitStartSec).toBe(1.2);
    expect(snapshot.selectedUnitEndSec).toBe(1.8);
  });

  it('returns null fields when nothing is selected', () => {
    const snapshot = buildTranscriptionSelectionSnapshot({
      selectedTimelineUnit: null,
      selectedTimelineSegment: null,
      selectedTimelineOwnerUnit: null,
      primaryUnitView: null,
      selectedTimelineRowMeta: null,
      selectedLayerId: null,
      layers: [makeLayer('layer-main')],
      segmentContentByLayer: new Map(),
      getUtteranceTextForLayer: () => '',
      formatTime: (seconds) => seconds.toFixed(1),
    });

    expect(snapshot.timelineUnit).toBeNull();
    expect(snapshot.selectedUnitKind).toBeNull();
    expect(snapshot.activeUnitId).toBeNull();
    expect(snapshot.selectedUnit).toBeNull();
    expect(snapshot.selectedText).toBe('');
    expect(snapshot.selectedTimeRangeLabel).toBeUndefined();
  });

  it('derives activeUnitId from owner utterance for segment selection', () => {
    const ownerUtterance = makeUtterance('utt-owner');
    const segment = makeSegment('seg-1');

    const snapshot = buildTranscriptionSelectionSnapshot({
      selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' },
      selectedTimelineSegment: segment,
      selectedTimelineOwnerUnit: ownerUtterance,
      primaryUnitView: segmentView('seg-1', 'layer-seg', 'utt-owner'),
      selectedTimelineRowMeta: null,
      selectedLayerId: 'layer-seg',
      layers: [makeLayer('layer-seg')],
      segmentContentByLayer: new Map([
        ['layer-seg', new Map([['seg-1', { text: 'seg text' }]])],
      ]),
      getUtteranceTextForLayer: () => '',
      formatTime: (seconds) => seconds.toFixed(1),
    });

    expect(snapshot.activeUnitId).toBe('utt-owner');
    expect(snapshot.selectedUnitKind).toBe('segment');
    expect(snapshot.selectedUnit?.id).toBe('seg-1');
  });

  it('sets transcription layer fields when transcription layer is selected', () => {
    const snapshot = buildTranscriptionSelectionSnapshot({
      selectedTimelineUnit: { layerId: 'layer-main', unitId: 'utt-1', kind: 'utterance' },
      selectedTimelineSegment: null,
      selectedTimelineOwnerUnit: makeUtterance('utt-1'),
      primaryUnitView: utteranceView('utt-1', 'layer-main'),
      selectedTimelineRowMeta: { rowNumber: 1, start: 0, end: 2 },
      selectedLayerId: 'layer-main',
      layers: [makeLayer('layer-main', 'transcription')],
      segmentContentByLayer: new Map(),
      getUtteranceTextForLayer: () => '转写文本',
      formatTime: (seconds) => seconds.toFixed(1),
    });

    expect(snapshot.selectedLayerType).toBe('transcription');
    expect(snapshot.selectedTranscriptionLayerId).toBe('layer-main');
    expect(snapshot.selectedTranslationLayerId).toBeUndefined();
  });
});