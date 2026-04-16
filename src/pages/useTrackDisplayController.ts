import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { buildSpeakerLayerLayoutWithOptions, buildStableSpeakerLaneMap, type SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';

function isTimelineUnitView(item: TimelineUnitView | LayerUnitDocType): item is TimelineUnitView {
  const kind = (item as TimelineUnitView).kind;
  return kind === 'unit' || kind === 'segment';
}

type SegmentSpeakerAssignmentLike = {
  speakerKey: string;
};

type LockConflictToastState = {
  count: number;
  speakers: string[];
  nonce: number;
};

interface UseTrackDisplayControllerInput {
  unitsOnCurrentMedia: LayerUnitDocType[];
  timelineUnitsOnCurrentMedia?: ReadonlyArray<TimelineUnitView>;
  timelineRenderUnits: LayerUnitDocType[];
  activeLayerIdForEdits: string;
  defaultTranscriptionLayerId?: string;
  layers: LayerDocType[];
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentSpeakerAssignmentsOnCurrentMedia: SegmentSpeakerAssignmentLike[];
  transcriptionTrackMode: TranscriptionTrackDisplayMode;
  setTranscriptionTrackMode: Dispatch<SetStateAction<TranscriptionTrackDisplayMode>>;
  laneLockMap: Record<string, number>;
  setLaneLockMap: Dispatch<SetStateAction<Record<string, number>>>;
  selectedSpeakerIdsForTrackLock: string[];
  speakerNameById: Record<string, string>;
  setLockConflictToast: Dispatch<SetStateAction<LockConflictToastState | null>>;
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
}

interface UseTrackDisplayControllerResult {
  speakerSortKeyById: Record<string, number>;
  effectiveLaneLockMap: Record<string, number>;
  speakerLayerLayout: SpeakerLayerLayoutResult;
  setTrackDisplayMode: (mode: TranscriptionTrackDisplayMode) => void;
  handleToggleTrackDisplayMode: () => void;
  handleLockSelectedSpeakersToLane: (laneIndex: number) => void;
  handleUnlockSelectedSpeakers: () => void;
  handleResetTrackAutoLayout: () => void;
}

type OverlapLike = {
  id: string;
  startTime: number;
  endTime: number;
};

function hasOverlaps(items: OverlapLike[]): boolean {
  if (items.length < 2) return false;
  const sorted = [...items].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.endTime !== b.endTime) return a.endTime - b.endTime;
    return a.id.localeCompare(b.id);
  });
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.startTime < sorted[index - 1]!.endTime) {
      return true;
    }
  }
  return false;
}

export function useTrackDisplayController({
  unitsOnCurrentMedia,
  timelineUnitsOnCurrentMedia,
  timelineRenderUnits,
  activeLayerIdForEdits,
  defaultTranscriptionLayerId,
  layers,
  segmentsByLayer,
  segmentSpeakerAssignmentsOnCurrentMedia,
  transcriptionTrackMode,
  setTranscriptionTrackMode,
  laneLockMap,
  setLaneLockMap,
  selectedSpeakerIdsForTrackLock,
  speakerNameById,
  setLockConflictToast,
  getUnitSpeakerKey,
}: UseTrackDisplayControllerInput): UseTrackDisplayControllerResult {
  const unitUnitsOnCurrentMedia = useMemo(() => (
    timelineUnitsOnCurrentMedia?.filter((unit) => unit.kind === 'unit') ?? []
  ), [timelineUnitsOnCurrentMedia]);

  const hasOverlappingUnitsOnCurrentMedia = useMemo(
    () => hasOverlaps(
      unitUnitsOnCurrentMedia.length > 0
        ? unitUnitsOnCurrentMedia
        : unitsOnCurrentMedia,
    ),
    [unitUnitsOnCurrentMedia, unitsOnCurrentMedia],
  );

  const hasOverlappingSegmentsOnActiveLayer = useMemo(() => {
    const activeLayer = layers.find((item) => item.id === activeLayerIdForEdits);
    if (!activeLayer || !layerUsesOwnSegments(activeLayer, defaultTranscriptionLayerId)) return false;
    return hasOverlaps(segmentsByLayer.get(activeLayer.id) ?? []);
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, layers, segmentsByLayer]);

  useEffect(() => {
    if (transcriptionTrackMode === 'single' && (hasOverlappingUnitsOnCurrentMedia || hasOverlappingSegmentsOnActiveLayer)) {
      setTranscriptionTrackMode('multi-auto');
    }
  }, [hasOverlappingSegmentsOnActiveLayer, hasOverlappingUnitsOnCurrentMedia, setTranscriptionTrackMode, transcriptionTrackMode]);

  const speakerSortKeyById = useMemo(() => {
    const sorted = [
      ...(unitUnitsOnCurrentMedia.length > 0
        ? unitUnitsOnCurrentMedia
        : unitsOnCurrentMedia),
    ].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (a.endTime !== b.endTime) return a.endTime - b.endTime;
      return a.id.localeCompare(b.id);
    });
    const next: Record<string, number> = {};
    let order = 0;
    for (const unit of sorted) {
      const key = isTimelineUnitView(unit)
        ? (unit.speakerId ?? 'unknown-speaker')
        : getUnitSpeakerKey(unit);
      if (key in next) continue;
      next[key] = order;
      order += 1;
    }
    return next;
  }, [getUnitSpeakerKey, unitUnitsOnCurrentMedia, unitsOnCurrentMedia]);

  const currentSpeakerIdsForTrackMode = useMemo(() => {
    const next = new Set<string>();
    const source = unitUnitsOnCurrentMedia.length > 0
      ? unitUnitsOnCurrentMedia
      : unitsOnCurrentMedia;
    for (const unit of source) {
      const speakerKey = isTimelineUnitView(unit)
        ? (unit.speakerId ?? 'unknown-speaker')
        : getUnitSpeakerKey(unit);
      if (!speakerKey) continue;
      next.add(speakerKey);
    }
    for (const assignment of segmentSpeakerAssignmentsOnCurrentMedia) {
      const speakerKey = assignment.speakerKey.trim();
      if (!speakerKey || speakerKey === 'unknown-speaker') continue;
      next.add(speakerKey);
    }
    return Array.from(next);
  }, [getUnitSpeakerKey, segmentSpeakerAssignmentsOnCurrentMedia, unitUnitsOnCurrentMedia, unitsOnCurrentMedia]);

  const effectiveLaneLockMap = useMemo(() => {
    if (transcriptionTrackMode !== 'multi-speaker-fixed') return laneLockMap;
    return buildStableSpeakerLaneMap(currentSpeakerIdsForTrackMode, laneLockMap, speakerSortKeyById);
  }, [currentSpeakerIdsForTrackMode, laneLockMap, speakerSortKeyById, transcriptionTrackMode]);

  useEffect(() => {
    if (transcriptionTrackMode !== 'multi-speaker-fixed') return;
    const prevKeys = Object.keys(laneLockMap);
    const nextKeys = Object.keys(effectiveLaneLockMap);
    if (prevKeys.length === nextKeys.length && prevKeys.every((key) => laneLockMap[key] === effectiveLaneLockMap[key])) {
      return;
    }
    setLaneLockMap(effectiveLaneLockMap);
  }, [effectiveLaneLockMap, laneLockMap, setLaneLockMap, transcriptionTrackMode]);

  const speakerLayerLayout = useMemo(() => buildSpeakerLayerLayoutWithOptions(timelineRenderUnits, {
    trackMode: transcriptionTrackMode,
    ...(effectiveLaneLockMap ? { laneLockMap: effectiveLaneLockMap } : {}),
    ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
  }), [effectiveLaneLockMap, speakerSortKeyById, timelineRenderUnits, transcriptionTrackMode]);

  const setTrackDisplayMode = useCallback((mode: TranscriptionTrackDisplayMode) => {
    setTranscriptionTrackMode(mode);
  }, [setTranscriptionTrackMode]);

  const handleToggleTrackDisplayMode = useCallback(() => {
    setTranscriptionTrackMode((prev) => {
      if (prev === 'single') return 'multi-auto';
      return 'single';
    });
  }, [setTranscriptionTrackMode]);

  const handleLockSelectedSpeakersToLane = useCallback((laneIndex: number) => {
    if (!Number.isInteger(laneIndex) || laneIndex < 0) return;
    if (selectedSpeakerIdsForTrackLock.length === 0) return;
    setLaneLockMap((prev) => {
      const next = { ...prev };
      for (const speakerId of selectedSpeakerIdsForTrackLock) {
        next[speakerId] = laneIndex;
      }
      return next;
    });
    setTranscriptionTrackMode('multi-locked');
  }, [selectedSpeakerIdsForTrackLock, setLaneLockMap, setTranscriptionTrackMode]);

  const handleUnlockSelectedSpeakers = useCallback(() => {
    if (selectedSpeakerIdsForTrackLock.length === 0) return;
    setLaneLockMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const speakerId of selectedSpeakerIdsForTrackLock) {
        if (!(speakerId in next)) continue;
        delete next[speakerId];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedSpeakerIdsForTrackLock, setLaneLockMap]);

  const handleResetTrackAutoLayout = useCallback(() => {
    const hadConflict = speakerLayerLayout.lockConflictCount > 0;
    const conflictSpeakers = speakerLayerLayout.lockConflictSpeakerIds.map((id) => speakerNameById[id] ?? id);
    setLaneLockMap({});
    setTranscriptionTrackMode('multi-auto');
    if (hadConflict) {
      setLockConflictToast({
        count: speakerLayerLayout.lockConflictCount,
        speakers: conflictSpeakers,
        nonce: Date.now(),
      });
    }
  }, [setLaneLockMap, setLockConflictToast, setTranscriptionTrackMode, speakerLayerLayout.lockConflictCount, speakerLayerLayout.lockConflictSpeakerIds, speakerNameById]);

  return {
    speakerSortKeyById,
    effectiveLaneLockMap,
    speakerLayerLayout,
    setTrackDisplayMode,
    handleToggleTrackDisplayMode,
    handleLockSelectedSpeakersToLane,
    handleUnlockSelectedSpeakers,
    handleResetTrackAutoLayout,
  };
}
