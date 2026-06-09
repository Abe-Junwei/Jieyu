import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../types/jieyuDbDocTypes';
import {
  assertSpeakerAssignmentUpdatedCounts,
  buildSegmentSpeakerExportRows,
  getSegmentIdsForSpeakerKey,
} from './speakerActionRoutingHandlers.helpers';

function makeLayer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(id: string, layerId: string, speakerId: string): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime: 0,
    endTime: 1,
    speakerId,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerUnitDocType;
}

describe('speakerActionRoutingHandlers.helpers', () => {
  it('collects segment ids for a speaker key on the active layer', () => {
    const layer = makeLayer('layer-1');
    const segments = new Map([
      [
        layer.id,
        [makeSegment('seg-a', layer.id, 'spk-1'), makeSegment('seg-b', layer.id, 'spk-2')],
      ],
    ]);
    expect(
      getSegmentIdsForSpeakerKey({
        activeSpeakerManagementLayer: layer,
        segmentsByLayer: segments,
        resolveExplicitSpeakerKeyForSegment: (segment) => segment.speakerId ?? '',
        speakerKey: 'spk-1',
      }),
    ).toEqual(['seg-a']);
  });

  it('builds export rows sorted by start time', () => {
    const layer = makeLayer('layer-1');
    const segments = new Map([
      [
        layer.id,
        [
          { ...makeSegment('seg-b', layer.id, 'spk-1'), startTime: 2, endTime: 3 },
          { ...makeSegment('seg-a', layer.id, 'spk-1'), startTime: 0, endTime: 0.5 },
        ],
      ],
    ]);
    const content = new Map([
      [
        layer.id,
        new Map([
          ['seg-a', { text: 'alpha' }],
          ['seg-b', { text: 'beta' }],
        ]),
      ],
    ]);
    const rows = buildSegmentSpeakerExportRows({
      activeSpeakerManagementLayer: layer,
      segmentsByLayer: segments,
      segmentContentByLayer: content as never,
      resolveExplicitSpeakerKeyForSegment: (segment) => segment.speakerId ?? '',
      speakerKey: 'spk-1',
      formatTime: (seconds) => `${seconds.toFixed(1)}s`,
    });
    expect(rows[0]).toContain('alpha');
    expect(rows[1]).toContain('beta');
  });

  it('rejects mixed speaker assignment when unit targets resolve to zero rows', () => {
    expect(() =>
      assertSpeakerAssignmentUpdatedCounts({
        targetSegmentCount: 1,
        targetUnitCount: 1,
        updatedSegments: 1,
        updatedUnits: 0,
      }),
    ).toThrow('未找到可更新的语段');
  });
});
