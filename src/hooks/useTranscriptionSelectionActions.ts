import { useCallback } from 'react';
import { normalizeSelection } from '../utils/selectionUtils';
import type { UtteranceDocType } from '../db';

type Params = {
  selectedUtteranceIdRef: React.MutableRefObject<string>;
  selectedUtteranceIdsRef: React.MutableRefObject<Set<string>>;
  utterancesOnCurrentMediaRef: React.MutableRefObject<UtteranceDocType[]>;
  setSelectedUtteranceId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedUtteranceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export function useTranscriptionSelectionActions({
  selectedUtteranceIdRef,
  selectedUtteranceIdsRef,
  utterancesOnCurrentMediaRef,
  setSelectedUtteranceId,
  setSelectedUtteranceIds,
}: Params) {
  const setUtteranceSelection = useCallback((primaryId: string, ids: Iterable<string>) => {
    const next = normalizeSelection(primaryId, ids);
    setSelectedUtteranceId(next.primaryId);
    setSelectedUtteranceIds(next.ids);
  }, [setSelectedUtteranceId, setSelectedUtteranceIds]);

  const selectUtterance = useCallback((id: string) => {
    setUtteranceSelection(id, id ? [id] : []);
  }, [setUtteranceSelection]);

  const toggleUtteranceSelection = useCallback((id: string) => {
    const next = new Set(selectedUtteranceIdsRef.current);
    if (next.has(id)) {
      next.delete(id);
      const primary = selectedUtteranceIdRef.current === id
        ? (next.values().next().value as string | undefined) ?? ''
        : selectedUtteranceIdRef.current;
      setUtteranceSelection(primary, next);
      return;
    }

    next.add(id);
    setUtteranceSelection(id, next);
  }, [selectedUtteranceIdRef, selectedUtteranceIdsRef, setUtteranceSelection]);

  const selectUtteranceRange = useCallback((anchorId: string, targetId: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const anchorIdx = sorted.findIndex((u) => u.id === anchorId);
    const targetIdx = sorted.findIndex((u) => u.id === targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const lo = Math.min(anchorIdx, targetIdx);
    const hi = Math.max(anchorIdx, targetIdx);
    const ids = new Set(sorted.slice(lo, hi + 1).map((u) => u.id));
    setUtteranceSelection(targetId, ids);
  }, [setUtteranceSelection, utterancesOnCurrentMediaRef]);

  const selectAllBefore = useCallback((id: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const idx = sorted.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const ids = new Set(sorted.slice(0, idx + 1).map((u) => u.id));
    setUtteranceSelection(id, ids);
  }, [setUtteranceSelection, utterancesOnCurrentMediaRef]);

  const selectAllAfter = useCallback((id: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const idx = sorted.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const ids = new Set(sorted.slice(idx).map((u) => u.id));
    setUtteranceSelection(id, ids);
  }, [setUtteranceSelection, utterancesOnCurrentMediaRef]);

  const selectAllUtterances = useCallback(() => {
    const sorted = utterancesOnCurrentMediaRef.current;
    if (sorted.length === 0) return;
    const ids = new Set(sorted.map((u) => u.id));
    setUtteranceSelection(selectedUtteranceIdRef.current, ids);
  }, [selectedUtteranceIdRef, setUtteranceSelection, utterancesOnCurrentMediaRef]);

  const clearUtteranceSelection = useCallback(() => {
    setUtteranceSelection('', []);
  }, [setUtteranceSelection]);

  return {
    setUtteranceSelection,
    selectUtterance,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
  };
}