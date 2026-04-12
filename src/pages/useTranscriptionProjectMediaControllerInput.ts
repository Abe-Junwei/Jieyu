import { useMemo } from 'react';
import type { UseTranscriptionProjectMediaControllerInput } from '../types/useTranscriptionProjectMediaController.types';

export function useTranscriptionProjectMediaControllerInput(
  input: UseTranscriptionProjectMediaControllerInput,
): UseTranscriptionProjectMediaControllerInput {
  return useMemo(() => ({
    activeTextId: input.activeTextId,
    getActiveTextId: input.getActiveTextId,
    setActiveTextId: input.setActiveTextId,
    setShowAudioImport: input.setShowAudioImport,
    addMediaItem: input.addMediaItem,
    setSaveState: input.setSaveState,
    selectedMediaUrl: input.selectedMediaUrl,
    selectedTimelineMedia: input.selectedTimelineMedia,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    createUtteranceFromSelectionRouted: input.createUtteranceFromSelectionRouted,
    loadSnapshot: input.loadSnapshot,
    selectTimelineUnit: input.selectTimelineUnit,
    locale: input.locale,
    tfB: input.tfB,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    translationTextByLayer: input.translationTextByLayer,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
  }), [
    input.activeTextId,
    input.addMediaItem,
    input.createUtteranceFromSelectionRouted,
    input.getActiveTextId,
    input.getUtteranceTextForLayer,
    input.loadSnapshot,
    input.locale,
    input.selectTimelineUnit,
    input.selectedMediaUrl,
    input.selectedTimelineMedia,
    input.setActiveTextId,
    input.setSaveState,
    input.setShowAudioImport,
    input.tfB,
    input.transcriptionLayers,
    input.translationLayers,
    input.translationTextByLayer,
    input.utterancesOnCurrentMedia,
  ]);
}
