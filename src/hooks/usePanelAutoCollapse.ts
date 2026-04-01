import { useEffect } from 'react';

type UsePanelAutoCollapseParams = {
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  boundaryRef: React.RefObject<HTMLElement | null>;
  panelSelector: string;
  toggleSelector?: string;
  resizerSelector?: string;
  ignoreSelectors?: string[];
  ignoreInteractiveElements?: boolean;
};
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
  isCollapsed,
  setIsCollapsed,
  boundaryRef,
  panelSelector,
  toggleSelector,
  resizerSelector,
  ignoreSelectors = [],
  ignoreInteractiveElements = false,
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
    ignoreInteractiveElements,
    ignoreSelectors,
    isCollapsed,
    panelSelector,
    resizerSelector,
    setIsCollapsed,
    toggleSelector,
  ]);
}