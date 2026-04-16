import { describe, expect, it } from 'vitest';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import { executeLocalContextToolCall } from '../ai/chat/localContextTools';
import { buildTimelineUnitViewIndex } from '../hooks/timelineUnitView';

describe('transcription data caliber consistency', () => {
  it('keeps unit counts aligned across read model, prompt context, and local tools', async () => {
    const unitIndex = buildTimelineUnitViewIndex({
      units: [
        {
          id: 'utt-1',
          textId: 'text-1',
          mediaId: 'media-1',
          transcription: { default: 'hello' },
          startTime: 0,
          endTime: 1,
          speakerId: 'spk-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      unitsOnCurrentMedia: [
        {
          id: 'utt-1',
          textId: 'text-1',
          mediaId: 'media-1',
          transcription: { default: 'hello' },
          startTime: 0,
          endTime: 1,
          speakerId: 'spk-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'media-1',
      activeLayerIdForEdits: 'layer-transcription',
      defaultTranscriptionLayerId: 'layer-transcription',
    });

    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: null,
        activeUnitId: null,
        selectedUnit: null,
        selectedRowMeta: null,
        selectedLayerId: null,
        selectedText: '',
      },
      selectedUnitIds: [],
      selectedUnitCount: 0,
      currentMediaUnits: unitIndex.currentMediaUnits,
      projectUnitsForTools: unitIndex.allUnits,
      unitIndexComplete: unitIndex.isComplete,
      unitCount: unitIndex.totalCount,
      translationLayerCount: 0,
      aiConfidenceAvg: null,
      observerStage: null,
      topLexemes: [],
      recommendations: [],
      recentActions: [],
    });

    const toolResult = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 5 } },
      context,
      { current: 0 },
    );

    expect(unitIndex.totalCount).toBe(context.shortTerm?.projectUnitCount);
    expect(unitIndex.currentMediaCount).toBe(context.shortTerm?.currentMediaUnitCount);
    expect(context.longTerm?.projectStats?.unitCount).toBe(unitIndex.totalCount);
    expect((toolResult.result as { total: number }).total).toBe(unitIndex.totalCount);

    const statsResult = await executeLocalContextToolCall(
      { name: 'get_project_stats', arguments: {} },
      context,
      { current: 1 },
    );
    expect((statsResult.result as { unitCount: number }).unitCount).toBe(unitIndex.totalCount);
  });
});
