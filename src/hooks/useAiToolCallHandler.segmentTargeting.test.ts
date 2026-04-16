import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { AiChatToolCall } from './useAiChat';
import { materializePendingToolCallTargets } from './useAiToolCallHandler.segmentTargeting';

const NOW = new Date().toISOString();

function makeUnit(id: string, startTime: number): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    startTime,
    endTime: startTime + 1,
    transcription: {},
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

function makeLayer(id: string, layerType: 'transcription' | 'translation', languageId: string, label: string): LayerDocType {
  return {
    id,
    textId: 't1',
    key: `${layerType}-${languageId}`,
    name: { zho: label, eng: label },
    layerType,
    languageId,
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

describe('materializePendingToolCallTargets', () => {
  it('materializes last-segment delete selector to segmentId', () => {
    const call: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'last' },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [makeUnit('u2', 5), makeUnit('u1', 1), makeUnit('u3', 9)],
      transcriptionLayers: [],
      translationLayers: [],
    });

    expect(prepared.arguments.segmentId).toBe('u3');
    expect(prepared.arguments.segmentPosition).toBeUndefined();
  });

  it('materializes all-segment delete selector to segmentIds', () => {
    const call: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [makeUnit('u2', 5), makeUnit('u1', 1), makeUnit('u3', 9)],
      transcriptionLayers: [],
      translationLayers: [],
    });

    expect(prepared.arguments.segmentIds).toEqual(['u1', 'u2', 'u3']);
    expect(prepared.arguments.allSegments).toBeUndefined();
  });

  it('materializes ordinal delete selector to segmentId when current scope is an independent segment timeline', () => {
    const call: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [makeUnit('u1', 1)],
      transcriptionLayers: [],
      translationLayers: [],
      segmentTargets: [
        { id: 'seg-2', kind: 'segment', startTime: 5, endTime: 6, text: '第二段' },
        { id: 'seg-1', kind: 'segment', startTime: 1, endTime: 2, text: '第一段' },
      ],
    });

    expect(prepared.arguments.segmentId).toBe('seg-1');
    expect(prepared.arguments.unitId).toBeUndefined();
    expect(prepared.arguments.segmentIndex).toBeUndefined();
  });

  it('materializes ordinal transcription write selector to segmentId when current scope is an independent segment timeline', () => {
    const call: AiChatToolCall = {
      name: 'set_transcription_text',
      arguments: { segmentIndex: 1, text: '改写后文本' },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      segmentTargets: [
        { id: 'seg-1', kind: 'segment', startTime: 0, endTime: 1, text: '第一段' },
        { id: 'seg-2', kind: 'segment', startTime: 2, endTime: 3, text: '第二段' },
      ],
      selectedSegmentTargetId: 'seg-2',
    });

    expect(prepared.arguments.segmentId).toBe('seg-1');
    expect(prepared.arguments.segmentIndex).toBeUndefined();
    expect(prepared.arguments.text).toBe('改写后文本');
  });

  it('materializes ordinal create/split selectors to segmentId when current scope is an independent segment timeline', () => {
    const createCall: AiChatToolCall = {
      name: 'create_transcription_segment',
      arguments: { segmentIndex: 2 },
    };
    const splitCall: AiChatToolCall = {
      name: 'split_transcription_segment',
      arguments: { segmentPosition: 'previous', splitTime: 0.5 },
    };

    const context = {
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      segmentTargets: [
        { id: 'seg-1', kind: 'segment' as const, startTime: 0, endTime: 1, text: '第一段' },
        { id: 'seg-2', kind: 'segment' as const, startTime: 2, endTime: 3, text: '第二段' },
      ],
      selectedSegmentTargetId: 'seg-2',
    };

    const preparedCreate = materializePendingToolCallTargets(createCall, context);
    const preparedSplit = materializePendingToolCallTargets(splitCall, context);

    expect(preparedCreate.arguments.segmentId).toBe('seg-2');
    expect(preparedCreate.arguments.segmentIndex).toBeUndefined();
    expect(preparedSplit.arguments.segmentId).toBe('seg-1');
    expect(preparedSplit.arguments.segmentPosition).toBeUndefined();
  });

  it('materializes previous/next delete selectors to segmentId when current scope is an independent segment timeline', () => {
    const previousCall: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'previous' },
    };
    const nextCall: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'next' },
    };

    const context = {
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      segmentTargets: [
        { id: 'seg-1', kind: 'segment' as const, startTime: 1, endTime: 2, text: '第一段' },
        { id: 'seg-2', kind: 'segment' as const, startTime: 3, endTime: 4, text: '第二段' },
        { id: 'seg-3', kind: 'segment' as const, startTime: 5, endTime: 6, text: '第三段' },
      ],
      selectedSegmentTargetId: 'seg-2',
    };

    const previousPrepared = materializePendingToolCallTargets(previousCall, context);
    const nextPrepared = materializePendingToolCallTargets(nextCall, context);

    expect(previousPrepared.arguments.segmentId).toBe('seg-1');
    expect(previousPrepared.arguments.segmentPosition).toBeUndefined();
    expect(nextPrepared.arguments.segmentId).toBe('seg-3');
    expect(nextPrepared.arguments.segmentPosition).toBeUndefined();
  });

  it('materializes delete-all selector to segmentIds when current scope is an independent segment timeline', () => {
    const call: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      segmentTargets: [
        { id: 'seg-2', kind: 'segment', startTime: 5, endTime: 6, text: '第二段' },
        { id: 'seg-1', kind: 'segment', startTime: 1, endTime: 2, text: '第一段' },
      ],
    });

    expect(prepared.arguments.segmentIds).toEqual(['seg-1', 'seg-2']);
    expect(prepared.arguments.unitIds).toBeUndefined();
    expect(prepared.arguments.allSegments).toBeUndefined();
  });

  it('does not canonicalize legacy unitIds batch merge payloads anymore', () => {
    const call: AiChatToolCall = {
      name: 'merge_transcription_segments',
      arguments: { unitIds: ['utt-2', 'utt-1'] },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      segmentTargets: [
        { id: 'seg-1', kind: 'segment', startTime: 1, endTime: 2, text: '第一段', unitId: 'utt-1' },
        { id: 'seg-2', kind: 'segment', startTime: 3, endTime: 4, text: '第二段', unitId: 'utt-2' },
      ],
    });

    expect(prepared.arguments.segmentIds).toBeUndefined();
    expect(prepared.arguments.unitIds).toEqual(['utt-2', 'utt-1']);
  });

  it('keeps allSegments when there are no units to snapshot', () => {
    const call: AiChatToolCall = {
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
    });

    expect(prepared.arguments.allSegments).toBe(true);
    expect(prepared.arguments.unitIds).toBeUndefined();
  });

  it('materializes delete-layer semantic target to concrete layerId', () => {
    const call: AiChatToolCall = {
      name: 'delete_layer',
      arguments: {
        layerType: 'translation',
        languageQuery: '英语',
      },
    };

    const prepared = materializePendingToolCallTargets(call, {
      units: [],
      transcriptionLayers: [],
      translationLayers: [
        makeLayer('layer-en', 'translation', 'eng', '英语'),
        makeLayer('layer-zh', 'translation', 'zho', '中文'),
      ],
    });

    expect(prepared.arguments).toEqual({ layerId: 'layer-en' });
  });
});