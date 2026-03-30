import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { LayerSegmentDocType, SpeakerDocType, UtteranceDocType } from '../db';
import { getSpeakerDisplayNameByKey } from '../hooks/speakerManagement/speakerUtils';
import { isSegmentTimelineUnit, type TimelineUnit } from '../hooks/transcriptionTypes';

type SpeakerFocusMode = 'all' | 'focus-soft' | 'focus-hard';

interface SpeakerOptionLike {
  id: string;
  name: string;
}

interface SegmentSpeakerAssignmentLike {
  speakerKey: string;
}

interface UseSpeakerFocusControllerInput {
  speakerFocusMode: SpeakerFocusMode;
  setSpeakerFocusMode: Dispatch<SetStateAction<SpeakerFocusMode>>;
  speakerFocusTargetKey: string | null;
  setSpeakerFocusTargetKey: Dispatch<SetStateAction<string | null>>;
  speakerFocusTargetMemoryByMediaRef: MutableRefObject<Record<string, string | null>>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  segmentSpeakerAssignmentsOnCurrentMedia: SegmentSpeakerAssignmentLike[];
  speakerOptions: SpeakerOptionLike[];
  selectedTimelineMediaId?: string | null;
  selectedTimelineUnit: TimelineUnit | null;
  selectedUtterance: UtteranceDocType | null;
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerSegmentDocType>;
  resolveSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
  speakerByIdMap: Map<string, SpeakerDocType>;
}

export interface SpeakerFocusOption {
  key: string;
  name: string;
}

interface UseSpeakerFocusControllerResult {
  speakerFocusMode: SpeakerFocusMode;
  speakerFocusTargetKey: string | null;
  speakerFocusOptions: SpeakerFocusOption[];
  resolvedSpeakerFocusTargetKey: string | null;
  resolvedSpeakerFocusTargetName: string | undefined;
  cycleSpeakerFocusMode: () => void;
  handleSpeakerFocusTargetChange: (speakerKey: string) => void;
}

export function useSpeakerFocusController({
  speakerFocusMode,
  setSpeakerFocusMode,
  speakerFocusTargetKey,
  setSpeakerFocusTargetKey,
  speakerFocusTargetMemoryByMediaRef,
  utterancesOnCurrentMedia,
  segmentSpeakerAssignmentsOnCurrentMedia,
  speakerOptions,
  selectedTimelineMediaId,
  selectedTimelineUnit,
  selectedUtterance,
  segmentByIdForSpeakerActions,
  resolveSpeakerKeyForSegment,
  getUtteranceSpeakerKey,
  speakerByIdMap,
}: UseSpeakerFocusControllerInput): UseSpeakerFocusControllerResult {
  const speakerFocusOptions = useMemo(() => {
    const idsOnCurrentMedia = new Set<string>();
    for (const item of utterancesOnCurrentMedia) {
      const speakerKey = getUtteranceSpeakerKey(item);
      if (!speakerKey) continue;
      idsOnCurrentMedia.add(speakerKey);
    }
    for (const assignment of segmentSpeakerAssignmentsOnCurrentMedia) {
      idsOnCurrentMedia.add(assignment.speakerKey);
    }

    return speakerOptions
      .filter((speaker) => idsOnCurrentMedia.has(speaker.id))
      .map((speaker) => ({ key: speaker.id, name: speaker.name }));
  }, [getUtteranceSpeakerKey, segmentSpeakerAssignmentsOnCurrentMedia, speakerOptions, utterancesOnCurrentMedia]);

  const speakerFocusOptionKeySet = useMemo(
    () => new Set(speakerFocusOptions.map((item) => item.key)),
    [speakerFocusOptions],
  );

  const speakerFocusMediaKey = selectedTimelineMediaId ?? '__no-media__';

  const setSpeakerFocusTargetForCurrentMedia = useCallback((nextKey: string | null) => {
    speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey] = nextKey;
    setSpeakerFocusTargetKey(nextKey);
  }, [speakerFocusMediaKey]);

  const resolvedSpeakerFocusTargetKey = useMemo(() => {
    if (speakerFocusTargetKey && speakerFocusTargetKey.trim().length > 0) {
      return speakerFocusOptionKeySet.has(speakerFocusTargetKey) ? speakerFocusTargetKey : null;
    }

    if (isSegmentTimelineUnit(selectedTimelineUnit)) {
      const selectedSegment = segmentByIdForSpeakerActions.get(selectedTimelineUnit.unitId);
      if (!selectedSegment) return null;
      const selectedKey = resolveSpeakerKeyForSegment(selectedSegment);
      return speakerFocusOptionKeySet.has(selectedKey) ? selectedKey : null;
    }

    if (!selectedUtterance) return null;
    const selectedKey = getUtteranceSpeakerKey(selectedUtterance);
    return speakerFocusOptionKeySet.has(selectedKey) ? selectedKey : null;
  }, [
    getUtteranceSpeakerKey,
    resolveSpeakerKeyForSegment,
    segmentByIdForSpeakerActions,
    selectedTimelineUnit,
    selectedUtterance,
    speakerFocusOptionKeySet,
    speakerFocusTargetKey,
  ]);

  const resolvedSpeakerFocusTargetName = useMemo(
    () => resolvedSpeakerFocusTargetKey
      ? getSpeakerDisplayNameByKey(resolvedSpeakerFocusTargetKey, speakerByIdMap)
      : undefined,
    [resolvedSpeakerFocusTargetKey, speakerByIdMap],
  );

  const firstSpeakerFocusTargetKey = useMemo(() => {
    for (const item of utterancesOnCurrentMedia) {
      const speakerKey = getUtteranceSpeakerKey(item);
      if (speakerFocusOptionKeySet.has(speakerKey)) return speakerKey;
    }

    for (const assignment of segmentSpeakerAssignmentsOnCurrentMedia) {
      if (speakerFocusOptionKeySet.has(assignment.speakerKey)) return assignment.speakerKey;
    }

    return null;
  }, [getUtteranceSpeakerKey, segmentSpeakerAssignmentsOnCurrentMedia, speakerFocusOptionKeySet, utterancesOnCurrentMedia]);

  const cycleSpeakerFocusMode = useCallback(() => {
    setSpeakerFocusMode((prev) => {
      if (prev === 'all') {
        if (!resolvedSpeakerFocusTargetKey && firstSpeakerFocusTargetKey) {
          setSpeakerFocusTargetForCurrentMedia(firstSpeakerFocusTargetKey);
        }
        return 'focus-soft';
      }
      if (prev === 'focus-soft') return 'focus-hard';
      return 'all';
    });
  }, [firstSpeakerFocusTargetKey, resolvedSpeakerFocusTargetKey, setSpeakerFocusTargetForCurrentMedia]);

  const handleSpeakerFocusTargetChange = useCallback((speakerKey: string) => {
    const normalized = speakerKey.trim();
    if (normalized.length === 0) {
      setSpeakerFocusTargetForCurrentMedia(null);
      setSpeakerFocusMode('all');
      return;
    }
    setSpeakerFocusTargetForCurrentMedia(normalized);
  }, [setSpeakerFocusTargetForCurrentMedia]);

  // 媒体切换时恢复该媒体上次聚焦目标 | Restore per-media focus target on media switch
  useEffect(() => {
    const saved = speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey];
    setSpeakerFocusTargetKey(saved ?? null);
  }, [speakerFocusMediaKey]);

  // 显式目标失效时清空，避免 focus-hard 空视图 | Clear invalid explicit target to avoid focus-hard blank view
  useEffect(() => {
    if (!speakerFocusTargetKey || speakerFocusTargetKey.trim().length === 0) return;
    if (speakerFocusOptionKeySet.has(speakerFocusTargetKey)) return;
    setSpeakerFocusTargetForCurrentMedia(null);
  }, [setSpeakerFocusTargetForCurrentMedia, speakerFocusOptionKeySet, speakerFocusTargetKey]);

  useEffect(() => {
    if (speakerFocusMode === 'all') return;
    if (resolvedSpeakerFocusTargetKey) return;
    setSpeakerFocusMode('all');
  }, [resolvedSpeakerFocusTargetKey, speakerFocusMode]);

  return {
    speakerFocusMode,
    speakerFocusTargetKey,
    speakerFocusOptions,
    resolvedSpeakerFocusTargetKey,
    resolvedSpeakerFocusTargetName,
    cycleSpeakerFocusMode,
    handleSpeakerFocusTargetChange,
  };
}
