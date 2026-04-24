import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { DbState } from './transcriptionTypes';

/** Keeps `DbState` ready-phase counters aligned with live lists (units / layers / translations). */
export function useTranscriptionDataPhaseCountsEffect(input: {
  statePhase: DbState['phase'];
  unitsLength: number;
  translationLayersLength: number;
  translationsLength: number;
  setState: Dispatch<SetStateAction<DbState>>;
}): void {
  const {
    statePhase,
    unitsLength,
    translationLayersLength,
    translationsLength,
    setState,
  } = input;

  useEffect(() => {
    if (statePhase !== 'ready') return;
    const nextUnitCount = unitsLength;
    const nextTranslationLayerCount = translationLayersLength;
    const nextTranslationRecordCount = translationsLength;
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      const nextUnifiedUnitCount = prev.unifiedUnitCount ?? nextUnitCount;
      if (
        prev.unitCount === nextUnitCount
        && prev.unifiedUnitCount === nextUnifiedUnitCount
        && prev.translationLayerCount === nextTranslationLayerCount
        && prev.translationRecordCount === nextTranslationRecordCount
      ) {
        return prev;
      }
      return {
        ...prev,
        unitCount: nextUnitCount,
        unifiedUnitCount: nextUnifiedUnitCount,
        translationLayerCount: nextTranslationLayerCount,
        translationRecordCount: nextTranslationRecordCount,
      };
    });
  }, [statePhase, unitsLength, translationLayersLength, translationsLength, setState]);
}
