import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AiToolGoldenSnapshot, AiToolReplayBundle, AiToolSnapshotDiff } from '../../ai/auditReplay';
import type { getAiChatCardMessages } from '../../i18n/messages';
import { useAiChatReplayArtifactActions } from './useAiChatReplayArtifactActions';
import { useAiChatReplayBundleOpener } from './useAiChatReplayBundleOpener';

export function useAiChatReplayController({
  compareSnapshot,
  isZh,
  setDecisionReplayFocusRequestId,
  setDecisionReplayLocatedRequestId,
  setReplayLoadingRequestId,
  setReplayErrorMessage,
  setSelectedReplayBundle,
  setSnapshotDiff,
  latestVerticalWorkflowRequestId,
  setShowDecisionPanel,
  copiedVerticalRequestTimerRef,
  setCopiedVerticalWorkflowRequestId,
  cardMessages,
  selectedReplayBundle,
  setExportedSnapshotRequestId,
  exportedSnapshotTimerRef,
  setCompareSnapshot,
}: {
  compareSnapshot: AiToolGoldenSnapshot | null;
  isZh: boolean;
  setDecisionReplayFocusRequestId: Dispatch<SetStateAction<string | null>>;
  setDecisionReplayLocatedRequestId: Dispatch<SetStateAction<string | null>>;
  setReplayLoadingRequestId: Dispatch<SetStateAction<string | null>>;
  setReplayErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSelectedReplayBundle: Dispatch<SetStateAction<AiToolReplayBundle | null>>;
  setSnapshotDiff: Dispatch<SetStateAction<AiToolSnapshotDiff | null>>;
  latestVerticalWorkflowRequestId: string | null;
  setShowDecisionPanel: Dispatch<SetStateAction<boolean>>;
  copiedVerticalRequestTimerRef: MutableRefObject<number | null>;
  setCopiedVerticalWorkflowRequestId: Dispatch<SetStateAction<string | null>>;
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  selectedReplayBundle: AiToolReplayBundle | null;
  setExportedSnapshotRequestId: Dispatch<SetStateAction<string | null>>;
  exportedSnapshotTimerRef: MutableRefObject<number | null>;
  setCompareSnapshot: Dispatch<SetStateAction<AiToolGoldenSnapshot | null>>;
}) {
  const { openReplayBundle } = useAiChatReplayBundleOpener({
    compareSnapshot,
    isZh,
    setDecisionReplayFocusRequestId,
    setDecisionReplayLocatedRequestId,
    setReplayLoadingRequestId,
    setReplayErrorMessage,
    setSelectedReplayBundle,
    setSnapshotDiff,
  });

  const {
    openLatestVerticalWorkflowReplay,
    copyLatestVerticalWorkflowRequestId,
    exportGoldenSnapshot,
    importSnapshotForCompare,
  } = useAiChatReplayArtifactActions({
    latestVerticalWorkflowRequestId,
    setShowDecisionPanel,
    openReplayBundle,
    copiedVerticalRequestTimerRef,
    setCopiedVerticalWorkflowRequestId,
    cardMessages,
    setReplayErrorMessage,
    selectedReplayBundle,
    isZh,
    setSelectedReplayBundle,
    setExportedSnapshotRequestId,
    exportedSnapshotTimerRef,
    setCompareSnapshot,
    setSnapshotDiff,
  });

  return {
    openReplayBundle,
    openLatestVerticalWorkflowReplay,
    copyLatestVerticalWorkflowRequestId,
    exportGoldenSnapshot,
    importSnapshotForCompare,
  };
}
