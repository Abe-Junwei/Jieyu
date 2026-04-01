import { useEffect } from 'react';

type UsePanelAutoCollapseParams = {
  hoverExpandEnabled: boolean;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  boundaryRef: React.RefObject<HTMLElement | null>;
  panelSelector: string;
  toggleSelector?: string;
  resizerSelector?: string;
  hoverZoneSelector?: string;
  ignoreSelectors?: string[];
  ignoreInteractiveElements?: boolean;
  hoverExpandEdge?: 'left' | 'right';
  hoverExpandEdgeThresholdPx?: number;
};

const DEFAULT_EDGE_THRESHOLD_PX = 12;
const DEFAULT_INTERACTIVE_SELECTOR = 'button, input, textarea, select, a, [role="button"]';
export const APP_SIDE_PANE_INTERACTION_SELECTOR = [
  '[data-layer-pane-interactive="true"]',
  '#app-side-pane-body-slot',
  '.app-side-pane',
  '.app-side-pane-handle-cluster',
  '.app-side-pane-hover-zone',
  '.app-side-pane-resizer',
  '.app-side-pane-collapse-toggle',
].join(', ');

function matchesClosestSelector(target: Element, selectors: Array<string | undefined>): boolean {
  return selectors.some((selector) => {
    if (!selector) return false;
    return Boolean(target.closest(selector));
  });
}

export function usePanelAutoCollapse({
  hoverExpandEnabled,
  isCollapsed,
  setIsCollapsed,
  boundaryRef,
  panelSelector,
  toggleSelector,
  resizerSelector,
  hoverZoneSelector,
  ignoreSelectors = [],
  ignoreInteractiveElements = false,
  hoverExpandEdge,
  hoverExpandEdgeThresholdPx = DEFAULT_EDGE_THRESHOLD_PX,
}: UsePanelAutoCollapseParams) {
  // 面板外点击自动收起 | Auto-collapse panel when clicking outside
  useEffect(() => {
    if (isCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = boundaryRef.current;
      if (!root) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!root.contains(target)) return;

      if (matchesClosestSelector(target, [
        panelSelector,
        toggleSelector,
        resizerSelector,
        hoverZoneSelector,
        ...ignoreSelectors,
      ])) {
        return;
      }

      if (ignoreInteractiveElements && target.closest(DEFAULT_INTERACTIVE_SELECTOR)) {
        return;
      }

      setIsCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [
    boundaryRef,
    hoverZoneSelector,
    ignoreInteractiveElements,
    ignoreSelectors,
    isCollapsed,
    panelSelector,
    resizerSelector,
    setIsCollapsed,
    toggleSelector,
  ]);

  // 贴边悬停自动展开 | Expand panel when hovering near the screen edge
  useEffect(() => {
    if (!hoverExpandEnabled) return;
    if (!isCollapsed) return;
    if (!hoverExpandEdge) return;

    let lastTrigger = 0;
    const onPointerMove = (event: PointerEvent) => {
      const now = Date.now();
      if (now - lastTrigger < 200) return;

      const hitLeftEdge = hoverExpandEdge === 'left' && event.clientX <= hoverExpandEdgeThresholdPx;
      const hitRightEdge = hoverExpandEdge === 'right' && event.clientX >= window.innerWidth - hoverExpandEdgeThresholdPx;

      if (hitLeftEdge || hitRightEdge) {
        lastTrigger = now;
        setIsCollapsed(false);
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
    };
  }, [hoverExpandEdge, hoverExpandEdgeThresholdPx, hoverExpandEnabled, isCollapsed, setIsCollapsed]);
}