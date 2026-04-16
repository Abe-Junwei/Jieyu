import { describe, expect, it } from 'vitest';
import { buildUnifiedUnitBackfill } from './migrations/buildUnifiedUnitBackfill';

describe('db unification idempotency', () => {
  it('produces the same canonical payload on repeated runs', () => {
    const input = {
      units: [{
        id: 'utt-1',
        textId: 'text-1',
        mediaId: 'media-1',
        transcription: { default: 'hello' },
        startTime: 0,
        endTime: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      segments: [],
      defaultTranscriptionLayerId: 'layer-transcription',
    } as const;

    const first = buildUnifiedUnitBackfill(input);
    const second = buildUnifiedUnitBackfill(input);

    expect(second).toEqual(first);
  });
});
