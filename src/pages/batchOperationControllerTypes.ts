import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';

export type BatchOperationSelectionAction = (targetIds: Set<string>) => Promise<void>;

export interface UseBatchOperationControllerInput {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  offsetSelectedTimes: (targetIds: Set<string>, deltaSec: number) => Promise<void>;
  scaleSelectedTimes: (
    targetIds: Set<string>,
    factor: number,
    anchorTime?: number,
  ) => Promise<void>;
  splitByRegex: (targetIds: Set<string>, pattern: string, flags?: string) => Promise<void>;
  mergeSelectedUnits: BatchOperationSelectionAction;
}

export interface UseBatchOperationControllerResult {
  selectedBatchUnitIdsSet: Set<string>;
  selectedBatchUnits: LayerUnitDocType[];
  handleBatchOffset: (deltaSec: number) => Promise<void>;
  handleBatchScale: (factor: number, anchorTime?: number) => Promise<void>;
  handleBatchSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  handleBatchMerge: () => Promise<void>;
}
