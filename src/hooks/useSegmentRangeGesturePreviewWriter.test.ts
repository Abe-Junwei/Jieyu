// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSegmentRangeGesturePreviewWriter } from './useSegmentRangeGesturePreviewWriter';

describe('useSegmentRangeGesturePreviewWriter', () => {
  it('updates time drag and read model', () => {
    const { result } = renderHook(() => useSegmentRangeGesturePreviewWriter());
    expect(result.current.segmentRangeGesturePreviewReadModel.surface).toBe('none');

    act(() => {
      result.current.setDragPreview({ id: 'u1', start: 1, end: 2 });
    });
    expect(result.current.dragPreview).toEqual({ id: 'u1', start: 1, end: 2 });
    expect(result.current.segmentRangeGesturePreviewReadModel).toEqual({
      surface: 'timeRange',
      preview: { id: 'u1', start: 1, end: 2 },
    });
  });
});
