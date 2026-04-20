import { useCallback, useMemo, useState } from 'react';
import {
  buildTranscriptionReviewItems,
  countTranscriptionReviewPresets,
  filterTranscriptionReviewQueue,
  type TranscriptionReviewPreset,
} from '../utils/transcriptionReviewQueue';
import type { UseTranscriptionSectionViewModelsInput } from './transcriptionSectionViewModelTypes';

interface UseTranscriptionReviewSectionViewModelInput {
  unitsOnCurrentMedia: UseTranscriptionSectionViewModelsInput['unitsOnCurrentMedia'];
  selectedTimelineUnit: UseTranscriptionSectionViewModelsInput['selectedTimelineUnit'];
  manualSelectTsRef: UseTranscriptionSectionViewModelsInput['manualSelectTsRef'];
  selectUnit: UseTranscriptionSectionViewModelsInput['selectUnit'];
  player: UseTranscriptionSectionViewModelsInput['player'];
}

export function useTranscriptionReviewSectionViewModel(
  input: UseTranscriptionReviewSectionViewModelInput,
) {
  const {
    unitsOnCurrentMedia,
    selectedTimelineUnit,
    manualSelectTsRef,
    selectUnit,
    player,
  } = input;

  const [activeReviewPreset, setActiveReviewPreset] = useState<TranscriptionReviewPreset>('all');

  const lowConfidenceCount = useMemo(() => unitsOnCurrentMedia.filter(
    (unit) => typeof unit.ai_metadata?.confidence === 'number' && unit.ai_metadata.confidence < 0.75,
  ).length, [unitsOnCurrentMedia]);

  const reviewItems = useMemo(
    () => buildTranscriptionReviewItems(unitsOnCurrentMedia),
    [unitsOnCurrentMedia],
  );

  const reviewPresetCounts = useMemo(
    () => countTranscriptionReviewPresets(reviewItems),
    [reviewItems],
  );

  const reviewQueue = useMemo(
    () => filterTranscriptionReviewQueue(reviewItems, activeReviewPreset),
    [activeReviewPreset, reviewItems],
  );

  const focusReviewUnit = useCallback((unitId: string) => {
    const target = unitsOnCurrentMedia.find((unit) => unit.id === unitId);
    if (!target) return;
    manualSelectTsRef.current = Date.now();
    selectUnit(unitId);
    player.seekTo(target.startTime);
  }, [manualSelectTsRef, player, selectUnit, unitsOnCurrentMedia]);

  const activeReviewIndex = useMemo(
    () => reviewQueue.findIndex((unit) => unit.id === selectedTimelineUnit?.unitId),
    [reviewQueue, selectedTimelineUnit?.unitId],
  );

  const handleOpenReviewIssues = useCallback(() => {
    const target = reviewQueue[activeReviewIndex >= 0 ? activeReviewIndex : 0];
    if (target) focusReviewUnit(target.id);
  }, [activeReviewIndex, focusReviewUnit, reviewQueue]);

  const handleStepReviewIssue = useCallback((direction: -1 | 1) => {
    if (reviewQueue.length === 0) return;
    const currentIndex = activeReviewIndex >= 0 ? activeReviewIndex : 0;
    const nextIndex = (currentIndex + direction + reviewQueue.length) % reviewQueue.length;
    const next = reviewQueue[nextIndex];
    if (!next) return;
    focusReviewUnit(next.id);
  }, [activeReviewIndex, focusReviewUnit, reviewQueue]);

  const handleSelectReviewPreset = useCallback((preset: TranscriptionReviewPreset) => {
    setActiveReviewPreset(preset);
    const next = filterTranscriptionReviewQueue(reviewItems, preset)[0];
    if (next) focusReviewUnit(next.id);
  }, [focusReviewUnit, reviewItems]);

  return {
    lowConfidenceCount,
    reviewPresetCounts,
    activeReviewPreset,
    handleSelectReviewPreset,
    handleOpenReviewIssues,
    handleStepReviewIssue,
  };
}
