import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
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
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  offsetSelectedTimes: (targetIds: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimes: (targetIds: Set<string>, factor: number, anchorTime?: number) => Promise<void>;
  splitByRegex: (targetIds: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUnits: BatchOperationSelectionAction;
}

interface UseBatchOperationControllerResult {
  selectedBatchUnitIdsSet: Set<string>;
  selectedBatchUnits: LayerUnitDocType[];
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
  getUnitDocById,
  setSaveState,
  offsetSelectedTimes,
  scaleSelectedTimes,
  splitByRegex,
  mergeSelectedUnits,
}: UseBatchOperationControllerInput): UseBatchOperationControllerResult {
  const locale = useLocale();
  const batchUnitSelectionMapping = useMemo(() => {
    return resolveUnitSelectionMapping({
      selectedUnitIds,
      selectedTimelineUnit,
      unitViewById,
      ...(resolveUnitViewById ? { resolveUnitViewById } : {}),
    });
  }, [resolveUnitViewById, selectedTimelineUnit, selectedUnitIds, unitViewById]);
  const selectedBatchUnitIdsSet = batchUnitSelectionMapping.mappedUnitIds;
  const hasBatchSelectionSource = batchUnitSelectionMapping.hasSelectionSource;
  const selectedBatchUnits = useMemo(() => {
    const docs: LayerUnitDocType[] = [];
    for (const unit of unitsOnCurrentMedia) {
      if (unit.kind !== 'unit') continue;
      if (!selectedBatchUnitIdsSet.has(unit.id)) continue;
      const doc = getUnitDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return docs.sort((a, b) => a.startTime - b.startTime);
  }, [getUnitDocById, selectedBatchUnitIdsSet, unitsOnCurrentMedia]);
  const resolveBatchUnitTargetIds = useCallback(() => {
    if (!hasBatchSelectionSource) return null;
    if (selectedBatchUnitIdsSet.size > 0) {
      if (batchUnitSelectionMapping.unmappedSourceCount > 0) {
        setSaveState({
          kind: 'done',
          message: tf(locale, 'transcription.batchOperation.mappingIgnored', {
            ignored: batchUnitSelectionMapping.unmappedSourceCount,
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
  }, [batchUnitSelectionMapping.unmappedSourceCount, hasBatchSelectionSource, locale, selectedBatchUnitIdsSet, setSaveState]);
  const runMappedBatchAction = useCallback(async (
    actionLabelKey: Parameters<typeof t>[1],
    i18nKey: Parameters<typeof t>[1],
    action: BatchOperationSelectionAction,
  ) => {
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
        ...(meta ? { errorMeta: meta } : {}),
      });
    }
  }, [locale, resolveBatchUnitTargetIds, setSaveState]);
  const handleBatchOffset = useCallback(async (deltaSec: number) => {
    await runMappedBatchAction('transcription.unitAction.undo.offsetSelection', 'transcription.error.action.offsetBatchFailed', (targetIds) => offsetSelectedTimes(targetIds, deltaSec));
  }, [offsetSelectedTimes, runMappedBatchAction]);
  const handleBatchScale = useCallback(async (factor: number, anchorTime?: number) => {
    await runMappedBatchAction('transcription.unitAction.undo.scaleSelection', 'transcription.error.action.scaleBatchFailed', (targetIds) => scaleSelectedTimes(targetIds, factor, anchorTime));
  }, [runMappedBatchAction, scaleSelectedTimes]);
  const handleBatchSplitByRegex = useCallback(async (pattern: string, flags?: string) => {
    await runMappedBatchAction('transcription.unitAction.undo.regexSplitSelection', 'transcription.error.action.regexSplitBatchFailed', (targetIds) => splitByRegex(targetIds, pattern, flags));
  }, [runMappedBatchAction, splitByRegex]);
  const handleBatchMerge = useCallback(async () => {
    await runMappedBatchAction('transcription.unitAction.undo.mergeSelection', 'transcription.error.action.mergeSelectionFailed', (targetIds) => mergeSelectedUnits(targetIds));
  }, [mergeSelectedUnits, runMappedBatchAction]);
  return {
    selectedBatchUnitIdsSet,
    selectedBatchUnits,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  };
}