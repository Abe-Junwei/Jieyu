import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AiToolGoldenSnapshot, AiToolReplayBundle, AiToolSnapshotDiff } from '../../ai/auditReplay';
import { openReplayBundleByRequestId } from './aiChatReplayUtils';

export function useAiChatReplayBundleOpener({
  compareSnapshot,
  isZh,
  setDecisionReplayFocusRequestId,
  setDecisionReplayLocatedRequestId,
  setReplayLoadingRequestId,
  setReplayErrorMessage,
  setSelectedReplayBundle,
  setSnapshotDiff,
}: {
  compareSnapshot: AiToolGoldenSnapshot | null;
  isZh: boolean;
  setDecisionReplayFocusRequestId: Dispatch<SetStateAction<string | null>>;
  setDecisionReplayLocatedRequestId: Dispatch<SetStateAction<string | null>>;
  setReplayLoadingRequestId: Dispatch<SetStateAction<string | null>>;
  setReplayErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSelectedReplayBundle: Dispatch<SetStateAction<AiToolReplayBundle | null>>;
  setSnapshotDiff: Dispatch<SetStateAction<AiToolSnapshotDiff | null>>;
}) {
  const decisionReplayFocusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (decisionReplayFocusTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(decisionReplayFocusTimerRef.current);
      }
    };
  }, []);

  const openReplayBundle = useCallback(async (requestId: string): Promise<void> => {
    setDecisionReplayFocusRequestId(requestId);
    setDecisionReplayLocatedRequestId(requestId);
    if (decisionReplayFocusTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(decisionReplayFocusTimerRef.current);
    }
    if (typeof window !== 'undefined') {
      decisionReplayFocusTimerRef.current = window.setTimeout(() => {
        setDecisionReplayFocusRequestId((current) => (current === requestId ? null : current));
        decisionReplayFocusTimerRef.current = null;
      }, 1800);
    }
    setReplayLoadingRequestId(requestId);
    setReplayErrorMessage(null);
    const result = await openReplayBundleByRequestId(requestId, compareSnapshot, isZh);
    setSelectedReplayBundle(result.bundle);
    setReplayErrorMessage(result.errorMessage);
    setSnapshotDiff(result.snapshotDiff);
    setReplayLoadingRequestId(null);
  }, [
    compareSnapshot,
    isZh,
    setDecisionReplayFocusRequestId,
    setDecisionReplayLocatedRequestId,
    setReplayErrorMessage,
    setReplayLoadingRequestId,
    setSelectedReplayBundle,
    setSnapshotDiff,
  ]);

  return { openReplayBundle };
}