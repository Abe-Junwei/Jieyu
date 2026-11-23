import { describe, expect, it } from 'vitest';
import { splitOpen } from './useDesktopTranscriptionSplitController';

const unit = {
  timeMs: 500,
  startMs: 0,
  endMs: 1000,
  unitId: 'u',
  activeLayerId: 'tx',
  activeSource: '原文句子',
};

describe('splitOpen', () => {
  it('cuts the active layer at the editor caret', () => {
    expect(
      splitOpen({
        ...unit,
        caret: { layerId: 'tx', unitId: 'u', index: 2, source: '原文句子' },
      }),
    ).toEqual({ ok: true, textLayerId: 'tx', source: '原文句子', cutIndex: 2 });
  });

  it('keeps the whole active text on the left when this unit has no caret', () => {
    expect(splitOpen({ ...unit, caret: null })).toEqual({
      ok: true,
      textLayerId: 'tx',
      source: '原文句子',
      cutIndex: 4,
    });
  });

  it('uses the caret layer and its text, not the layer that became active later', () => {
    expect(
      splitOpen({
        ...unit,
        activeLayerId: 'tl',
        activeSource: '后来的层',
        caret: { layerId: 'tx', unitId: 'u', index: 1, source: '原文句子' },
      }),
    ).toEqual({ ok: true, textLayerId: 'tx', source: '原文句子', cutIndex: 1 });
  });

  it('says the playhead is outside before it says the cut is too close', () => {
    expect(splitOpen({ ...unit, timeMs: 2000, caret: null }).ok).toBe(false);
    expect(splitOpen({ ...unit, timeMs: 2000, caret: null })).toMatchObject({ reason: 'outside' });
    expect(splitOpen({ ...unit, timeMs: 5, caret: null })).toMatchObject({ reason: 'too-close' });
  });
});
