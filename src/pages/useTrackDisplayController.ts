import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import {
  buildSpeakerLayerLayoutWithOptions,
  buildStableSpeakerLaneMap,
  type SpeakerLayerLayoutResult,
} from '../utils/speakerLayerLayout';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';

type SegmentSpeakerAssignmentLike = {
  speakerKey: string;
};

type LockConflictToastState = {
  count: number;
  speakers: string[];
  nonce: number;
};

interface UseTrackDisplayControllerInput {
  utterancesOnCurrentMedia: UtteranceDocType[];
  timelineRenderUtterances: UtteranceDocType[];
  activeLayerIdForEdits: string;
  defaultTranscriptionLayerId?: string;
  layers: LayerDocType[];
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentSpeakerAssignmentsOnCurrentMedia: SegmentSpeakerAssignmentLike[];
  transcriptionTrackMode: TranscriptionTrackDisplayMode;
  setTranscriptionTrackMode: Dispatch<SetStateAction<TranscriptionTrackDisplayMode>>;
  laneLockMap: Record<string, number>;
  setLaneLockMap: Dispatch<SetStateAction<Record<string, number>>>;
  selectedSpeakerIdsForTrackLock: string[];
  speakerNameById: Record<string, string>;
  setLockConflictToast: Dispatch<SetStateAction<LockConflictToastState | null>>;
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
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
  trackModeLabel: string;
  trackConflictLabel: string;
  trackLockDiagnostics: {
    count: number;
    speakerNames: string[];
  };
  handleOpenLockConflictDetails: () => void;
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
  utterancesOnCurrentMedia,
  timelineRenderUtterances,
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
  getUtteranceSpeakerKey,
}: UseTrackDisplayControllerInput): UseTrackDisplayControllerResult {
  const hasOverlappingUtterancesOnCurrentMedia = useMemo(
    () => hasOverlaps(utterancesOnCurrentMedia),
    [utterancesOnCurrentMedia],
  );

  const hasOverlappingSegmentsOnActiveLayer = useMemo(() => {
    const activeLayer = layers.find((item) => item.id === activeLayerIdForEdits);
    if (!activeLayer || !layerUsesOwnSegments(activeLayer, defaultTranscriptionLayerId)) return false;
    return hasOverlaps(segmentsByLayer.get(activeLayer.id) ?? []);
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, layers, segmentsByLayer]);

  useEffect(() => {
    if (transcriptionTrackMode === 'single' && (hasOverlappingUtterancesOnCurrentMedia || hasOverlappingSegmentsOnActiveLayer)) {
      setTranscriptionTrackMode('multi-auto');
    }
  }, [hasOverlappingSegmentsOnActiveLayer, hasOverlappingUtterancesOnCurrentMedia, setTranscriptionTrackMode, transcriptionTrackMode]);

  const speakerSortKeyById = useMemo(() => {
    const sorted = [...utterancesOnCurrentMedia].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (a.endTime !== b.endTime) return a.endTime - b.endTime;
      return a.id.localeCompare(b.id);
    });
    const next: Record<string, number> = {};
    let order = 0;
    for (const utterance of sorted) {
      const key = getUtteranceSpeakerKey(utterance);
      if (key in next) continue;
      next[key] = order;
      order += 1;
    }
    return next;
  }, [getUtteranceSpeakerKey, utterancesOnCurrentMedia]);

  const currentSpeakerIdsForTrackMode = useMemo(() => {
    const next = new Set<string>();
    for (const utterance of utterancesOnCurrentMedia) {
      const speakerKey = getUtteranceSpeakerKey(utterance);
      if (!speakerKey) continue;
      next.add(speakerKey);
    }
    for (const assignment of segmentSpeakerAssignmentsOnCurrentMedia) {
      const speakerKey = assignment.speakerKey.trim();
      if (!speakerKey || speakerKey === 'unknown-speaker') continue;
      next.add(speakerKey);
    }
    return Array.from(next);
  }, [getUtteranceSpeakerKey, segmentSpeakerAssignmentsOnCurrentMedia, utterancesOnCurrentMedia]);

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

  const speakerLayerLayout = useMemo(() => buildSpeakerLayerLayoutWithOptions(timelineRenderUtterances, {
    trackMode: transcriptionTrackMode,
    ...(effectiveLaneLockMap ? { laneLockMap: effectiveLaneLockMap } : {}),
    ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
  }), [effectiveLaneLockMap, speakerSortKeyById, timelineRenderUtterances, transcriptionTrackMode]);

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

  const trackModeLabel = useMemo(() => {
    if (transcriptionTrackMode === 'single') return '\u5355\u8f68';
    if (transcriptionTrackMode === 'multi-speaker-fixed') return '\u591a\u8f68\u00b7\u4e00\u4eba\u4e00\u8f68';
    if (transcriptionTrackMode === 'multi-locked') return '\u591a\u8f68\u00b7\u9501\u5b9a';
    return '\u591a\u8f68\u00b7\u81ea\u52a8';
  }, [transcriptionTrackMode]);

  const trackConflictLabel = useMemo(
    () => transcriptionTrackMode === 'multi-speaker-fixed' ? '\u4e00\u4eba\u4e00\u8f68\u51b2\u7a81' : '\u9501\u5b9a\u51b2\u7a81',
    [transcriptionTrackMode],
  );

  const trackLockDiagnostics = useMemo(() => {
    const speakerNames = speakerLayerLayout.lockConflictSpeakerIds.map((id) => speakerNameById[id] ?? id);
    return {
      count: speakerLayerLayout.lockConflictCount,
      speakerNames,
    };
  }, [speakerLayerLayout.lockConflictCount, speakerLayerLayout.lockConflictSpeakerIds, speakerNameById]);

  const handleOpenLockConflictDetails = useCallback(() => {
    if (trackLockDiagnostics.count <= 0) return;
    setLockConflictToast({
      count: trackLockDiagnostics.count,
      speakers: trackLockDiagnostics.speakerNames,
      nonce: Date.now(),
    });
  }, [setLockConflictToast, trackLockDiagnostics.count, trackLockDiagnostics.speakerNames]);

  return {
    speakerSortKeyById,
    effectiveLaneLockMap,
    speakerLayerLayout,
    setTrackDisplayMode,
    handleToggleTrackDisplayMode,
    handleLockSelectedSpeakersToLane,
    handleUnlockSelectedSpeakers,
    handleResetTrackAutoLayout,
    trackModeLabel,
    trackConflictLabel,
    trackLockDiagnostics,
    handleOpenLockConflictDetails,
  };
}
