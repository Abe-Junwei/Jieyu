// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTimelineLaneHeightResize } from './useTimelineLaneHeightResize';

describe('useTimelineLaneHeightResize', () => {
  it('inverts the drag direction when resizing from the top edge', () => {
    const onLaneHeightChange = vi.fn();
    const { result } = renderHook(() => useTimelineLaneHeightResize(onLaneHeightChange));

    act(() => {
      result.current.startLaneHeightResize({
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLDivElement>, 'layer-a', 80, 'top');
    });

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 112 }));
    });

    expect(onLaneHeightChange).toHaveBeenLastCalledWith('layer-a', 68);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });

  it('keeps the current drag direction when resizing from the bottom edge', () => {
    const onLaneHeightChange = vi.fn();
    const { result } = renderHook(() => useTimelineLaneHeightResize(onLaneHeightChange));

    act(() => {
      result.current.startLaneHeightResize({
        clientY: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLDivElement>, 'layer-a', 80, 'bottom');
    });

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 112 }));
    });

    expect(onLaneHeightChange).toHaveBeenLastCalledWith('layer-a', 92);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });
});
