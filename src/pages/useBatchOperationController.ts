import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import {
  resolveUtteranceSelectionMapping,
} from './selectionIdResolvers';

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
          message: `已忽略 ${batchUtteranceSelectionMapping.unmappedSourceCount} 个不可映射选中项，将对 ${selectedUtteranceIdsForSpeakerActionsSet.size} 个句段执行批量操作。`,
        });
      }
      return selectedUtteranceIdsForSpeakerActionsSet;
    }
    setSaveState({
      kind: 'error',
      message: '当前选中的语段无法映射到可编辑句段，请先选择可编辑句段后再试。',
    });
    return null;
  }, [batchUtteranceSelectionMapping.unmappedSourceCount, hasBatchSelectionSource, selectedUtteranceIdsForSpeakerActionsSet, setSaveState]);

  const runMappedBatchAction = useCallback(async (action: BatchOperationSelectionAction) => {
    const targetIds = resolveBatchUtteranceTargetIds();
    if (!targetIds) return;
    await action(targetIds);
  }, [resolveBatchUtteranceTargetIds]);

  const handleBatchOffset = useCallback(async (deltaSec: number) => {
    await runMappedBatchAction((targetIds) => offsetSelectedTimes(targetIds, deltaSec));
  }, [offsetSelectedTimes, runMappedBatchAction]);

  const handleBatchScale = useCallback(async (factor: number, anchorTime?: number) => {
    await runMappedBatchAction((targetIds) => scaleSelectedTimes(targetIds, factor, anchorTime));
  }, [runMappedBatchAction, scaleSelectedTimes]);

  const handleBatchSplitByRegex = useCallback(async (pattern: string, flags?: string) => {
    await runMappedBatchAction((targetIds) => splitByRegex(targetIds, pattern, flags));
  }, [runMappedBatchAction, splitByRegex]);

  const handleBatchMerge = useCallback(async () => {
    await runMappedBatchAction((targetIds) => mergeSelectedUtterances(targetIds));
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