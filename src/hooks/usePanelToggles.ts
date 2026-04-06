import { useCallback, useState } from 'react';
import { createLogger } from '../observability/logger';

const HUB_HEIGHT_KEY = 'jieyu.hub.height';
const HUB_DEFAULT_HEIGHT = 320;
const AI_PANEL_DEFAULT_WIDTH = 380;
const log = createLogger('usePanelToggles');

function readPersistedHubHeight(): number {
  try {
    const raw = window.localStorage.getItem(HUB_HEIGHT_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 120 && n <= 800) return n;
    }
  } catch (error) {
    log.warn('Failed to read persisted hub height from localStorage', {
      key: HUB_HEIGHT_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return HUB_DEFAULT_HEIGHT;
}

export function usePanelToggles() {
  const [isAiPanelCollapsed, setIsAiPanelCollapsed] = useState(true);
  const [aiPanelWidth, setAiPanelWidth] = useState(AI_PANEL_DEFAULT_WIDTH);
  const [isHubCollapsed, setIsHubCollapsed] = useState(false);
  const [hubHeight, setHubHeight] = useState(readPersistedHubHeight);

  const handleAiPanelToggle = useCallback((e?: React.SyntheticEvent<HTMLElement>) => {
    e?.stopPropagation();
    setIsAiPanelCollapsed((prev) => !prev);
  }, []);

  const handleHubToggle = useCallback(() => {
    setIsHubCollapsed((prev) => !prev);
  }, []);

  // 持久化高度 | Persist hub height
  const setHubHeightPersisted: typeof setHubHeight = useCallback((action) => {
    setHubHeight((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        window.localStorage.setItem(HUB_HEIGHT_KEY, String(next));
      } catch (error) {
        log.warn('Failed to persist hub height to localStorage', {
          key: HUB_HEIGHT_KEY,
          next,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return next;
    });
  }, []);

  return {
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    handleAiPanelToggle,
    isHubCollapsed,
    setIsHubCollapsed,
    hubHeight,
    setHubHeight: setHubHeightPersisted,
    handleHubToggle,
  };
}