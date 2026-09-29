import { describe, expect, it } from 'vitest';
import { estimateTimelineSegmentTextWidthPx } from './timelineContentFitZoom';
import { TIMELINE_TEXT_FLOW_GAP_PX, layoutTextFlowDocument } from './timelineTextFlowLayout';

describe('layoutTextFlowDocument', () => {
  it('gives every layer in one time slot the widest width and the same edges', () => {
    const wide = estimateTimelineSegmentTextWidthPx('sentence');
    const laid = layoutTextFlowDocument([
      { layerId: 'tx', items: [{ id: 'a', startTime: 0, endTime: 1, text: 'a' }] },
      { layerId: 'ft', items: [{ id: 'b', startTime: 0, endTime: 1, text: 'sentence' }] },
    ]);
    const tx = laid.frames.get('tx\na');
    const ft = laid.frames.get('ft\nb');
    expect(tx).toEqual({ left: 0, width: wide });
    expect(ft).toEqual(tx);
    expect(laid.contentWidthPx).toBe(wide);
  });

  it('uses the measured string width for the shared column', () => {
    const laid = layoutTextFlowDocument(
      [
        { layerId: 'tx', items: [{ id: 'a', startTime: 0, endTime: 1, text: 'a' }] },
        { layerId: 'ft', items: [{ id: 'b', startTime: 0, endTime: 1, text: 'wide' }] },
      ],
      (text) => (text === 'wide' ? 120 : 40),
    );
    expect(laid.frames.get('tx\na')).toEqual({ left: 0, width: 120 });
    expect(laid.frames.get('ft\nb')).toEqual({ left: 0, width: 120 });
  });

  it('keeps later slots to the right, ordered by time', () => {
    const early = estimateTimelineSegmentTextWidthPx('aa');
    const laid = layoutTextFlowDocument([
      {
        layerId: 'tx',
        items: [
          { id: 'late', startTime: 2, endTime: 3, text: 'b' },
          { id: 'early', startTime: 0, endTime: 1, text: 'aa' },
        ],
      },
    ]);
    expect(laid.frames.get('tx\nearly')).toEqual({ left: 0, width: early });
    expect(laid.frames.get('tx\nlate')?.left).toBe(early + TIMELINE_TEXT_FLOW_GAP_PX);
  });

  it('spans a phrase across the word columns it covers and grows them to fit', () => {
    const phrase = estimateTimelineSegmentTextWidthPx('a long translation');
    const laid = layoutTextFlowDocument([
      {
        layerId: 'wd',
        items: [
          { id: 'w1', startTime: 0, endTime: 1, text: 'a' },
          { id: 'w2', startTime: 1, endTime: 2, text: 'b' },
        ],
      },
      {
        layerId: 'ft',
        items: [{ id: 'p', startTime: 0, endTime: 2, text: 'a long translation' }],
      },
    ]);
    const w1 = laid.frames.get('wd\nw1');
    const w2 = laid.frames.get('wd\nw2');
    const phraseBox = laid.frames.get('ft\np');
    expect(w1?.left).toBe(0);
    expect(phraseBox?.left).toBe(0);
    expect(phraseBox?.width).toBeGreaterThanOrEqual(phrase);
    expect(w2 && phraseBox ? w2.left + w2.width : 0).toBe(phraseBox?.width);
    expect(w1 && w2 ? w2.left : 0).toBe(
      (w1?.left ?? 0) + (w1?.width ?? 0) + TIMELINE_TEXT_FLOW_GAP_PX,
    );
  });
});
