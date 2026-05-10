import { useCallback, useMemo } from 'react';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import { t, useLocale } from '../i18n';
import { resolveUnitSelectionMapping } from './selectionIdResolvers';
import {
  createBatchOperationSurfaceHandlers,
  createResolveBatchUnitTargetIds,
  runMappedBatchSelectionAction,
} from './batchOperationMappedRunner';
import type {
  UseBatchOperationControllerInput,
  UseBatchOperationControllerResult,
} from './batchOperationControllerTypes';

export type { UseBatchOperationControllerInput, UseBatchOperationControllerResult };

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
  const { selectedBatchUnitIdsSet, selectedBatchUnits, resolveBatchUnitTargetIds } = useMemo(() => {
    const batchUnitSelectionMapping = resolveUnitSelectionMapping({
      selectedUnitIds,
      selectedTimelineUnit,
      unitViewById,
      ...(resolveUnitViewById ? { resolveUnitViewById } : {}),
    });
    const selectedBatchUnitIdsSet = batchUnitSelectionMapping.mappedUnitIds;
    const hasBatchSelectionSource = batchUnitSelectionMapping.hasSelectionSource;
    const docs: LayerUnitDocType[] = [];
    for (const unit of unitsOnCurrentMedia) {
      if (unit.kind !== 'unit') continue;
      if (!selectedBatchUnitIdsSet.has(unit.id)) continue;
      const doc = getUnitDocById(unit.id);
      if (doc) docs.push(doc);
    }
    const selectedBatchUnits = docs.sort((a, b) => a.startTime - b.startTime);
    const resolveBatchUnitTargetIds = createResolveBatchUnitTargetIds({
      hasBatchSelectionSource,
      selectedBatchUnitIdsSet,
      unmappedSourceCount: batchUnitSelectionMapping.unmappedSourceCount,
      locale,
      setSaveState,
    });
    return { selectedBatchUnitIdsSet, selectedBatchUnits, resolveBatchUnitTargetIds };
  }, [
    getUnitDocById,
    locale,
    resolveUnitViewById,
    selectedTimelineUnit,
    selectedUnitIds,
    setSaveState,
    unitViewById,
    unitsOnCurrentMedia,
  ]);

  const runMappedBatchAction = useCallback(
    async (
      actionLabelKey: Parameters<typeof t>[1],
      i18nKey: Parameters<typeof t>[1],
      action: import('./batchOperationControllerTypes').BatchOperationSelectionAction,
    ) => {
      await runMappedBatchSelectionAction({
        resolveBatchUnitTargetIds,
        locale,
        setSaveState,
        actionLabelKey,
        i18nKey,
        action,
      });
    },
    [locale, resolveBatchUnitTargetIds, setSaveState],
  );

  const { handleBatchOffset, handleBatchScale, handleBatchSplitByRegex, handleBatchMerge } =
    useMemo(
      () =>
        createBatchOperationSurfaceHandlers({
          runMappedBatchAction,
          offsetSelectedTimes,
          scaleSelectedTimes,
          splitByRegex,
          mergeSelectedUnits,
        }),
      [
        mergeSelectedUnits,
        offsetSelectedTimes,
        runMappedBatchAction,
        scaleSelectedTimes,
        splitByRegex,
      ],
    );

  return {
    selectedBatchUnitIdsSet,
    selectedBatchUnits,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  };
}
