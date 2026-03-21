import { useCallback, useState } from 'react';

const HUB_HEIGHT_KEY = 'jieyu.hub.height';
const HUB_DEFAULT_HEIGHT = 320;

function readPersistedHubHeight(): number {
  try {
    const raw = window.localStorage.getItem(HUB_HEIGHT_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 120 && n <= 800) return n;
    }
  } catch { /* SSR / blocked */ }
  return HUB_DEFAULT_HEIGHT;
}

export function usePanelToggles() {
  const [isLayerRailCollapsed, setIsLayerRailCollapsed] = useState(false);
  const [layerRailTab, setLayerRailTab] = useState<'layers' | 'links'>('layers');
  const [isAiPanelCollapsed, setIsAiPanelCollapsed] = useState(false);
  const [layerRailWidth, setLayerRailWidth] = useState(112);
  const [aiPanelWidth, setAiPanelWidth] = useState(320);
  const [isHubCollapsed, setIsHubCollapsed] = useState(false);
  const [hubHeight, setHubHeight] = useState(readPersistedHubHeight);

  const handleLayerRailToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsLayerRailCollapsed((prev) => !prev);
  }, []);

  const handleAiPanelToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsAiPanelCollapsed((prev) => !prev);
  }, []);

  const handleHubToggle = useCallback(() => {
    setIsHubCollapsed((prev) => !prev);
  }, []);

  // 持久化高度 | Persist hub height
  const setHubHeightPersisted: typeof setHubHeight = useCallback((action) => {
    setHubHeight((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      try { window.localStorage.setItem(HUB_HEIGHT_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  return {
    isLayerRailCollapsed,
    setIsLayerRailCollapsed,
    layerRailTab,
    setLayerRailTab,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    layerRailWidth,
    setLayerRailWidth,
    aiPanelWidth,
    setAiPanelWidth,
    handleLayerRailToggle,
    handleAiPanelToggle,
    isHubCollapsed,
    setIsHubCollapsed,
    hubHeight,
    setHubHeight: setHubHeightPersisted,
    handleHubToggle,
  };
}