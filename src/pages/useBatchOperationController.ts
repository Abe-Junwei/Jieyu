import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { t, tf, useLocale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import { resolveUtteranceSelectionMapping } from './selectionIdResolvers';

type BatchOperationSelectionAction = (targetIds: Set<string>) => Promise<void>;

interface UseBatchOperationControllerInput {
  selectedUtteranceIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitToUtteranceId: ReadonlyMap<string, string>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  offsetSelectedTimes: (targetIds: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimes: (targetIds: Set<string>, factor: number, anchorTime?: number) => Promise<void>;
  splitByRegex: (targetIds: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUtterances: BatchOperationSelectionAction;
}

interface UseBatchOperationControllerResult {
  selectedUtteranceIdsForSpeakerActionsSet: Set<string>;
  selectedBatchUtterances: UtteranceDocType[];
  handleBatchOffset: (deltaSec: number) => Promise<void>;
  handleBatchScale: (factor: number, anchorTime?: number) => Promise<void>;
  handleBatchSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  handleBatchMerge: () => Promise<void>;
}

export function useBatchOperationController({
  selectedUtteranceIds,
  selectedTimelineUnit,
  unitToUtteranceId,
  utterancesOnCurrentMedia,
  setSaveState,
  offsetSelectedTimes,
  scaleSelectedTimes,
  splitByRegex,
  mergeSelectedUtterances,
}: UseBatchOperationControllerInput): UseBatchOperationControllerResult {
  const locale = useLocale();

  const batchUtteranceSelectionMapping = useMemo(() => {
    return resolveUtteranceSelectionMapping({
      selectedUtteranceIds,
      selectedTimelineUnit,
      unitToUtteranceId,
    });
  }, [selectedTimelineUnit, selectedUtteranceIds, unitToUtteranceId]);

  const selectedUtteranceIdsForSpeakerActionsSet = batchUtteranceSelectionMapping.mappedUtteranceIds;
  const hasBatchSelectionSource = batchUtteranceSelectionMapping.hasSelectionSource;

  const selectedBatchUtterances = useMemo(
    () => utterancesOnCurrentMedia
      .filter((utt) => selectedUtteranceIdsForSpeakerActionsSet.has(utt.id))
      .sort((a, b) => a.startTime - b.startTime),
    [selectedUtteranceIdsForSpeakerActionsSet, utterancesOnCurrentMedia],
  );

  const resolveBatchUtteranceTargetIds = useCallback(() => {
    if (!hasBatchSelectionSource) return null;
    if (selectedUtteranceIdsForSpeakerActionsSet.size > 0) {
      if (batchUtteranceSelectionMapping.unmappedSourceCount > 0) {
        setSaveState({
          kind: 'done',
          message: tf(locale, 'transcription.batchOperation.mappingIgnored', {
            ignored: batchUtteranceSelectionMapping.unmappedSourceCount,
            count: selectedUtteranceIdsForSpeakerActionsSet.size,
          }),
        });
      }
      return selectedUtteranceIdsForSpeakerActionsSet;
    }
    setSaveState({
      kind: 'error',
      message: t(locale, 'transcription.batchOperation.mappingUnavailable'),
    });
    return null;
  }, [batchUtteranceSelectionMapping.unmappedSourceCount, hasBatchSelectionSource, locale, selectedUtteranceIdsForSpeakerActionsSet, setSaveState]);

  const runMappedBatchAction = useCallback(async (
    actionLabelKey: Parameters<typeof t>[1],
    i18nKey: Parameters<typeof t>[1],
    action: BatchOperationSelectionAction,
  ) => {
    const targetIds = resolveBatchUtteranceTargetIds();
    if (!targetIds) return;
    try {
      await action(targetIds);
    } catch (error) {
      const { message, meta } = reportActionError({
        actionLabel: t(locale, actionLabelKey),
        error,
        i18nKey,
      });
      setSaveState({
        kind: 'error',
        message,
        ...(meta ? { errorMeta: meta } : {}),
      });
    }
  }, [locale, resolveBatchUtteranceTargetIds, setSaveState]);

  const handleBatchOffset = useCallback(async (deltaSec: number) => {
    await runMappedBatchAction('transcription.utteranceAction.undo.offsetSelection', 'transcription.error.action.offsetBatchFailed', (targetIds) => offsetSelectedTimes(targetIds, deltaSec));
  }, [offsetSelectedTimes, runMappedBatchAction]);

  const handleBatchScale = useCallback(async (factor: number, anchorTime?: number) => {
    await runMappedBatchAction('transcription.utteranceAction.undo.scaleSelection', 'transcription.error.action.scaleBatchFailed', (targetIds) => scaleSelectedTimes(targetIds, factor, anchorTime));
  }, [runMappedBatchAction, scaleSelectedTimes]);

  const handleBatchSplitByRegex = useCallback(async (pattern: string, flags?: string) => {
    await runMappedBatchAction('transcription.utteranceAction.undo.regexSplitSelection', 'transcription.error.action.regexSplitBatchFailed', (targetIds) => splitByRegex(targetIds, pattern, flags));
  }, [runMappedBatchAction, splitByRegex]);

  const handleBatchMerge = useCallback(async () => {
    await runMappedBatchAction('transcription.utteranceAction.undo.mergeSelection', 'transcription.error.action.mergeSelectionFailed', (targetIds) => mergeSelectedUtterances(targetIds));
  }, [mergeSelectedUtterances, runMappedBatchAction]);

  return {
    selectedUtteranceIdsForSpeakerActionsSet,
    selectedBatchUtterances,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  };
}