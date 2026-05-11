// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
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

  it('resizes right-side AI panel when dragging left from handle', () => {
    const { result } = renderHook(() => {
      const [width, setWidth] = useState(320);
      const boundary = document.createElement('div');
      boundary.getBoundingClientRect = () => ({
        width: 1000,
        height: 600,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const boundaryRef = useRef<HTMLElement | null>(boundary);
      const dragCleanupRef = useRef<(() => void) | null>(null);

      const handlers = usePanelResize({
        aiPanel: {
          isCollapsed: false,
          width,
          setWidth,
          boundaryRef,
          dragCleanupRef,
          side: 'right',
          minWidth: 240,
          maxWidth: 720,
          maxWidthRatio: 0.75,
        },
      });

      return { ...handlers, width };
    });

    const startEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 600,
    } as unknown as React.PointerEvent<HTMLDivElement>;

    act(() => {
      result.current.handleAiPanelResizeStart(startEvent);
    });

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 520 }));
    });

    expect(result.current.width).toBe(400);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });

  it('does not apply hidden ratio cap when maxWidthRatio is omitted', () => {
    const { result } = renderHook(() => {
      const [width, setWidth] = useState(380);
      const boundary = document.createElement('div');
      boundary.getBoundingClientRect = () => ({
        width: 1000,
        height: 600,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const boundaryRef = useRef<HTMLElement | null>(boundary);
      const dragCleanupRef = useRef<(() => void) | null>(null);

      const handlers = usePanelResize({
        aiPanel: {
          isCollapsed: false,
          width,
          setWidth,
          boundaryRef,
          dragCleanupRef,
          side: 'right',
          minWidth: 240,
          maxWidth: 900,
        },
      });

      return { ...handlers, width };
    });

    const startEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 300,
    } as unknown as React.PointerEvent<HTMLDivElement>;

    act(() => {
      result.current.handleAiPanelResizeStart(startEvent);
    });

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: -500 }));
    });

    expect(result.current.width).toBe(900);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });

  it('clamps right-side panel width by current viewport capacity', () => {
    const { result } = renderHook(() => {
      const [width, setWidth] = useState(380);
      const boundary = document.createElement('div');
      boundary.getBoundingClientRect = () => ({
        width: 300,
        height: 600,
        left: 0,
        top: 0,
        right: 300,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const boundaryRef = useRef<HTMLElement | null>(boundary);
      const dragCleanupRef = useRef<(() => void) | null>(null);

      const handlers = usePanelResize({
        aiPanel: {
          isCollapsed: false,
          width,
          setWidth,
          boundaryRef,
          dragCleanupRef,
          side: 'right',
          minWidth: 240,
          maxWidth: 900,
        },
      });

      return { ...handlers, width };
    });

    const startEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 280,
    } as unknown as React.PointerEvent<HTMLDivElement>;

    act(() => {
      result.current.handleAiPanelResizeStart(startEvent);
    });

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 }));
    });

    expect(result.current.width).toBe(276);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });

  it('honors minRemainingSpace when computing maximum width', () => {
    const { result } = renderHook(() => {
      const [width, setWidth] = useState(380);
      const boundary = document.createElement('div');
      boundary.getBoundingClientRect = () => ({
        width: 1000,
        height: 600,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const boundaryRef = useRef<HTMLElement | null>(boundary);
      const dragCleanupRef = useRef<(() => void) | null>(null);

      const handlers = usePanelResize({
        aiPanel: {
          isCollapsed: false,
          width,
          setWidth,
          boundaryRef,
          dragCleanupRef,
          side: 'right',
          minWidth: 240,
          maxWidth: 900,
          minRemainingSpace: 360,
        },
      });

      return { ...handlers, width };
    });

    const startEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 600,
    } as unknown as React.PointerEvent<HTMLDivElement>;

    act(() => {
      result.current.handleAiPanelResizeStart(startEvent);
    });

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: -500 }));
    });

    expect(result.current.width).toBe(640);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });
});
