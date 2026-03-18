import { useCallback } from 'react';
import type { UtteranceDocType, UtteranceTextDocType } from '../../db';
import { useDeleteConfirmFlow } from './useDeleteConfirmFlow';
import { resolveDeletePlan } from '../utils/deleteSelectionUtils';
import { fireAndForget } from '../utils/fireAndForget';

interface UseUtteranceOpsInput {
  utterances: UtteranceDocType[];
  translationTextByLayer: Map<string, Map<string, UtteranceTextDocType>>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteSelectedUtterances: (ids: Set<string>) => Promise<void>;
  mergeSelectedUtterances: (ids: Set<string>) => Promise<void>;
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  splitUtterance: (id: string, splitTime: number) => Promise<void>;
  selectAllBefore: (id: string) => void;
  selectAllAfter: (id: string) => void;
}

export function useUtteranceOps(input: UseUtteranceOpsInput) {
  const {
    translationTextByLayer,
    deleteUtterance, deleteSelectedUtterances,
    mergeSelectedUtterances, mergeWithPrevious, mergeWithNext,
    splitUtterance, selectAllBefore, selectAllAfter,
  } = input;

  /** Check if an utterance has any text content (transcription or translations). */
  const utteranceHasText = useCallback((uttId: string): boolean => {
    for (const [, layerMap] of translationTextByLayer) {
      const t = layerMap.get(uttId);
      if (t?.text?.trim()) return true;
    }
    return false;
  }, [translationTextByLayer]);

  const {
    requestDeleteUtterances,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useDeleteConfirmFlow(utteranceHasText);

  const runDeleteSelection = useCallback((primaryId: string, ids: Set<string>) => {
    const plan = resolveDeletePlan(primaryId, ids);
    if (plan.kind === 'none') return;
    if (plan.kind === 'multi') {
      requestDeleteUtterances(plan.ids, () => { fireAndForget(deleteSelectedUtterances(plan.ids)); });
      return;
    }
    requestDeleteUtterances(plan.id, () => { fireAndForget(deleteUtterance(plan.id)); });
  }, [requestDeleteUtterances, deleteSelectedUtterances, deleteUtterance]);

  const runDeleteOne = useCallback((id: string) => {
    runDeleteSelection(id, new Set([id]));
  }, [runDeleteSelection]);

  const runMergeSelection = useCallback((ids: Set<string>) => {
    if (ids.size <= 1) return;
    fireAndForget(mergeSelectedUtterances(ids));
  }, [mergeSelectedUtterances]);

  const runMergePrev = useCallback((id: string) => {
    if (!id) return;
    fireAndForget(mergeWithPrevious(id));
  }, [mergeWithPrevious]);

  const runMergeNext = useCallback((id: string) => {
    if (!id) return;
    fireAndForget(mergeWithNext(id));
  }, [mergeWithNext]);

  const runSplitAtTime = useCallback((id: string, splitTime: number) => {
    if (!id) return;
    fireAndForget(splitUtterance(id, splitTime));
  }, [splitUtterance]);

  const runSelectBefore = useCallback((id: string) => {
    if (!id) return;
    selectAllBefore(id);
  }, [selectAllBefore]);

  const runSelectAfter = useCallback((id: string) => {
    if (!id) return;
    selectAllAfter(id);
  }, [selectAllAfter]);

  return {
    utteranceHasText,
    runDeleteSelection,
    runDeleteOne,
    runMergeSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  };
}
