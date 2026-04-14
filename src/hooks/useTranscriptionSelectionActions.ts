import { useCallback, useRef } from 'react';
import { normalizeSelection } from '../utils/selectionUtils';
import type { UtteranceDocType } from '../db';
import {
  createTimelineUnit,
  isSegmentTimelineUnit,
  resolveTimelineLayerIdFallback,
  type TimelineUnit,
  type TimelineUnitKind,
} from './transcriptionTypes';

// 空 Set 常量：避免每次 clear 都创建新引用触发 React 渲染 | Constant empty Set: avoid creating new reference on every clear
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

function hasSameSelectionIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

type Params = {
  selectedUnitIdRef: React.MutableRefObject<string>;
  selectedUnitIdsRef: React.MutableRefObject<Set<string>>;
  selectedLayerIdRef: React.MutableRefObject<string>;
  selectedTimelineUnitRef: React.MutableRefObject<TimelineUnit | null>;
  utterancesOnCurrentMediaRef: React.MutableRefObject<UtteranceDocType[]>;
  defaultTranscriptionLayerId?: string;
  fallbackLayerId?: string;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedUnitIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
};

export function useTranscriptionSelectionActions({
  selectedUnitIdRef,
  selectedUnitIdsRef,
  selectedLayerIdRef,
  selectedTimelineUnitRef,
  utterancesOnCurrentMediaRef,
  defaultTranscriptionLayerId,
  fallbackLayerId,
  setSelectedLayerId,
  setSelectedUnitIds,
  setSelectedTimelineUnit,
}: Params) {
  const missingLayerIdLoggedSourcesRef = useRef(new Set<string>());

  const clearSelectionState = useCallback(() => {
    setSelectedTimelineUnit(null);
    setSelectedUnitIds(EMPTY_SET as Set<string>);
  }, [setSelectedTimelineUnit, setSelectedUnitIds]);

  const resolveRequiredLayerId = useCallback((rawLayerId: string, source: string): string | null => {
    const layerId = resolveTimelineLayerIdFallback({
      selectedLayerId: rawLayerId,
      focusedLayerId: selectedLayerIdRef.current,
      selectedTimelineUnitLayerId: selectedTimelineUnitRef.current?.layerId,
      defaultTranscriptionLayerId,
      firstTranscriptionLayerId: fallbackLayerId,
    });
    if (layerId.length > 0) return layerId;
    if (!missingLayerIdLoggedSourcesRef.current.has(source)) {
      missingLayerIdLoggedSourcesRef.current.add(source);
      console.error(`[useTranscriptionSelectionActions] Missing layerId in ${source}`);
    }
    return null;
  }, [defaultTranscriptionLayerId, fallbackLayerId, selectedLayerIdRef, selectedTimelineUnitRef]);

  const applyUnitSelection = useCallback((input: {
    primaryId: string;
    ids: Iterable<string>;
    rawLayerId: string;
    source: string;
    kind: TimelineUnitKind;
    keepSelectionSet: boolean;
  }) => {
    const next = normalizeSelection(input.primaryId, input.ids);
    if (!next.primaryId) {
      clearSelectionState();
      return;
    }
    const layerId = resolveRequiredLayerId(input.rawLayerId, input.source);
    if (!layerId) {
      clearSelectionState();
      return;
    }

    const nextIds = input.keepSelectionSet ? next.ids : EMPTY_SET as Set<string>;
    const currentTimelineUnit = selectedTimelineUnitRef.current;
    if (
      selectedLayerIdRef.current === layerId
      && selectedUnitIdRef.current === next.primaryId
      && hasSameSelectionIds(selectedUnitIdsRef.current, nextIds)
      && currentTimelineUnit?.layerId === layerId
      && currentTimelineUnit?.unitId === next.primaryId
      && currentTimelineUnit?.kind === input.kind
    ) {
      return;
    }

    setSelectedLayerId(layerId);
    setSelectedUnitIds(nextIds);
    setSelectedTimelineUnit(createTimelineUnit(layerId, next.primaryId, input.kind));
  }, [
    clearSelectionState,
    resolveRequiredLayerId,
    selectedLayerIdRef,
    selectedTimelineUnitRef,
    selectedUnitIdsRef,
    selectedUnitIdRef,
    setSelectedLayerId,
    setSelectedTimelineUnit,
    setSelectedUnitIds,
  ]);

  const setUnitSelection = useCallback((primaryId: string, ids: Iterable<string>) => {
    applyUnitSelection({
      primaryId,
      ids,
      rawLayerId: selectedLayerIdRef.current,
      source: 'setUnitSelection',
      kind: 'utterance',
      keepSelectionSet: true,
    });
  }, [applyUnitSelection, selectedLayerIdRef]);

  const selectSegment = useCallback((segmentId: string) => {
    if (!segmentId) {
      clearSelectionState();
      return;
    }
    applyUnitSelection({
      primaryId: segmentId,
      ids: [segmentId],
      rawLayerId: selectedLayerIdRef.current,
      source: 'selectSegment',
      kind: 'segment',
      keepSelectionSet: false,
    });
  }, [applyUnitSelection, clearSelectionState, selectedLayerIdRef]);

  const selectTimelineUnit = useCallback((unit: TimelineUnit | null) => {
    if (!unit) {
      clearSelectionState();
      return;
    }
    // 结构去重：选区未变时跳过 setState（Descript / DAW 模式）| Structural dedup: skip setState when selection is unchanged
    const prev = selectedTimelineUnitRef.current;
    if (prev && prev.unitId === unit.unitId && prev.layerId === unit.layerId && prev.kind === unit.kind) {
      return;
    }
    applyUnitSelection({
      primaryId: unit.unitId,
      ids: unit.unitId ? [unit.unitId] : [],
      rawLayerId: unit.layerId,
      source: 'selectTimelineUnit',
      kind: unit.kind,
      keepSelectionSet: !isSegmentTimelineUnit(unit),
    });
  }, [applyUnitSelection, clearSelectionState, selectedTimelineUnitRef]);

  const selectUnit = useCallback((id: string) => {
    setUnitSelection(id, id ? [id] : []);
  }, [setUnitSelection]);

  const toggleUnitSelection = useCallback((id: string) => {
    const next = new Set(selectedUnitIdsRef.current);
    if (next.has(id)) {
      next.delete(id);
      const primary = selectedUnitIdRef.current === id
        ? (next.values().next().value as string | undefined) ?? ''
        : selectedUnitIdRef.current;
      setUnitSelection(primary, next);
      return;
    }

    next.add(id);
    setUnitSelection(id, next);
  }, [selectedUnitIdsRef, selectedUnitIdRef, setUnitSelection]);

  const selectUnitRange = useCallback((anchorId: string, targetId: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const anchorIdx = sorted.findIndex((u) => u.id === anchorId);
    const targetIdx = sorted.findIndex((u) => u.id === targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const lo = Math.min(anchorIdx, targetIdx);
    const hi = Math.max(anchorIdx, targetIdx);
    const ids = new Set(sorted.slice(lo, hi + 1).map((u) => u.id));
    setUnitSelection(targetId, ids);
  }, [setUnitSelection, utterancesOnCurrentMediaRef]);

  const selectAllBefore = useCallback((id: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const idx = sorted.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const ids = new Set(sorted.slice(0, idx + 1).map((u) => u.id));
    setUnitSelection(id, ids);
  }, [setUnitSelection, utterancesOnCurrentMediaRef]);

  const selectAllAfter = useCallback((id: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const idx = sorted.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const ids = new Set(sorted.slice(idx).map((u) => u.id));
    setUnitSelection(id, ids);
  }, [setUnitSelection, utterancesOnCurrentMediaRef]);

  const selectAllUnits = useCallback(() => {
    const sorted = utterancesOnCurrentMediaRef.current;
    if (sorted.length === 0) return;
    const ids = new Set(sorted.map((u) => u.id));
    setUnitSelection(selectedUnitIdRef.current, ids);
  }, [selectedUnitIdRef, setUnitSelection, utterancesOnCurrentMediaRef]);

  const clearUnitSelection = useCallback(() => {
    clearSelectionState();
  }, [clearSelectionState]);

  // 独立层 segment 切换多选 | Toggle segment multi-selection for independent layers
  const toggleSegmentSelection = useCallback((id: string) => {
    const next = new Set(selectedUnitIdsRef.current);
    if (next.size === 0) {
      const currentPrimary = selectedUnitIdRef.current;
      if (currentPrimary) next.add(currentPrimary);
    }
    if (next.has(id)) {
      next.delete(id);
      const remaining = [...next];
      const primary = selectedUnitIdRef.current === id
        ? (remaining[0] ?? '')
        : selectedUnitIdRef.current;
      if (!primary) {
        clearSelectionState();
        return;
      }
      applyUnitSelection({
        primaryId: primary,
        ids: next,
        rawLayerId: selectedLayerIdRef.current,
        source: 'toggleSegmentSelection',
        kind: 'segment',
        keepSelectionSet: true,
      });
      return;
    }
    next.add(id);
    applyUnitSelection({
      primaryId: id,
      ids: next,
      rawLayerId: selectedLayerIdRef.current,
      source: 'toggleSegmentSelection',
      kind: 'segment',
      keepSelectionSet: true,
    });
  }, [applyUnitSelection, clearSelectionState, selectedUnitIdsRef, selectedUnitIdRef, selectedLayerIdRef]);

  // 独立层 segment 范围选 | Range-select segments for independent layers
  const selectSegmentRange = useCallback((anchorId: string, targetId: string, orderedItems: Array<{ id: string }>) => {
    const anchorIdx = orderedItems.findIndex((item) => item.id === anchorId);
    const targetIdx = orderedItems.findIndex((item) => item.id === targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const lo = Math.min(anchorIdx, targetIdx);
    const hi = Math.max(anchorIdx, targetIdx);
    const rangeIds = new Set(orderedItems.slice(lo, hi + 1).map((item) => item.id));
    applyUnitSelection({
      primaryId: targetId,
      ids: rangeIds,
      rawLayerId: selectedLayerIdRef.current,
      source: 'selectSegmentRange',
      kind: 'segment',
      keepSelectionSet: true,
    });
  }, [applyUnitSelection, selectedLayerIdRef]);

  return {
    selectTimelineUnit,
    setUnitSelection,
    selectUnit,
    selectSegment,
    toggleUnitSelection,
    selectUnitRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUnits,
    clearUnitSelection,
    toggleSegmentSelection,
    selectSegmentRange,
  };
}