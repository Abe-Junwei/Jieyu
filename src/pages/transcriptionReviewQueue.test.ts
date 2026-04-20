import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { buildTranscriptionReviewQueue } from '../utils/transcriptionReviewQueue';

function makeUnit(
  id: string,
  startTime: number,
  endTime: number,
  overrides: Partial<LayerUnitDocType> = {},
): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId: 'layer-1',
    startTime,
    endTime,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  } as LayerUnitDocType;
}

describe('buildTranscriptionReviewQueue', () => {
  it('includes speaker-gap items when the media has partial speaker assignment', () => {
    const queue = buildTranscriptionReviewQueue([
      makeUnit('u1', 0, 1, { speakerId: 'spk-1', transcription: { default: '甲' } as never, status: 'verified' }),
      makeUnit('u2', 1, 2, { transcription: { default: '乙' } as never, status: 'verified' }),
    ]);

    expect(queue.map((unit) => unit.id)).toEqual(['u2']);
  });

  it('includes non-verified units for pending review', () => {
    const queue = buildTranscriptionReviewQueue([
      makeUnit('u1', 0, 1, {
        speakerId: 'spk-1',
        transcription: { default: '甲' } as never,
        status: 'raw',
      }),
    ]);

    expect(queue.map((unit) => unit.id)).toEqual(['u1']);
  });

  it('keeps skipped items out of the toolbar review queue', () => {
    const queue = buildTranscriptionReviewQueue([
      makeUnit('u1', 0, 1, { transcription: { default: '' } as never, status: 'raw', tags: { skipProcessing: true } }),
      makeUnit('u2', 1, 2, { transcription: { default: '' } as never, status: 'raw' }),
    ]);

    expect(queue.map((unit) => unit.id)).toEqual(['u2']);
  });
});
