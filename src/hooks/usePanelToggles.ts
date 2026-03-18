import { useCallback, useState } from 'react';

export function usePanelToggles() {
  const [isLayerRailCollapsed, setIsLayerRailCollapsed] = useState(false);
  const [layerRailTab, setLayerRailTab] = useState<'layers' | 'links'>('layers');
  const [isAiPanelCollapsed, setIsAiPanelCollapsed] = useState(false);
  const [layerRailWidth, setLayerRailWidth] = useState(112);
  const [aiPanelWidth, setAiPanelWidth] = useState(320);

  const handleLayerRailToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsLayerRailCollapsed((prev) => !prev);
  }, []);

  const handleAiPanelToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsAiPanelCollapsed((prev) => !prev);
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
  };
}