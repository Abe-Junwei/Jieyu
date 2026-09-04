import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import { projectAnnotationLaneUnits } from './annotationLaneUnitProjection';

function layer(id: string): LayerDocType {
  return {
    id,
    textId: 'tid-1',
    key: id,
    name: { default: id },
    languageId: 'und',
    modality: 'text',
    createdAt: '',
    updatedAt: '',
    layerType: 'transcription',
  };
}

function unit(partial: {
  id: string;
  layerId?: string;
  mediaId?: string;
  startTime: number;
  skip?: boolean;
}): LayerUnitDocType {
  return {
    id: partial.id,
    textId: 'tid-1',
    mediaId: partial.mediaId ?? 'mid-1',
    layerId: partial.layerId,
    startTime: partial.startTime,
    endTime: partial.startTime + 1,
    createdAt: '',
    updatedAt: '',
    ...(partial.skip ? { tags: { skipProcessing: true } } : {}),
  };
}

describe('projectAnnotationLaneUnits', () => {
  it('keeps unscoped units on the default transcription lane', () => {
    const rows = projectAnnotationLaneUnits({
      units: [unit({ id: 'u-b', startTime: 2 }), unit({ id: 'u-a', startTime: 1 })],
      layers: [layer('lane-1')],
      mediaId: 'mid-1',
    });
    expect(rows.map((row) => row.id)).toEqual(['u-a', 'u-b']);
  });

  it('does not include skipProcessing units or foreign-lane units', () => {
    const rows = projectAnnotationLaneUnits({
      units: [
        unit({ id: 'u-skip', startTime: 1, skip: true }),
        unit({ id: 'u-other', startTime: 1, layerId: 'lane-other' }),
        unit({ id: 'u-ok', startTime: 1, layerId: 'lane-1' }),
      ],
      layers: [layer('lane-1')],
      mediaId: 'mid-1',
    });
    expect(rows.map((row) => row.id)).toEqual(['u-ok']);
  });

  it('falls back to current-media units when no transcription layer exists', () => {
    const rows = projectAnnotationLaneUnits({
      units: [
        unit({ id: 'u-1', mediaId: 'mid-1', startTime: 1 }),
        unit({ id: 'u-2', mediaId: 'mid-2', startTime: 1 }),
      ],
      layers: [],
      mediaId: 'mid-1',
    });
    expect(rows.map((row) => row.id)).toEqual(['u-1']);
  });
});
