/** @vitest-environment jsdom */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { startCreate } from './desktopTranscriptionEdgePointer';

const units = [
  { id: 'a', startMs: 0, endMs: 1000 },
  { id: 'b', startMs: 3000, endMs: 4000 },
];

function press(clientX: number) {
  return { button: 0, clientX } as ReactPointerEvent<HTMLElement>;
}

function move(clientX: number, altKey = false) {
  window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX, clientY: 0, altKey }));
}

function begin(clientX: number) {
  const commit = vi.fn();
  const tooShort = vi.fn();
  const setPreview = vi.fn();
  const onEmptyClick = vi.fn();
  startCreate({
    event: press(clientX),
    msAt: (x) => x * 10,
    zoomPxPerSec: 100,
    units,
    playheadMs: () => null,
    snapMessage: (kind, time) => `${kind} ${time}`,
    setPreview,
    commit,
    tooShort,
    minMs: 10,
    onEmptyClick,
  });
  return { commit, tooShort, setPreview, onEmptyClick };
}

describe('startCreate (waveform and lane drag-to-create)', () => {
  it('leaves a press under 4px as a click', () => {
    const run = begin(150);
    move(153);
    window.dispatchEvent(new Event('pointerup'));
    expect(run.setPreview).not.toHaveBeenCalled();
    expect(run.commit).not.toHaveBeenCalled();
    expect(run.onEmptyClick).toHaveBeenCalledOnce();
    const click = vi.fn();
    window.addEventListener('click', click);
    window.dispatchEvent(new MouseEvent('click'));
    window.removeEventListener('click', click);
    expect(click).toHaveBeenCalled();
  });

  it('creates after a drag, snaps to a neighbor edge, and swallows the trailing click', () => {
    const run = begin(150);
    move(297);
    expect(run.setPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ unitId: null, startMs: 1500, endMs: 3000 }),
    );
    window.dispatchEvent(new Event('pointerup'));
    expect(run.commit).toHaveBeenCalledWith(1500, 3000);
    expect(run.onEmptyClick).not.toHaveBeenCalled();
    const click = vi.fn();
    window.addEventListener('click', click);
    window.dispatchEvent(new MouseEvent('click'));
    window.removeEventListener('click', click);
    expect(click).not.toHaveBeenCalled();
  });

  it('does not snap with Alt held', () => {
    const run = begin(150);
    move(297, true);
    window.dispatchEvent(new Event('pointerup'));
    expect(run.commit).toHaveBeenCalledWith(1500, 2970);
  });

  it('does nothing when the press starts inside a segment', () => {
    const run = begin(50);
    move(200);
    window.dispatchEvent(new Event('pointerup'));
    expect(run.setPreview).not.toHaveBeenCalled();
    expect(run.commit).not.toHaveBeenCalled();
    expect(run.onEmptyClick).not.toHaveBeenCalled();
  });
});
