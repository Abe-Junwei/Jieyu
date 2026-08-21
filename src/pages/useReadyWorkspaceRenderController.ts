import { useEffect, useState } from 'react';

type UseReadyWorkspaceRenderControllerInput = {
  isAiPanelCollapsed: boolean;
  flushDeferredAiRuntime: () => void;
  aiPendingToolCall: unknown;
  setHubSidebarTab: (tab: 'assistant' | 'analysis') => void;
  setIsAiPanelCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
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

  const {
    isAiPanelCollapsed,
    flushDeferredAiRuntime,
    showProjectSetup,
    showAudioImport,
    audioDeleteConfirm,
    projectDeleteConfirm,
    showShortcuts,
    isFocusMode,
    pdfPreviewRequest,
    showBatchOperationPanel,
    recoveryAvailable,
  } = input;

  useEffect(() => {
    if (isAiPanelCollapsed) {
      return;
    }
    setHasActivatedAiSidebar(true);
    flushDeferredAiRuntime();
  }, [isAiPanelCollapsed, flushDeferredAiRuntime]);

  return {
    shouldRenderAiSidebar: hasActivatedAiSidebar || !isAiPanelCollapsed,
    shouldRenderDialogs: Boolean(
      showProjectSetup ||
      showAudioImport ||
      (audioDeleteConfirm !== null && audioDeleteConfirm !== undefined) ||
      (projectDeleteConfirm !== null && projectDeleteConfirm !== undefined) ||
      showShortcuts ||
      isFocusMode,
    ),
    shouldRenderPdfRuntime: pdfPreviewRequest !== null,
    shouldRenderBatchOps: showBatchOperationPanel,
    shouldRenderRecoveryBanner: recoveryAvailable,
  };
}
