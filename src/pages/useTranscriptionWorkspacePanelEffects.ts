import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelAutoCollapse } from '../hooks/usePanelAutoCollapse';
import { useBatchOperationPanelShortcut } from './useBatchOperationPanelShortcut';
import { useEffect } from 'react';

const AI_PANEL_MIN_REMAINING_SPACE = 360;

interface UseTranscriptionWorkspacePanelEffectsInput {
  isAiPanelCollapsed: boolean;
  setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceRef: React.RefObject<HTMLElement | null>;
  aiPanelWidth: number;
  setAiPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  dragCleanupRef: React.MutableRefObject<(() => void) | null>;
  isHubCollapsed: boolean;
  hubHeight: number;
  setHubHeight: React.Dispatch<React.SetStateAction<number>>;
  screenRef: React.RefObject<HTMLElement | null>;
  setShowBatchOperationPanel: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTranscriptionWorkspacePanelEffects({
  isAiPanelCollapsed,
  setIsAiPanelCollapsed,
  workspaceRef,
  aiPanelWidth,
  setAiPanelWidth,
  dragCleanupRef,
  isHubCollapsed,
  hubHeight,
  setHubHeight,
  screenRef,
  setShowBatchOperationPanel,
}: UseTranscriptionWorkspacePanelEffectsInput) {
  useEffect(() => {
    if (isAiPanelCollapsed) return;

    const root = workspaceRef.current;
    if (!root) return;

    const syncAiWidthToViewport = () => {
      const maxVisibleWidth = Math.max(
        180,
        Math.min(900, root.getBoundingClientRect().width - AI_PANEL_MIN_REMAINING_SPACE),
      );
      setAiPanelWidth((prev) => (prev > maxVisibleWidth ? maxVisibleWidth : prev));
    };

    syncAiWidthToViewport();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncAiWidthToViewport();
    });

    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [isAiPanelCollapsed, setAiPanelWidth, workspaceRef]);

  usePanelAutoCollapse({
    isCollapsed: isAiPanelCollapsed,
    setIsCollapsed: setIsAiPanelCollapsed,
    boundaryRef: workspaceRef,
    panelSelector: '.transcription-ai-panel',
    toggleSelector: '.transcription-ai-panel-toggle',
    resizerSelector: '.transcription-ai-panel-resizer',
    ignoreSelectors: [
      '.timeline-annotation',
      '.timeline-annotation-input',
      '.timeline-lane-label',
      '#app-side-pane-body-slot',
      '.app-side-pane',
      '.app-side-pane-collapse-toggle',
      '.app-side-pane-handle-cluster',
    ],
    ignoreInteractiveElements: true,
  });

  const { handleAiPanelResizeStart } = usePanelResize({
    aiPanel: {
      isCollapsed: isAiPanelCollapsed,
      width: aiPanelWidth,
      setWidth: setAiPanelWidth,
      boundaryRef: workspaceRef,
      dragCleanupRef,
      side: 'right',
      minWidth: 240,
      maxWidth: 900,
      minRemainingSpace: AI_PANEL_MIN_REMAINING_SPACE,
    },
    hub: {
      isHubCollapsed,
      hubHeight,
      setHubHeight,
      screenRef,
      dragCleanupRef,
    },
  });

  useBatchOperationPanelShortcut({
    setShowBatchOperationPanel,
  });

  return {
    handleAiPanelResizeStart,
  };
}
