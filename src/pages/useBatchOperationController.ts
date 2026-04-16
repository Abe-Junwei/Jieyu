import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { t, tf, useLocale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import { resolveUnitSelectionMapping } from './selectionIdResolvers';

type BatchOperationSelectionAction = (targetIds: Set<string>) => Promise<void>;

interface UseBatchOperationControllerInput {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  offsetSelectedTimes: (targetIds: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimes: (targetIds: Set<string>, factor: number, anchorTime?: number) => Promise<void>;
  splitByRegex: (targetIds: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUtterances: BatchOperationSelectionAction;
}

interface UseBatchOperationControllerResult {
  selectedUnitIdsForSpeakerActionsSet: Set<string>;
  selectedBatchUtterances: UtteranceDocType[];
  handleBatchOffset: (deltaSec: number) => Promise<void>;
  handleBatchScale: (factor: number, anchorTime?: number) => Promise<void>;
  handleBatchSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  handleBatchMerge: () => Promise<void>;
}

export function useBatchOperationController({
  selectedUnitIds,
  selectedTimelineUnit,
  unitViewById,
  resolveUnitViewById,
  unitsOnCurrentMedia,
  getUtteranceDocById,
  setSaveState,
  offsetSelectedTimes,
  scaleSelectedTimes,
  splitByRegex,
  mergeSelectedUtterances,
}: UseBatchOperationControllerInput): UseBatchOperationControllerResult {
  const locale = useLocale();
  const batchUtteranceSelectionMapping = useMemo(() => {
    return resolveUnitSelectionMapping({
      selectedUnitIds,
      selectedTimelineUnit,
      unitViewById,
      ...(resolveUnitViewById ? { resolveUnitViewById } : {}),
    });
  }, [resolveUnitViewById, selectedTimelineUnit, selectedUnitIds, unitViewById]);
  const selectedUnitIdsForSpeakerActionsSet = batchUtteranceSelectionMapping.mappedUnitIds;
  const hasBatchSelectionSource = batchUtteranceSelectionMapping.hasSelectionSource;
  const selectedBatchUtterances = useMemo(() => {
    const docs: UtteranceDocType[] = [];
    for (const unit of unitsOnCurrentMedia) {
      if (unit.kind !== 'utterance') continue;
      if (!selectedUnitIdsForSpeakerActionsSet.has(unit.id)) continue;
      const doc = getUtteranceDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return docs.sort((a, b) => a.startTime - b.startTime);
  }, [getUtteranceDocById, selectedUnitIdsForSpeakerActionsSet, unitsOnCurrentMedia]);
  const resolveBatchUtteranceTargetIds = useCallback(() => {
    if (!hasBatchSelectionSource) return null;
    if (selectedUnitIdsForSpeakerActionsSet.size > 0) {
      if (batchUtteranceSelectionMapping.unmappedSourceCount > 0) {
        setSaveState({
          kind: 'done',
          message: tf(locale, 'transcription.batchOperation.mappingIgnored', {
            ignored: batchUtteranceSelectionMapping.unmappedSourceCount,
            count: selectedUnitIdsForSpeakerActionsSet.size,
          }),
        });
      }
      return selectedUnitIdsForSpeakerActionsSet;
    }
    setSaveState({
      kind: 'error',
      message: t(locale, 'transcription.batchOperation.mappingUnavailable'),
    });
    return null;
  }, [batchUtteranceSelectionMapping.unmappedSourceCount, hasBatchSelectionSource, locale, selectedUnitIdsForSpeakerActionsSet, setSaveState]);
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
        i18nKey: i18nKey,
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
    selectedUnitIdsForSpeakerActionsSet,
    selectedBatchUtterances,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  };
}