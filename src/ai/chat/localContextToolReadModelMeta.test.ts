import { describe, expect, it, vi } from 'vitest';
import type { AiPromptContext } from './chatDomain.types';
import { buildLocalToolReadModelMeta } from './localContextToolReadModelMeta';

describe('buildLocalToolReadModelMeta', () => {
  it('includes epoch, unitIndexComplete, and indexRowCount when present', () => {
    const context: AiPromptContext = {
      shortTerm: {
        timelineReadModelEpoch: 7,
        unitIndexComplete: true,
        localUnitIndex: [
          { id: 'a', kind: 'utterance', mediaId: 'm', layerId: 'l', startTime: 0, endTime: 1, text: 'x' },
        ],
      },
      longTerm: {},
    };
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const meta = buildLocalToolReadModelMeta(context);
      expect(meta).toEqual({
        timelineReadModelEpoch: 7,
        unitIndexComplete: true,
        capturedAtMs: 1_700_000_000_000,
        indexRowCount: 1,
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('sets unitIndexComplete false when shortTerm explicitly false', () => {
    const context: AiPromptContext = {
      shortTerm: { unitIndexComplete: false },
      longTerm: {},
    };
    const meta = buildLocalToolReadModelMeta(context);
    expect(meta.unitIndexComplete).toBe(false);
    expect(meta.indexRowCount).toBeUndefined();
  });

  it('defaults unitIndexComplete to true when field omitted', () => {
    const context: AiPromptContext = { longTerm: {} };
    const meta = buildLocalToolReadModelMeta(context);
    expect(meta.unitIndexComplete).toBe(true);
  });
});
