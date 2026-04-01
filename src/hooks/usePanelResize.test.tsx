// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { usePanelResize } from './usePanelResize';

describe('usePanelResize', () => {
  it('runs active drag cleanup on unmount', () => {
    const cleanup = vi.fn();

    const { unmount } = renderHook(() => {
      const [width, setWidth] = useState(320);
      const boundaryRef = useRef<HTMLElement | null>(document.createElement('div'));
      const dragCleanupRef = useRef<(() => void) | null>(cleanup);

      return usePanelResize({
        sidePane: {
          isCollapsed: false,
          width,
          setWidth,
          boundaryRef,
          dragCleanupRef,
          side: 'left',
        },
      });
    });

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});