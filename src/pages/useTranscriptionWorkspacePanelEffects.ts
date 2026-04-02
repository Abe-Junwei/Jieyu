import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelAutoCollapse } from '../hooks/usePanelAutoCollapse';
import { useBatchOperationPanelShortcut } from './useBatchOperationPanelShortcut';

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
      maxWidth: 560,
      maxWidthRatio: 0.6,
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
