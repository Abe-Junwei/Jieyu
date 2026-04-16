import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type UseReadyWorkspaceRenderControllerInput = {
  isAiPanelCollapsed: boolean;
  flushDeferredAiRuntime: () => void;
  aiPendingToolCall: unknown;
  setHubSidebarTab: Dispatch<SetStateAction<'assistant' | 'analysis'>>;
  setIsAiPanelCollapsed: Dispatch<SetStateAction<boolean>>;
  showProjectSetup: boolean;
  showAudioImport: boolean;
  audioDeleteConfirm: unknown;
  projectDeleteConfirm: unknown;
  showShortcuts: boolean;
  isFocusMode: boolean;
  pdfPreviewRequest: unknown;
  showBatchOperationPanel: boolean;
  recoveryAvailable: boolean;
};

/**
 * ReadyWorkspace 渲染门控控制器 | Isolate sidebar activation and render gates from the page shell.
 */
export function useReadyWorkspaceRenderController(input: UseReadyWorkspaceRenderControllerInput) {
  const [hasActivatedAiSidebar, setHasActivatedAiSidebar] = useState(false);

  useEffect(() => {
    if (input.isAiPanelCollapsed) {
      return;
    }
    setHasActivatedAiSidebar(true);
    input.flushDeferredAiRuntime();
  }, [input.flushDeferredAiRuntime, input.isAiPanelCollapsed]);

  useEffect(() => {
    if (!input.aiPendingToolCall) return;
    input.setHubSidebarTab('assistant');
    setHasActivatedAiSidebar(true);
    input.setIsAiPanelCollapsed(false);
  }, [input.aiPendingToolCall, input.setHubSidebarTab, input.setIsAiPanelCollapsed]);

  return {
    shouldRenderAiSidebar: hasActivatedAiSidebar || !input.isAiPanelCollapsed,
    shouldRenderDialogs: Boolean(
      input.showProjectSetup
        || input.showAudioImport
        || input.audioDeleteConfirm
        || input.projectDeleteConfirm
        || input.showShortcuts
        || input.isFocusMode,
    ),
    shouldRenderPdfRuntime: input.pdfPreviewRequest !== null,
    shouldRenderBatchOps: input.showBatchOperationPanel,
    shouldRenderRecoveryBanner: input.recoveryAvailable,
  };
}
