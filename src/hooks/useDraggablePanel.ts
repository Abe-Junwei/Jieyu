import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type PanelPosition = { x: number; y: number };
export type PanelSize = { width: number; height: number };

export interface UseDraggablePanelOptions {
  storageKey: string;
  defaultPosition?: PanelPosition;
  defaultSize: PanelSize;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  margin?: number;
}

export function useDraggablePanel({
  storageKey,
  defaultPosition = { x: 24, y: 24 },
  defaultSize,
  minWidth = 280,
  minHeight = 180,
  maxWidth = 760,
  maxHeight = 560,
  margin = 8,
}: UseDraggablePanelOptions) {
  // Use custom local storage hook for persistence
  const [storedRect, setStoredRect, removeStoredRect] = useLocalStorage<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(storageKey, null);

  const [position, setPosition] = useState<PanelPosition>(() => {
    if (storedRect) return { x: storedRect.x, y: storedRect.y };
    return defaultPosition;
  });

  const [size, setSize] = useState<PanelSize>(() => {
    if (storedRect) return { width: storedRect.width, height: storedRect.height };
    return defaultSize;
  });

  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const initializedStorageKeyRef = useRef<string | null>(null);
  const currentPositionRef = useRef<PanelPosition>(position);
  const currentSizeRef = useRef<PanelSize>(size);

  // Keep refs in sync with state to avoid stale closures in event listeners
  useEffect(() => {
    currentPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    currentSizeRef.current = size;
  }, [size]);

  // Sync state to local storage when changed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setStoredRect({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    });
  }, [position.x, position.y, size.width, size.height, setStoredRect]);

  const clampSizeToViewport = useCallback((candidate: PanelSize): PanelSize => {
    if (typeof window === 'undefined') return candidate;
    return {
      width: Math.min(
        Math.max(Math.round(candidate.width), minWidth),
        Math.min(maxWidth, Math.max(minWidth, window.innerWidth - margin * 2)),
      ),
      height: Math.min(
        Math.max(Math.round(candidate.height), minHeight),
        Math.min(maxHeight, Math.max(minHeight, window.innerHeight - margin * 2)),
      ),
    };
  }, [minWidth, minHeight, maxWidth, maxHeight, margin]);

  const clampPositionToViewport = useCallback((candidate: PanelPosition, withSize: PanelSize): PanelPosition => {
    if (typeof window === 'undefined') return candidate;
    const maxX = Math.max(margin, window.innerWidth - withSize.width - margin);
    const maxY = Math.max(margin, window.innerHeight - withSize.height - margin);
    return {
      x: Math.min(Math.max(margin, Math.round(candidate.x)), maxX),
      y: Math.min(Math.max(margin, Math.round(candidate.y)), maxY),
    };
  }, [margin]);

  const centerPanel = useCallback((withSize: PanelSize): void => {
    if (typeof window === 'undefined') return;
    const safeSize = clampSizeToViewport(withSize);
    setSize(safeSize);
    setPosition(clampPositionToViewport({
      x: Math.round((window.innerWidth - safeSize.width) / 2),
      y: Math.round((window.innerHeight - safeSize.height) / 2),
    }, safeSize));
  }, [clampPositionToViewport, clampSizeToViewport]);

  // Initial centering logic
  useEffect(() => {
    if (initializedStorageKeyRef.current === storageKey) return;
    initializedStorageKeyRef.current = storageKey;
    if (typeof window === 'undefined') return;
    
    if (!storedRect) {
      // Center panel on first appearance
      centerPanel(size);
      return;
    }
    
    const safeSize = clampSizeToViewport(size);
    setSize(safeSize);
    setPosition((prev) => clampPositionToViewport(prev, safeSize));
  }, [centerPanel, clampPositionToViewport, clampSizeToViewport, size, storageKey, storedRect]);

  // Window resize handler
  useEffect(() => {
    const onResize = (): void => {
      const safeSize = clampSizeToViewport(currentSizeRef.current);
      setSize(safeSize);
      setPosition((prev) => clampPositionToViewport(prev, safeSize));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPositionToViewport, clampSizeToViewport]);

  // Drag and resize handlers
  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      if (dragRef.current) {
        const nextX = dragRef.current.startLeft + (event.clientX - dragRef.current.startX);
        const nextY = dragRef.current.startTop + (event.clientY - dragRef.current.startY);
        setPosition(clampPositionToViewport({ x: nextX, y: nextY }, currentSizeRef.current));
        return;
      }
      if (resizeRef.current) {
        const rawWidth = resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX);
        const rawHeight = resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY);
        const maxWidthByViewport = Math.max(minWidth, window.innerWidth - currentPositionRef.current.x - margin);
        const maxHeightByViewport = Math.max(minHeight, window.innerHeight - currentPositionRef.current.y - margin);
        setSize(clampSizeToViewport({
          width: Math.min(rawWidth, Math.min(maxWidth, maxWidthByViewport)),
          height: Math.min(rawHeight, Math.min(maxHeight, maxHeightByViewport)),
        }));
      }
    };

    const onPointerUp = (): void => {
      if (dragRef.current || resizeRef.current) {
        dragRef.current = null;
        resizeRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [clampPositionToViewport, clampSizeToViewport, margin, maxHeight, maxWidth, minHeight, minWidth]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: currentPositionRef.current.x,
      startTop: currentPositionRef.current.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
  }, []);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: currentSizeRef.current.width,
      startHeight: currentSizeRef.current.height,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  }, []);

  const handleRecenter = useCallback((): void => {
    centerPanel(size);
  }, [centerPanel, size]);

  const handleResetPanelLayout = useCallback((event?: React.MouseEvent<HTMLButtonElement>): void => {
    event?.stopPropagation();
    removeStoredRect();
    centerPanel(defaultSize);
  }, [centerPanel, defaultSize, removeStoredRect]);

  return {
    position,
    size,
    handleDragStart,
    handleResizeStart,
    handleRecenter,
    handleResetPanelLayout,
  };
}
