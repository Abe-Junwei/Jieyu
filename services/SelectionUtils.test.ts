import { describe, expect, it } from 'vitest';
import { normalizeSelection, shouldPushTimingUndo } from '../src/utils/selectionUtils';

describe('normalizeSelection', () => {
  it('returns empty primary when selection is empty', () => {
    const next = normalizeSelection('utt_1', []);
    expect(next.primaryId).toBe('');
    expect(next.ids.size).toBe(0);
  });

  it('keeps primary when it exists in set', () => {
    const next = normalizeSelection('utt_2', ['utt_1', 'utt_2']);
    expect(next.primaryId).toBe('utt_2');
    expect(Array.from(next.ids)).toEqual(['utt_1', 'utt_2']);
  });

  it('falls back to first id when primary is missing', () => {
    const next = normalizeSelection('missing', ['utt_3', 'utt_4']);
    expect(next.primaryId).toBe('utt_3');
  });
});

describe('shouldPushTimingUndo', () => {
  it('pushes on first timing change', () => {
    const res = shouldPushTimingUndo(null, 'utt_1', 1000, 500);
    expect(res.shouldPush).toBe(true);
    expect(res.next.utteranceId).toBe('utt_1');
    expect(res.next.atMs).toBe(1000);
  });

  it('coalesces frequent updates on same utterance', () => {
    const first = shouldPushTimingUndo(null, 'utt_1', 1000, 500);
    const second = shouldPushTimingUndo(first.next, 'utt_1', 1300, 500);
    expect(second.shouldPush).toBe(false);
  });

  it('pushes again when window elapsed or utterance changed', () => {
    const first = shouldPushTimingUndo(null, 'utt_1', 1000, 500);
    const afterWindow = shouldPushTimingUndo(first.next, 'utt_1', 1700, 500);
    const otherUtterance = shouldPushTimingUndo(first.next, 'utt_2', 1200, 500);
    expect(afterWindow.shouldPush).toBe(true);
    expect(otherUtterance.shouldPush).toBe(true);
  });
});
