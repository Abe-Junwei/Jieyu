import { useCallback, useRef } from 'react';
import { normalizeSelection } from '../utils/selectionUtils';
import type { UtteranceDocType } from '../db';
import type { TimelineUnit } from './transcriptionTypes';

type Params = {
  selectedUtteranceUnitIdRef: React.MutableRefObject<string>;
  selectedUtteranceIdsRef: React.MutableRefObject<Set<string>>;
  selectedLayerIdRef: React.MutableRefObject<string>;
  selectedTimelineUnitRef: React.MutableRefObject<TimelineUnit | null>;
  utterancesOnCurrentMediaRef: React.MutableRefObject<UtteranceDocType[]>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedUtteranceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
};

export function useTranscriptionSelectionActions({
  selectedUtteranceUnitIdRef,
  selectedUtteranceIdsRef,
  selectedLayerIdRef,
  selectedTimelineUnitRef,
  utterancesOnCurrentMediaRef,
  setSelectedLayerId,
  setSelectedUtteranceIds,
  setSelectedTimelineUnit,
}: Params) {
  const missingLayerIdLoggedSourcesRef = useRef(new Set<string>());

  const clearSelectionState = useCallback(() => {
    setSelectedTimelineUnit(null);
    setSelectedUtteranceIds(new Set());
  }, [setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const resolveRequiredLayerId = useCallback((rawLayerId: string, source: string): string | null => {
    const layerId = rawLayerId.trim();
    if (layerId.length > 0) return layerId;
    const fallbackLayerId = selectedTimelineUnitRef.current?.layerId?.trim() ?? '';
    if (fallbackLayerId.length > 0) {
      return fallbackLayerId;
    }
    if (!missingLayerIdLoggedSourcesRef.current.has(source)) {
      missingLayerIdLoggedSourcesRef.current.add(source);
      console.error(`[useTranscriptionSelectionActions] Missing layerId in ${source}`);
    }
    return null;
  }, [selectedTimelineUnitRef]);

  const setUtteranceSelection = useCallback((primaryId: string, ids: Iterable<string>) => {
    const next = normalizeSelection(primaryId, ids);
    if (!next.primaryId) {
      clearSelectionState();
      return;
    }
    const layerId = resolveRequiredLayerId(selectedLayerIdRef.current, 'setUtteranceSelection');
    if (!layerId) {
      clearSelectionState();
      return;
    }
    setSelectedLayerId(layerId);
    setSelectedUtteranceIds(next.ids);
    setSelectedTimelineUnit({
      layerId,
      unitId: next.primaryId,
      kind: 'utterance',
    });
  }, [clearSelectionState, resolveRequiredLayerId, setSelectedLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds, selectedLayerIdRef]);

  const selectSegment = useCallback((segmentId: string) => {
    if (!segmentId) {
      clearSelectionState();
      return;
    }
    const layerId = resolveRequiredLayerId(selectedLayerIdRef.current, 'selectSegment');
    if (!layerId) {
      clearSelectionState();
      return;
    }
    setSelectedLayerId(layerId);
    setSelectedTimelineUnit({
      layerId,
      unitId: segmentId,
      kind: 'segment',
    });
    setSelectedUtteranceIds(new Set());
  }, [clearSelectionState, resolveRequiredLayerId, setSelectedLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds, selectedLayerIdRef]);

  const selectTimelineUnit = useCallback((unit: TimelineUnit | null) => {
    if (!unit) {
      clearSelectionState();
      return;
    }
    const layerId = resolveRequiredLayerId(unit.layerId, 'selectTimelineUnit');
    if (!layerId) {
      clearSelectionState();
      return;
    }
    setSelectedLayerId(layerId);

    if (unit.kind === 'segment') {
      setSelectedTimelineUnit({ ...unit, layerId });
      setSelectedUtteranceIds(new Set());
      return;
    }

    setSelectedTimelineUnit({ ...unit, layerId });
    setSelectedUtteranceIds(unit.unitId ? new Set([unit.unitId]) : new Set());
  }, [clearSelectionState, resolveRequiredLayerId, setSelectedLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const selectUtterance = useCallback((id: string) => {
    setUtteranceSelection(id, id ? [id] : []);
  }, [setUtteranceSelection]);

  const toggleUtteranceSelection = useCallback((id: string) => {
    const next = new Set(selectedUtteranceIdsRef.current);
    if (next.has(id)) {
      next.delete(id);
      const primary = selectedUtteranceUnitIdRef.current === id
        ? (next.values().next().value as string | undefined) ?? ''
        : selectedUtteranceUnitIdRef.current;
      setUtteranceSelection(primary, next);
      return;
    }

    next.add(id);
    setUtteranceSelection(id, next);
  }, [selectedUtteranceIdsRef, selectedUtteranceUnitIdRef, setUtteranceSelection]);

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
    setUtteranceSelection(selectedUtteranceUnitIdRef.current, ids);
  }, [selectedUtteranceUnitIdRef, setUtteranceSelection, utterancesOnCurrentMediaRef]);

  const clearUtteranceSelection = useCallback(() => {
    clearSelectionState();
  }, [clearSelectionState]);

  // 独立层 segment 切换多选 | Toggle segment multi-selection for independent layers
  const toggleSegmentSelection = useCallback((id: string) => {
    const next = new Set(selectedUtteranceIdsRef.current);
    if (next.has(id)) {
      next.delete(id);
      const remaining = [...next];
      const primary = selectedUtteranceUnitIdRef.current === id
        ? (remaining[0] ?? '')
        : selectedUtteranceUnitIdRef.current;
      if (!primary) {
        clearSelectionState();
        return;
      }
      const layerId = resolveRequiredLayerId(selectedLayerIdRef.current, 'toggleSegmentSelection');
      if (!layerId) { clearSelectionState(); return; }
      setSelectedLayerId(layerId);
      setSelectedUtteranceIds(next);
      setSelectedTimelineUnit({ layerId, unitId: primary, kind: 'segment' });
      return;
    }
    next.add(id);
    const layerId = resolveRequiredLayerId(selectedLayerIdRef.current, 'toggleSegmentSelection');
    if (!layerId) { clearSelectionState(); return; }
    setSelectedLayerId(layerId);
    setSelectedUtteranceIds(next);
    setSelectedTimelineUnit({ layerId, unitId: id, kind: 'segment' });
  }, [clearSelectionState, resolveRequiredLayerId, selectedUtteranceIdsRef, selectedUtteranceUnitIdRef, selectedLayerIdRef, setSelectedLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds]);

  // 独立层 segment 范围选 | Range-select segments for independent layers
  const selectSegmentRange = useCallback((anchorId: string, targetId: string, orderedItems: Array<{ id: string }>) => {
    const anchorIdx = orderedItems.findIndex((item) => item.id === anchorId);
    const targetIdx = orderedItems.findIndex((item) => item.id === targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const lo = Math.min(anchorIdx, targetIdx);
    const hi = Math.max(anchorIdx, targetIdx);
    const rangeIds = new Set(orderedItems.slice(lo, hi + 1).map((item) => item.id));
    const layerId = resolveRequiredLayerId(selectedLayerIdRef.current, 'selectSegmentRange');
    if (!layerId) { clearSelectionState(); return; }
    setSelectedLayerId(layerId);
    setSelectedUtteranceIds(rangeIds);
    setSelectedTimelineUnit({ layerId, unitId: targetId, kind: 'segment' });
  }, [clearSelectionState, resolveRequiredLayerId, selectedLayerIdRef, setSelectedLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds]);

  return {
    selectTimelineUnit,
    setUtteranceSelection,
    selectUtterance,
    selectSegment,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
    toggleSegmentSelection,
    selectSegmentRange,
  };
}