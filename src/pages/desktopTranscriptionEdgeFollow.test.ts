import { describe, expect, it } from 'vitest';
import { followTip, playbackWithPreview } from './desktopTranscriptionEdgeView';
import type { ShownPreview } from './desktopTranscriptionEdgePointer';

const preview = (startMs: number, endMs: number): ShownPreview => ({
  unitId: 'p',
  startMs,
  endMs,
  otherId: null,
  otherStartMs: null,
  otherEndMs: null,
  tip: null,
  x: 0,
  y: 0,
});

describe('subdivision follow preview', () => {
  const layers = [
    {
      units: [
        { parentUnitId: 'p', startMs: 100, endMs: 500 },
        { parentUnitId: 'p', startMs: 500, endMs: 900 },
        { parentUnitId: 'other', startMs: 0, endMs: 50 },
      ],
    },
  ];

  it('counts only children of the dragged unit that get clamped', () => {
    expect(followTip(layers, preview(300, 1000))).toEqual({ count: 1, edge: 'start', timeMs: 300 });
    expect(followTip(layers, preview(0, 700))).toEqual({ count: 1, edge: 'end', timeMs: 700 });
    expect(followTip(layers, preview(0, 1000))).toBeNull();
  });

  it('shows a clamped child card while dragging', () => {
    const card = { id: 'c', startTime: 0.1, endTime: 0.5, text: '' };
    expect(playbackWithPreview(card, preview(300, 1000), 'p')).toMatchObject({
      startTime: 0.3,
      endTime: 0.5,
    });
    expect(playbackWithPreview(card, preview(300, 1000), 'x')).toBe(card);
  });
});
