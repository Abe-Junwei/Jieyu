import { describe, expect, it } from 'vitest';
import type { MediaItemDocType } from '../db';
import { resolveEstablishedAcousticDurationSec } from './timelineImportSpanCaps';

describe('resolveEstablishedAcousticDurationSec', () => {
  it('reads max duration from playable acoustic rows', () => {
    const rows: MediaItemDocType[] = [
      {
        id: 'media_a',
        textId: 'text_1',
        filename: 'clip.wav',
        duration: 200,
        details: { audioBlob: new Blob(['x'], { type: 'audio/wav' }), timelineKind: 'acoustic' },
        isOfflineCached: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(resolveEstablishedAcousticDurationSec(rows)).toBe(200);
  });
});
