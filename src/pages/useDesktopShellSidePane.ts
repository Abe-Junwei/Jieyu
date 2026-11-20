import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { featureFlags } from '../ai/config/featureFlags';
import { usePanelAutoCollapse } from '~/hooks/panel/usePanelAutoCollapse';
import { usePanelResize } from '~/hooks/panel/usePanelResize';
import { isTranscriptionWorkspacePathname } from '../utils/transcriptionWorkspaceRoute';

const SIDE_PANE_COLLAPSED_KEY = 'jieyu-side-pane-collapsed';
const SIDE_PANE_WIDTH_KEY = 'jieyu-side-pane-width';
const SIDE_PANE_DEFAULT_WIDTH = 272;
const DESKTOP_CONTEXT_PANE_WIDTH = 232;
const SIDE_PANE_MIN_WIDTH = 240;
const SIDE_PANE_MAX_WIDTH = 420;

function readLocalStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readPersistedSidePaneWidth(): number {
  const raw = readLocalStorageValue(SIDE_PANE_WIDTH_KEY);
  if (raw) {
    const next = Number(raw);
    if (Number.isFinite(next) && next >= SIDE_PANE_MIN_WIDTH && next <= SIDE_PANE_MAX_WIDTH)
      return next;
  }
  return SIDE_PANE_DEFAULT_WIDTH;
}

export function useDesktopShellSidePane() {
  const location = useLocation();
  const isTranscriptionRoute = isTranscriptionWorkspacePathname(location.pathname);
  const desktopContextPane =
    isTranscriptionRoute && featureFlags.desktopTranscriptionWorkspaceEnabled;
  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const shellDragCleanupRef = useRef<(() => void) | null>(null);
  const [isSidePaneCollapsed, setIsSidePaneCollapsed] = useState(
    () => readLocalStorageValue(SIDE_PANE_COLLAPSED_KEY) === '1',
  );
  const [sidePaneWidth, setSidePaneWidth] = useState(readPersistedSidePaneWidth);
  const shownPaneWidth =
    desktopContextPane && sidePaneWidth === SIDE_PANE_DEFAULT_WIDTH
      ? DESKTOP_CONTEXT_PANE_WIDTH
      : sidePaneWidth;

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDE_PANE_COLLAPSED_KEY, isSidePaneCollapsed ? '1' : '0');
    } catch {
      // Ignore persistence failures and keep the in-memory panel state.
    }
  }, [isSidePaneCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDE_PANE_WIDTH_KEY, String(sidePaneWidth));
    } catch {
      // Ignore storage write failures.
    }
  }, [sidePaneWidth]);

  useEffect(
    () => () => {
      shellDragCleanupRef.current?.();
    },
    [],
  );

  const shellStyle = useMemo(
    () =>
      ({
        ['--side-pane-width' as '--side-pane-width']: isSidePaneCollapsed
          ? desktopContextPane
            ? '32px'
            : '0px'
          : `${shownPaneWidth}px`,
      }) as CSSProperties,
    [desktopContextPane, isSidePaneCollapsed, shownPaneWidth],
  );

  usePanelAutoCollapse({
    isCollapsed: isSidePaneCollapsed,
    setIsCollapsed: setIsSidePaneCollapsed,
    boundaryRef: shellBodyRef,
    panelSelector: '.app-side-pane',
    toggleSelector: '.app-side-pane-collapse-toggle',
    resizerSelector: '.app-side-pane-resizer',
    ignoreSelectors: ['.app-left-rail'],
    ignoreInteractiveElements: true,
  });

  const resize = usePanelResize({
    sidePane: {
      isCollapsed: isSidePaneCollapsed,
      width: shownPaneWidth,
      setWidth: setSidePaneWidth,
      boundaryRef: shellBodyRef,
      dragCleanupRef: shellDragCleanupRef,
      side: 'left',
      minWidth: desktopContextPane ? DESKTOP_CONTEXT_PANE_WIDTH : SIDE_PANE_MIN_WIDTH,
      maxWidth: SIDE_PANE_MAX_WIDTH,
      maxWidthRatio: 0.45,
      defaultWidth: SIDE_PANE_DEFAULT_WIDTH,
    },
  });

  return {
    location,
    isTranscriptionRoute,
    desktopContextPane,
    shellBodyRef,
    shellStyle,
    isSidePaneCollapsed,
    setIsSidePaneCollapsed,
    sidePaneWidth: shownPaneWidth,
    minWidth: desktopContextPane ? DESKTOP_CONTEXT_PANE_WIDTH : SIDE_PANE_MIN_WIDTH,
    maxWidth: SIDE_PANE_MAX_WIDTH,
    ...resize,
  };
}
