import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { diffAiToolSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import type { getAiChatCardMessages } from '../../i18n/messages';
import { dispatchAppGlobalToast } from '../../utils/appGlobalToast';
import { compactInternalId } from './aiChatCardUtils';
import { exportReplayBundleSnapshot, parseImportedGoldenSnapshot } from './aiChatReplayUtils';

export function useAiChatReplayArtifactActions({
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
}: {
  latestVerticalWorkflowRequestId: string | null;
  setShowDecisionPanel: Dispatch<SetStateAction<boolean>>;
  openReplayBundle: (requestId: string) => Promise<void>;
  copiedVerticalRequestTimerRef: MutableRefObject<number | null>;
  setCopiedVerticalWorkflowRequestId: Dispatch<SetStateAction<string | null>>;
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  setReplayErrorMessage: Dispatch<SetStateAction<string | null>>;
  selectedReplayBundle: AiToolReplayBundle | null;
  isZh: boolean;
  setSelectedReplayBundle: Dispatch<SetStateAction<AiToolReplayBundle | null>>;
  setExportedSnapshotRequestId: Dispatch<SetStateAction<string | null>>;
  exportedSnapshotTimerRef: MutableRefObject<number | null>;
  setCompareSnapshot: Dispatch<SetStateAction<AiToolGoldenSnapshot | null>>;
  setSnapshotDiff: Dispatch<SetStateAction<AiToolSnapshotDiff | null>>;
}) {
  const openLatestVerticalWorkflowReplay = useCallback((): void => {
    if (!latestVerticalWorkflowRequestId) return;
    setShowDecisionPanel(true);
    void openReplayBundle(latestVerticalWorkflowRequestId);
  }, [latestVerticalWorkflowRequestId, openReplayBundle, setShowDecisionPanel]);

  const copyLatestVerticalWorkflowRequestId = useCallback((): void => {
    if (!latestVerticalWorkflowRequestId || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const compactRequestId = compactInternalId(latestVerticalWorkflowRequestId);
    void navigator.clipboard.writeText(compactRequestId);
    dispatchAppGlobalToast({
      message: cardMessages.verticalWorkflowRequestCopied(compactRequestId),
      variant: 'success',
      autoDismissMs: 1400,
    });
    if (copiedVerticalRequestTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(copiedVerticalRequestTimerRef.current);
    }
    setCopiedVerticalWorkflowRequestId(latestVerticalWorkflowRequestId);
    if (typeof window !== 'undefined') {
      copiedVerticalRequestTimerRef.current = window.setTimeout(() => {
        setCopiedVerticalWorkflowRequestId((current) => (current === latestVerticalWorkflowRequestId ? null : current));
      }, 1200);
    }
  }, [
    cardMessages,
    copiedVerticalRequestTimerRef,
    latestVerticalWorkflowRequestId,
    setCopiedVerticalWorkflowRequestId,
  ]);

  const exportGoldenSnapshot = useCallback(async (requestId: string): Promise<void> => {
    setReplayErrorMessage(null);
    const result = await exportReplayBundleSnapshot(requestId, selectedReplayBundle, isZh);
    if (result.errorMessage) {
      setReplayErrorMessage(result.errorMessage);
      return;
    }

    if (result.bundle) {
      setSelectedReplayBundle(result.bundle);
      setExportedSnapshotRequestId(requestId);
      if (typeof window !== 'undefined' && exportedSnapshotTimerRef.current !== null) {
        window.clearTimeout(exportedSnapshotTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        exportedSnapshotTimerRef.current = window.setTimeout(() => {
          setExportedSnapshotRequestId((current) => (current === requestId ? null : current));
          exportedSnapshotTimerRef.current = null;
        }, 1200);
      }
    }
  }, [
    exportedSnapshotTimerRef,
    isZh,
    selectedReplayBundle,
    setExportedSnapshotRequestId,
    setReplayErrorMessage,
    setSelectedReplayBundle,
  ]);

  const importSnapshotForCompare = useCallback((file: File): void => {
    setReplayErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseImportedGoldenSnapshot((e.target?.result as string) ?? '', isZh);
      if (result.errorMessage) {
        setReplayErrorMessage(result.errorMessage);
        return;
      }

      if (result.snapshot) {
        setCompareSnapshot(result.snapshot);
        setSnapshotDiff(
          selectedReplayBundle
            ? diffAiToolSnapshot(result.snapshot, selectedReplayBundle)
            : null,
        );
      }
    };
    reader.readAsText(file);
  }, [isZh, selectedReplayBundle, setCompareSnapshot, setReplayErrorMessage, setSnapshotDiff]);

  return {
    openLatestVerticalWorkflowReplay,
    copyLatestVerticalWorkflowRequestId,
    exportGoldenSnapshot,
    importSnapshotForCompare,
  };
}