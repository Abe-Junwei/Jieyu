import { useCallback } from 'react';
import type { LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { useDeleteConfirmFlow } from './useDeleteConfirmFlow';
import { resolveDeletePlan } from '../utils/deleteSelectionUtils';
import { fireAndForget } from '../utils/fireAndForget';

interface UseUnitOpsInput {
  units: LayerUnitDocType[];
  translationTextByLayer: Map<string, Map<string, LayerUnitContentDocType>>;
  deleteUnit: (id: string) => Promise<void>;
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  mergeSelectedUnits: (ids: Set<string>) => Promise<void>;
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  onMergeTargetMissing?: () => void;
  splitUnit: (id: string, splitTime: number) => Promise<void>;
  selectAllBefore: (id: string) => void;
  selectAllAfter: (id: string) => void;
}

export function useUnitOps(input: UseUnitOpsInput) {
  const {
    translationTextByLayer,
    deleteUnit, deleteSelectedUnits,
    mergeSelectedUnits, mergeWithPrevious, mergeWithNext,
    onMergeTargetMissing,
    splitUnit, selectAllBefore, selectAllAfter,
  } = input;

  /** Check if an unit has any text content (transcription or translations). */
  const unitHasText = useCallback((uttId: string): boolean => {
    for (const [, layerMap] of translationTextByLayer) {
      const t = layerMap.get(uttId);
      if (t?.text?.trim()) return true;
    }
    return false;
  }, [translationTextByLayer]);

  const {
    requestDeleteUnits,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useDeleteConfirmFlow(unitHasText);

  const runDeleteSelection = useCallback((primaryId: string, ids: Set<string>) => {
    const plan = resolveDeletePlan(primaryId, ids);
    if (plan.kind === 'none') return;
    if (plan.kind === 'multi') {
      requestDeleteUnits(plan.ids, () => { fireAndForget(deleteSelectedUnits(plan.ids), { context: 'src/hooks/useUnitOps.ts:L52', policy: 'user-visible' }); });
      return;
    }
    requestDeleteUnits(plan.id, () => { fireAndForget(deleteUnit(plan.id), { context: 'src/hooks/useUnitOps.ts:L55', policy: 'user-visible' }); });
  }, [requestDeleteUnits, deleteSelectedUnits, deleteUnit]);

  const runDeleteOne = useCallback((id: string) => {
    runDeleteSelection(id, new Set([id]));
  }, [runDeleteSelection]);

  const runMergeSelection = useCallback((ids: Set<string>) => {
    if (ids.size <= 1) return;
    fireAndForget(mergeSelectedUnits(ids), { context: 'src/hooks/useUnitOps.ts:L64', policy: 'user-visible' });
  }, [mergeSelectedUnits]);

  const runMergePrev = useCallback((id: string) => {
    if (!id) {
      onMergeTargetMissing?.();
      return;
    }
    fireAndForget(mergeWithPrevious(id), { context: 'src/hooks/useUnitOps.ts:L72', policy: 'user-visible' });
  }, [mergeWithPrevious, onMergeTargetMissing]);

  const runMergeNext = useCallback((id: string) => {
    if (!id) {
      onMergeTargetMissing?.();
      return;
    }
    fireAndForget(mergeWithNext(id), { context: 'src/hooks/useUnitOps.ts:L80', policy: 'user-visible' });
  }, [mergeWithNext, onMergeTargetMissing]);

  const runSplitAtTime = useCallback((id: string, splitTime: number) => {
    if (!id) return;
    fireAndForget(splitUnit(id, splitTime), { context: 'src/hooks/useUnitOps.ts:L85', policy: 'user-visible' });
  }, [splitUnit]);

  const runSelectBefore = useCallback((id: string) => {
    if (!id) return;
    selectAllBefore(id);
  }, [selectAllBefore]);

  const runSelectAfter = useCallback((id: string) => {
    if (!id) return;
    selectAllAfter(id);
  }, [selectAllAfter]);

  return {
    unitHasText,
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
