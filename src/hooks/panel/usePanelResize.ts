import { useCallback, useEffect, useRef } from 'react';

type HorizontalPanelResizeConfig = {
  isCollapsed: boolean;
  width: number;
  setWidth: React.Dispatch<React.SetStateAction<number>>;
  boundaryRef: React.RefObject<HTMLElement | null>;
  dragCleanupRef: React.MutableRefObject<(() => void) | null>;
  side: 'left' | 'right';
  minWidth?: number;
  maxWidth?: number;
  maxWidthRatio?: number;
  minRemainingSpace?: number;
  /** Home / 双击回到的宽度 | Width restored by Home / double-click */
  defaultWidth?: number;
};

type VerticalPanelResizeConfig = {
  isHubCollapsed: boolean;
  hubHeight: number;
  setHubHeight: React.Dispatch<React.SetStateAction<number>>;
  screenRef: React.RefObject<HTMLElement | null>;
  dragCleanupRef: React.MutableRefObject<(() => void) | null>;
};

type UsePanelResizeParams = {
  aiPanel?: HorizontalPanelResizeConfig;
  sidePane?: HorizontalPanelResizeConfig;
  hub?: VerticalPanelResizeConfig;
};

function resolveHorizontalBounds(
  config: HorizontalPanelResizeConfig,
): { minWidth: number; maxWidth: number } | null {
  const root = config.boundaryRef.current;
  if (!root) return null;

  const rect = root.getBoundingClientRect();
  const minRemainingSpace = Math.max(0, config.minRemainingSpace ?? 24);
  const maxWidthFromViewport = Math.max(180, rect.width - minRemainingSpace);
  const minWidth = Math.min(config.minWidth ?? 240, maxWidthFromViewport);
  const maxWidthFromConfig = Math.min(config.maxWidth ?? 560, maxWidthFromViewport);
  const maxWidthFromRatio =
    config.maxWidthRatio !== undefined
      ? rect.width * config.maxWidthRatio
      : Number.POSITIVE_INFINITY;
  const maxWidth = Math.max(minWidth, Math.min(maxWidthFromConfig, maxWidthFromRatio));
  return { minWidth, maxWidth };
}

function applyHorizontalWidth(config: HorizontalPanelResizeConfig, rawNextWidth: number) {
  const bounds = resolveHorizontalBounds(config);
  if (!bounds) return;
  config.setWidth(Math.max(bounds.minWidth, Math.min(bounds.maxWidth, Math.round(rawNextWidth))));
}

function startHorizontalResize(
  event: React.PointerEvent<HTMLDivElement>,
  config: HorizontalPanelResizeConfig | undefined,
) {
  if (!config) return;

  event.preventDefault();
  event.stopPropagation();
  if (config.isCollapsed) return;

  const root = config.boundaryRef.current;
  const bounds = resolveHorizontalBounds(config);
  if (!root || !bounds) return;

  const startX = event.clientX;
  const startWidth = config.width;
  const { minWidth, maxWidth } = bounds;

  // 拖拽期间禁用过渡动画，避免 220ms 延迟 | Suppress transitions during drag to avoid 220ms lag
  root.classList.add('is-panel-resizing');

  const onMove = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - startX;
    const rawNextWidth = config.side === 'left' ? startWidth + dx : startWidth - dx;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, rawNextWidth));
    config.setWidth(nextWidth);
  };
  const onUp = () => {
    root.classList.remove('is-panel-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    config.dragCleanupRef.current = null;
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  config.dragCleanupRef.current = onUp;
}

// 键盘与双击沿用 research-connected 的侧栏把手（src/sidebar-resize.ts）：方向键 24px、Shift 80px，
// 朝侧栏外侧的方向键加宽；Home 与双击回到默认宽度。
// Keyboard and double-click follow research-connected's sidebar handle (src/sidebar-resize.ts):
// arrows step 24px (Shift: 80px), the arrow pointing away from the sidebar widens it; Home and
// double-click restore the default width.
const KEYBOARD_RESIZE_STEP = 24;
const KEYBOARD_RESIZE_STEP_LARGE = 80;

function keyboardHorizontalResize(
  event: React.KeyboardEvent<HTMLDivElement>,
  config: HorizontalPanelResizeConfig | undefined,
) {
  if (!config || config.isCollapsed) return;
  let nextWidth: number;
  if (event.key === 'Home') {
    if (config.defaultWidth === undefined) return;
    nextWidth = config.defaultWidth;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const step = event.shiftKey ? KEYBOARD_RESIZE_STEP_LARGE : KEYBOARD_RESIZE_STEP;
    const widens = (event.key === 'ArrowRight') === (config.side === 'left');
    nextWidth = config.width + (widens ? step : -step);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  applyHorizontalWidth(config, nextWidth);
}

function resetHorizontalWidth(config: HorizontalPanelResizeConfig | undefined) {
  if (!config || config.isCollapsed || config.defaultWidth === undefined) return;
  applyHorizontalWidth(config, config.defaultWidth);
}

export function usePanelResize({ aiPanel, sidePane, hub }: UsePanelResizeParams) {
  // 使用 ref 捕获最新 config，避免内联对象导致 useCallback 每帧重建 | Use refs to capture latest config so useCallback stays stable
  const aiPanelRef = useRef(aiPanel);
  aiPanelRef.current = aiPanel;
  const sidePaneRef = useRef(sidePane);
  sidePaneRef.current = sidePane;
  const hubRef = useRef(hub);
  hubRef.current = hub;

  useEffect(
    () => () => {
      const cleanupRefs = [
        aiPanelRef.current?.dragCleanupRef,
        sidePaneRef.current?.dragCleanupRef,
        hubRef.current?.dragCleanupRef,
      ];
      const seen = new Set<(() => void) | null>();
      for (const cleanupRef of cleanupRefs) {
        const cleanup = cleanupRef?.current ?? null;
        if (!cleanup || seen.has(cleanup)) continue;
        seen.add(cleanup);
        cleanup();
      }
    },
    [],
  );

  const handleAiPanelResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    startHorizontalResize(event, aiPanelRef.current);
  }, []);

  const handleSidePaneResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    startHorizontalResize(event, sidePaneRef.current);
  }, []);

  const handleSidePaneResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    keyboardHorizontalResize(event, sidePaneRef.current);
  }, []);

  const handleSidePaneResizeReset = useCallback(() => {
    resetHorizontalWidth(sidePaneRef.current);
  }, []);

  const handleHubResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const hubConfig = hubRef.current;
    if (!hubConfig) return;

    event.preventDefault();
    event.stopPropagation();
    if (hubConfig.isHubCollapsed) return;

    const root = hubConfig.screenRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const startY = event.clientY;
    const startHeight = hubConfig.hubHeight;
    const minHeight = 120;
    const maxHeight = Math.min(800, rootRect.height * 0.6);

    const onMove = (moveEvent: PointerEvent) => {
      const dy = startY - moveEvent.clientY;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
      hubConfig.setHubHeight(nextHeight);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hubConfig.dragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    hubConfig.dragCleanupRef.current = onUp;
  }, []);

  return {
    handleAiPanelResizeStart,
    handleSidePaneResizeStart,
    handleSidePaneResizeKeyDown,
    handleSidePaneResizeReset,
    handleHubResizeStart,
  };
}
