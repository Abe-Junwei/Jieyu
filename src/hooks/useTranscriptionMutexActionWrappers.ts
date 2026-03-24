import { useCallback } from 'react';
import type { TranslationLayerDocType, UtteranceDocType } from '../db';
import type { LayerCreateInput } from './transcriptionTypes';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  saveVoiceTranslationRaw: (blob: Blob, targetUtterance: UtteranceDocType, targetLayer: TranslationLayerDocType) => Promise<void>;
  saveUtteranceTextRaw: (utteranceId: string, value: string, layerId?: string) => Promise<void>;
  saveUtteranceTimingRaw: (utteranceId: string, startTime: number, endTime: number) => Promise<void>;
  saveTextTranslationForUtteranceRaw: (utteranceId: string, value: string, layerId: string) => Promise<void>;
  createNextUtteranceRaw: (base: UtteranceDocType, playerDuration: number) => Promise<void>;
  createUtteranceFromSelectionRaw: (start: number, end: number) => Promise<void>;
  deleteUtteranceRaw: (utteranceId: string) => Promise<void>;
  mergeWithPreviousRaw: (utteranceId: string) => Promise<void>;
  mergeWithNextRaw: (utteranceId: string) => Promise<void>;
  splitUtteranceRaw: (utteranceId: string, splitTime: number) => Promise<void>;
  deleteSelectedUtterancesRaw: (ids: Set<string>) => Promise<void>;
  offsetSelectedTimesRaw: (ids: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimesRaw: (ids: Set<string>, factor: number, anchorTime?: number) => Promise<void>;
  splitByRegexRaw: (ids: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUtterancesRaw: (ids: Set<string>) => Promise<void>;
  createLayerRaw: (layerType: 'transcription' | 'translation', input: LayerCreateInput, modality?: 'text' | 'audio' | 'mixed') => Promise<boolean>;
  deleteLayerRaw: (targetLayerId?: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  toggleLayerLinkRaw: (transcriptionLayerKey: string, tierId: string) => Promise<void>;
};

export function useTranscriptionMutexActionWrappers({
  runWithDbMutex,
  saveVoiceTranslationRaw,
  saveUtteranceTextRaw,
  saveUtteranceTimingRaw,
  saveTextTranslationForUtteranceRaw,
  createNextUtteranceRaw,
  createUtteranceFromSelectionRaw,
  deleteUtteranceRaw,
  mergeWithPreviousRaw,
  mergeWithNextRaw,
  splitUtteranceRaw,
  deleteSelectedUtterancesRaw,
  offsetSelectedTimesRaw,
  scaleSelectedTimesRaw,
  splitByRegexRaw,
  mergeSelectedUtterancesRaw,
  createLayerRaw,
  deleteLayerRaw,
  toggleLayerLinkRaw,
}: Params) {
  const saveVoiceTranslation = useCallback((
    blob: Blob,
    targetUtterance: UtteranceDocType,
    targetLayer: TranslationLayerDocType,
  ) => runWithDbMutex(() => saveVoiceTranslationRaw(blob, targetUtterance, targetLayer)), [runWithDbMutex, saveVoiceTranslationRaw]);

  const saveUtteranceText = useCallback((utteranceId: string, value: string, layerId?: string) => (
    runWithDbMutex(() => saveUtteranceTextRaw(utteranceId, value, layerId))
  ), [runWithDbMutex, saveUtteranceTextRaw]);

  const saveUtteranceTiming = useCallback((utteranceId: string, startTime: number, endTime: number) => (
    runWithDbMutex(() => saveUtteranceTimingRaw(utteranceId, startTime, endTime))
  ), [runWithDbMutex, saveUtteranceTimingRaw]);

  const saveTextTranslationForUtterance = useCallback((
    utteranceId: string,
    value: string,
    layerId: string,
  ) => runWithDbMutex(() => saveTextTranslationForUtteranceRaw(utteranceId, value, layerId)), [
    runWithDbMutex,
    saveTextTranslationForUtteranceRaw,
  ]);

  const createNextUtterance = useCallback((base: UtteranceDocType, playerDuration: number) => (
    runWithDbMutex(() => createNextUtteranceRaw(base, playerDuration))
  ), [createNextUtteranceRaw, runWithDbMutex]);

  const createUtteranceFromSelection = useCallback((start: number, end: number) => (
    runWithDbMutex(() => createUtteranceFromSelectionRaw(start, end))
  ), [createUtteranceFromSelectionRaw, runWithDbMutex]);

  const deleteUtterance = useCallback((utteranceId: string) => (
    runWithDbMutex(() => deleteUtteranceRaw(utteranceId))
  ), [deleteUtteranceRaw, runWithDbMutex]);

  const mergeWithPrevious = useCallback((utteranceId: string) => (
    runWithDbMutex(() => mergeWithPreviousRaw(utteranceId))
  ), [mergeWithPreviousRaw, runWithDbMutex]);

  const mergeWithNext = useCallback((utteranceId: string) => (
    runWithDbMutex(() => mergeWithNextRaw(utteranceId))
  ), [mergeWithNextRaw, runWithDbMutex]);

  const splitUtterance = useCallback((utteranceId: string, splitTime: number) => (
    runWithDbMutex(() => splitUtteranceRaw(utteranceId, splitTime))
  ), [runWithDbMutex, splitUtteranceRaw]);

  const deleteSelectedUtterances = useCallback((ids: Set<string>) => (
    runWithDbMutex(() => deleteSelectedUtterancesRaw(ids))
  ), [deleteSelectedUtterancesRaw, runWithDbMutex]);

  const offsetSelectedTimes = useCallback((ids: Set<string>, deltaSec: number) => (
    runWithDbMutex(() => offsetSelectedTimesRaw(ids, deltaSec))
  ), [offsetSelectedTimesRaw, runWithDbMutex]);

  const scaleSelectedTimes = useCallback((ids: Set<string>, factor: number, anchorTime?: number) => (
    runWithDbMutex(() => scaleSelectedTimesRaw(ids, factor, anchorTime))
  ), [runWithDbMutex, scaleSelectedTimesRaw]);

  const splitByRegex = useCallback((ids: Set<string>, pattern: string, flags?: string) => (
    runWithDbMutex(() => splitByRegexRaw(ids, pattern, flags))
  ), [runWithDbMutex, splitByRegexRaw]);

  const mergeSelectedUtterances = useCallback((ids: Set<string>) => (
    runWithDbMutex(() => mergeSelectedUtterancesRaw(ids))
  ), [mergeSelectedUtterancesRaw, runWithDbMutex]);

  const createLayer = useCallback((
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => runWithDbMutex(() => createLayerRaw(layerType, input, modality)), [
    createLayerRaw,
    runWithDbMutex,
  ]);

  const deleteLayer = useCallback((targetLayerId?: string, options?: { keepUtterances?: boolean }) => (
    runWithDbMutex(() => deleteLayerRaw(targetLayerId, options))
  ), [deleteLayerRaw, runWithDbMutex]);

  const toggleLayerLink = useCallback((transcriptionLayerKey: string, tierId: string) => (
    runWithDbMutex(() => toggleLayerLinkRaw(transcriptionLayerKey, tierId))
  ), [runWithDbMutex, toggleLayerLinkRaw]);

  return {
    saveVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
    toggleLayerLink,
  };
}