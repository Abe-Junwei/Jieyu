import { useCallback } from 'react';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import type { LayerCreateInput } from './transcriptionTypes';
import type { PerLayerRowFieldPatch } from './useTranscriptionUnitActions';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  saveVoiceTranslationRaw: (blob: Blob, targetUnit: LayerUnitDocType, targetLayer: LayerDocType) => Promise<void>;
  deleteVoiceTranslationRaw: (targetUnit: LayerUnitDocType, targetLayer: LayerDocType) => Promise<void>;
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
};

export function useTranscriptionMutexActionWrappers({
  runWithDbMutex,
  saveVoiceTranslationRaw,
  deleteVoiceTranslationRaw,
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
}: Params) {
  const saveVoiceTranslation = useCallback((
    blob: Blob,
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
  ) => runWithDbMutex(() => saveVoiceTranslationRaw(blob, targetUnit, targetLayer)), [runWithDbMutex, saveVoiceTranslationRaw]);

  const deleteVoiceTranslation = useCallback((
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
  ) => runWithDbMutex(() => deleteVoiceTranslationRaw(targetUnit, targetLayer)), [deleteVoiceTranslationRaw, runWithDbMutex]);

  const saveUnitText = useCallback((unitId: string, value: string, layerId?: string) => (
    runWithDbMutex(() => saveUnitTextRaw(unitId, value, layerId))
  ), [runWithDbMutex, saveUnitTextRaw]);

  const saveUnitSelfCertainty = useCallback((
    unitIds: Iterable<string>,
    value: UnitSelfCertainty | undefined,
  ) => runWithDbMutex(() => saveUnitSelfCertaintyRaw(unitIds, value)), [
    runWithDbMutex,
    saveUnitSelfCertaintyRaw,
  ]);

  const saveUnitLayerFields = useCallback((
    unitIds: Iterable<string>,
    patch: PerLayerRowFieldPatch,
  ) => runWithDbMutex(() => saveUnitLayerFieldsRaw(unitIds, patch)), [
    runWithDbMutex,
    saveUnitLayerFieldsRaw,
  ]);

  const saveUnitTiming = useCallback((unitId: string, startTime: number, endTime: number) => (
    runWithDbMutex(() => saveUnitTimingRaw(unitId, startTime, endTime))
  ), [runWithDbMutex, saveUnitTimingRaw]);

  const saveUnitLayerText = useCallback((
    unitId: string,
    value: string,
    layerId: string,
  ) => runWithDbMutex(() => saveUnitLayerTextRaw(unitId, value, layerId)), [
    runWithDbMutex,
    saveUnitLayerTextRaw,
  ]);

  const createAdjacentUnit = useCallback((base: LayerUnitDocType, playerDuration: number) => (
    runWithDbMutex(() => createAdjacentUnitRaw(base, playerDuration))
  ), [createAdjacentUnitRaw, runWithDbMutex]);

  const createUnitFromSelection = useCallback((start: number, end: number, options?: { speakerId?: string; focusedLayerId?: string }) => (
    runWithDbMutex(() => createUnitFromSelectionRaw(start, end, options))
  ), [createUnitFromSelectionRaw, runWithDbMutex]);

  const deleteUnit = useCallback((unitId: string) => (
    runWithDbMutex(() => deleteUnitRaw(unitId))
  ), [deleteUnitRaw, runWithDbMutex]);

  const mergeWithPrevious = useCallback((unitId: string) => (
    runWithDbMutex(() => mergeWithPreviousRaw(unitId))
  ), [mergeWithPreviousRaw, runWithDbMutex]);

  const mergeWithNext = useCallback((unitId: string) => (
    runWithDbMutex(() => mergeWithNextRaw(unitId))
  ), [mergeWithNextRaw, runWithDbMutex]);

  const splitUnit = useCallback((unitId: string, splitTime: number) => (
    runWithDbMutex(() => splitUnitRaw(unitId, splitTime))
  ), [runWithDbMutex, splitUnitRaw]);

  const deleteSelectedUnits = useCallback((ids: Set<string>) => (
    runWithDbMutex(() => deleteSelectedUnitsRaw(ids))
  ), [deleteSelectedUnitsRaw, runWithDbMutex]);

  const offsetSelectedTimes = useCallback((ids: Set<string>, deltaSec: number) => (
    runWithDbMutex(() => offsetSelectedTimesRaw(ids, deltaSec))
  ), [offsetSelectedTimesRaw, runWithDbMutex]);

  const scaleSelectedTimes = useCallback((ids: Set<string>, factor: number, anchorTime?: number) => (
    runWithDbMutex(() => scaleSelectedTimesRaw(ids, factor, anchorTime))
  ), [runWithDbMutex, scaleSelectedTimesRaw]);

  const splitByRegex = useCallback((ids: Set<string>, pattern: string, flags?: string) => (
    runWithDbMutex(() => splitByRegexRaw(ids, pattern, flags))
  ), [runWithDbMutex, splitByRegexRaw]);

  const mergeSelectedUnits = useCallback((ids: Set<string>) => (
    runWithDbMutex(() => mergeSelectedUnitsRaw(ids))
  ), [mergeSelectedUnitsRaw, runWithDbMutex]);

  const createLayer = useCallback((
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => runWithDbMutex(() => createLayerRaw(layerType, input, modality)), [
    createLayerRaw,
    runWithDbMutex,
  ]);

  const deleteLayer = useCallback((targetLayerId?: string, options?: { keepUnits?: boolean }) => (
    runWithDbMutex(() => deleteLayerRaw(targetLayerId, options))
  ), [deleteLayerRaw, runWithDbMutex]);

  const toggleLayerLink = useCallback((transcriptionLayerKey: string, layerId: string) => (
    runWithDbMutex(() => toggleLayerLinkRaw(transcriptionLayerKey, layerId))
  ), [runWithDbMutex, toggleLayerLinkRaw]);

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUnitText,
    saveUnitSelfCertainty,
    saveUnitLayerFields,
    saveUnitTiming,
    saveUnitLayerText,
    createAdjacentUnit,
    createUnitFromSelection,
    deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit,
    deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
    createLayer,
    deleteLayer,
    toggleLayerLink,
  };
}