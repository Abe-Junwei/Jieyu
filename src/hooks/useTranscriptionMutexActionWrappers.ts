import { useMemo } from 'react';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import type { LayerCreateInput } from './transcriptionTypes';
import type { PerLayerRowFieldPatch } from './useTranscriptionUnitActions';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  saveVoiceTranslationRaw: (blob: Blob, targetUnit: LayerUnitDocType, targetLayer: LayerDocType) => Promise<void>;
  deleteVoiceTranslationRaw: (targetUnit: LayerUnitDocType, targetLayer: LayerDocType) => Promise<void>;
  transcribeVoiceTranslationRaw: (
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
    options?: { signal?: AbortSignal; audioBlob?: Blob },
  ) => Promise<void>;
  saveUnitTextRaw: (unitId: string, value: string, layerId?: string) => Promise<void>;
  saveUnitSelfCertaintyRaw: (unitIds: Iterable<string>, value: UnitSelfCertainty | undefined) => Promise<void>;
  saveUnitLayerFieldsRaw: (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => Promise<void>;
  saveUnitTimingRaw: (unitId: string, startTime: number, endTime: number) => Promise<void>;
  saveUnitLayerTextRaw: (unitId: string, value: string, layerId: string) => Promise<void>;
  createAdjacentUnitRaw: (base: LayerUnitDocType, playerDuration: number) => Promise<void>;
  createUnitFromSelectionRaw: (start: number, end: number, options?: { speakerId?: string; focusedLayerId?: string }) => Promise<void>;
  deleteUnitRaw: (unitId: string) => Promise<void>;
  mergeWithPreviousRaw: (unitId: string) => Promise<void>;
  mergeWithNextRaw: (unitId: string) => Promise<void>;
  splitUnitRaw: (unitId: string, splitTime: number) => Promise<void>;
  deleteSelectedUnitsRaw: (ids: Set<string>) => Promise<void>;
  offsetSelectedTimesRaw: (ids: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimesRaw: (ids: Set<string>, factor: number, anchorTime?: number) => Promise<void>;
  splitByRegexRaw: (ids: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUnitsRaw: (ids: Set<string>) => Promise<void>;
  createLayerRaw: (layerType: 'transcription' | 'translation', input: LayerCreateInput, modality?: 'text' | 'audio' | 'mixed') => Promise<boolean>;
  deleteLayerRaw: (targetLayerId?: string, options?: { keepUnits?: boolean }) => Promise<void>;
  toggleLayerLinkRaw: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
  rebindTranslationLayerHostRaw: (input: {
    translationLayerId: string;
    removeTranscriptionLayerId: string;
    fallbackTranscriptionLayerKey: string;
  }) => Promise<void>;
};

export function useTranscriptionMutexActionWrappers({
  runWithDbMutex,
  saveVoiceTranslationRaw,
  deleteVoiceTranslationRaw,
  transcribeVoiceTranslationRaw,
  saveUnitTextRaw,
  saveUnitSelfCertaintyRaw,
  saveUnitLayerFieldsRaw,
  saveUnitTimingRaw,
  saveUnitLayerTextRaw,
  createAdjacentUnitRaw,
  createUnitFromSelectionRaw,
  deleteUnitRaw,
  mergeWithPreviousRaw,
  mergeWithNextRaw,
  splitUnitRaw,
  deleteSelectedUnitsRaw,
  offsetSelectedTimesRaw,
  scaleSelectedTimesRaw,
  splitByRegexRaw,
  mergeSelectedUnitsRaw,
  createLayerRaw,
  deleteLayerRaw,
  toggleLayerLinkRaw,
  rebindTranslationLayerHostRaw,
}: Params) {
  return useMemo(() => {
    const wrapWithDbMutex = <Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>) => (
      (...args: Args) => runWithDbMutex(() => fn(...args))
    );

    return {
      saveVoiceTranslation: wrapWithDbMutex(saveVoiceTranslationRaw),
      deleteVoiceTranslation: wrapWithDbMutex(deleteVoiceTranslationRaw),
      transcribeVoiceTranslation: wrapWithDbMutex(transcribeVoiceTranslationRaw),
      saveUnitText: wrapWithDbMutex(saveUnitTextRaw),
      saveUnitSelfCertainty: wrapWithDbMutex(saveUnitSelfCertaintyRaw),
      saveUnitLayerFields: wrapWithDbMutex(saveUnitLayerFieldsRaw),
      saveUnitTiming: wrapWithDbMutex(saveUnitTimingRaw),
      saveUnitLayerText: wrapWithDbMutex(saveUnitLayerTextRaw),
      createAdjacentUnit: wrapWithDbMutex(createAdjacentUnitRaw),
      createUnitFromSelection: wrapWithDbMutex(createUnitFromSelectionRaw),
      deleteUnit: wrapWithDbMutex(deleteUnitRaw),
      mergeWithPrevious: wrapWithDbMutex(mergeWithPreviousRaw),
      mergeWithNext: wrapWithDbMutex(mergeWithNextRaw),
      splitUnit: wrapWithDbMutex(splitUnitRaw),
      deleteSelectedUnits: wrapWithDbMutex(deleteSelectedUnitsRaw),
      offsetSelectedTimes: wrapWithDbMutex(offsetSelectedTimesRaw),
      scaleSelectedTimes: wrapWithDbMutex(scaleSelectedTimesRaw),
      splitByRegex: wrapWithDbMutex(splitByRegexRaw),
      mergeSelectedUnits: wrapWithDbMutex(mergeSelectedUnitsRaw),
      createLayer: wrapWithDbMutex(createLayerRaw),
      deleteLayer: wrapWithDbMutex(deleteLayerRaw),
      toggleLayerLink: wrapWithDbMutex(toggleLayerLinkRaw),
      rebindTranslationLayerHost: wrapWithDbMutex(rebindTranslationLayerHostRaw),
    };
  }, [
    createAdjacentUnitRaw,
    createLayerRaw,
    createUnitFromSelectionRaw,
    deleteLayerRaw,
    deleteSelectedUnitsRaw,
    deleteUnitRaw,
    deleteVoiceTranslationRaw,
    mergeSelectedUnitsRaw,
    mergeWithNextRaw,
    mergeWithPreviousRaw,
    offsetSelectedTimesRaw,
    rebindTranslationLayerHostRaw,
    runWithDbMutex,
    saveUnitLayerFieldsRaw,
    saveUnitLayerTextRaw,
    saveUnitSelfCertaintyRaw,
    saveUnitTextRaw,
    saveUnitTimingRaw,
    saveVoiceTranslationRaw,
    scaleSelectedTimesRaw,
    splitByRegexRaw,
    splitUnitRaw,
    toggleLayerLinkRaw,
    transcribeVoiceTranslationRaw,
  ]);
}