// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDesktopWaveformCreate } from './useDesktopWaveformCreate';

function setup() {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => ({ left: 10 }) as DOMRect;
  document.body.append(host);
  const create = vi.fn();
  renderHook(() =>
    useDesktopWaveformCreate({
      hostRef: { current: host },
      zoomPxPerSec: 100,
      scrollLeftPx: 0,
      enabled: true,
      createRangeRef: { current: create },
    }),
  );
  return { host, create };
}

function pointer(type: string, clientX: number) {
  const event = new MouseEvent(type, { clientX, button: 0, bubbles: true });
  return event;
}

describe('useDesktopWaveformCreate', () => {
  it('creates a range when the pointer drags past the threshold', () => {
    const { host, create } = setup();
    act(() => {
      host.dispatchEvent(pointer('pointerdown', 110));
      window.dispatchEvent(pointer('pointermove', 310));
      window.dispatchEvent(pointer('pointerup', 310));
    });
    expect(create).toHaveBeenCalledWith(1000, 3000);
  });

  it('leaves a plain click alone', () => {
    const { host, create } = setup();
    act(() => {
      host.dispatchEvent(pointer('pointerdown', 110));
      window.dispatchEvent(pointer('pointerup', 111));
    });
    expect(create).not.toHaveBeenCalled();
  });
});
