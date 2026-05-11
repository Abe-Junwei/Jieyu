import type { Dispatch, SetStateAction } from 'react';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import { t, tf, type Locale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import type { BatchOperationSelectionAction } from './batchOperationControllerTypes';

type ResolveBatchTargets = () => Set<string> | null;

export function createResolveBatchUnitTargetIds(input: {
  hasBatchSelectionSource: boolean;
  selectedBatchUnitIdsSet: Set<string>;
  unmappedSourceCount: number;
  locale: Locale;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
}): ResolveBatchTargets {
  const {
    hasBatchSelectionSource,
    selectedBatchUnitIdsSet,
    unmappedSourceCount,
    locale,
    setSaveState,
  } = input;
  return () => {
    if (!hasBatchSelectionSource) return null;
    if (selectedBatchUnitIdsSet.size > 0) {
      if (unmappedSourceCount > 0) {
        setSaveState({
          kind: 'done',
          message: tf(locale, 'transcription.batchOperation.mappingIgnored', {
            ignored: unmappedSourceCount,
            count: selectedBatchUnitIdsSet.size,
          }),
        });
      }
      return selectedBatchUnitIdsSet;
    }
    setSaveState({
      kind: 'error',
      message: t(locale, 'transcription.batchOperation.mappingUnavailable'),
    });
    return null;
  };
}

export async function runMappedBatchSelectionAction(input: {
  resolveBatchUnitTargetIds: ResolveBatchTargets;
  locale: Locale;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  actionLabelKey: Parameters<typeof t>[1];
  i18nKey: Parameters<typeof t>[1];
  action: BatchOperationSelectionAction;
}): Promise<void> {
  const { resolveBatchUnitTargetIds, locale, setSaveState, actionLabelKey, i18nKey, action } =
    input;
  const targetIds = resolveBatchUnitTargetIds();
  if (!targetIds) return;
  try {
    await action(targetIds);
  } catch (error) {
    const { message, meta } = reportActionError({
      actionLabel: t(locale, actionLabelKey),
      error,
      i18nKey: i18nKey,
    });
    setSaveState({
      kind: 'error',
      message,
      ...(meta !== undefined ? { errorMeta: meta } : {}),
    });
  }
}

type RunMappedBatchAction = (
  actionLabelKey: Parameters<typeof t>[1],
  i18nKey: Parameters<typeof t>[1],
  action: BatchOperationSelectionAction,
) => Promise<void>;

export function createBatchOperationSurfaceHandlers(input: {
  runMappedBatchAction: RunMappedBatchAction;
  offsetSelectedTimes: (targetIds: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimes: (
    targetIds: Set<string>,
    factor: number,
    anchorTime?: number,
  ) => Promise<void>;
  splitByRegex: (targetIds: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUnits: BatchOperationSelectionAction;
}): {
  handleBatchOffset: (deltaSec: number) => Promise<void>;
  handleBatchScale: (factor: number, anchorTime?: number) => Promise<void>;
  handleBatchSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  handleBatchMerge: () => Promise<void>;
} {
  const {
    runMappedBatchAction,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
  } = input;
  return {
    handleBatchOffset: async (deltaSec: number) => {
      await runMappedBatchAction(
        'transcription.unitAction.undo.offsetSelection',
        'transcription.error.action.offsetBatchFailed',
        (targetIds) => offsetSelectedTimes(targetIds, deltaSec),
      );
    },
    handleBatchScale: async (factor: number, anchorTime?: number) => {
      await runMappedBatchAction(
        'transcription.unitAction.undo.scaleSelection',
        'transcription.error.action.scaleBatchFailed',
        (targetIds) => scaleSelectedTimes(targetIds, factor, anchorTime),
      );
    },
    handleBatchSplitByRegex: async (pattern: string, flags?: string) => {
      await runMappedBatchAction(
        'transcription.unitAction.undo.regexSplitSelection',
        'transcription.error.action.regexSplitBatchFailed',
        (targetIds) => splitByRegex(targetIds, pattern, flags),
      );
    },
    handleBatchMerge: async () => {
      await runMappedBatchAction(
        'transcription.unitAction.undo.mergeSelection',
        'transcription.error.action.mergeSelectionFailed',
        (targetIds) => mergeSelectedUnits(targetIds),
      );
    },
  };
}
