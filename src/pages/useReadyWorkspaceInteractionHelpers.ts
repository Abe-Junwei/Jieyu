/**
 * Ready workspace interaction helpers | Ready 态页面交互辅助
 *
 * 将高频但稳定的查找/记录/桥接回调收拢到独立 hook，
 * 以减轻主页面组件体积并保持依赖边界清晰。
 * | Gather stable lookup and bridge callbacks into a dedicated hook
 * to keep the main ready-workspace component smaller and easier to audit.
 */

import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { EditEvent } from '../hooks/useEditEventBuffer';
import { pushTimelineEditToRing, type PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import { fireAndForget } from '../utils/fireAndForget';

type RecommendationWithId = { id: string };
type TimeRangedUnitDoc = { id: string; startTime: number; endTime: number };

type ReadyWorkspaceInteractionInput<
  TUnit extends TimeRangedUnitDoc,
  TRecommendation extends RecommendationWithId = RecommendationWithId,
> = {
  unitsOnCurrentMedia: TUnit[];
  actionableObserverRecommendations?: TRecommendation[];
  handleExecuteRecommendation?: (item: TRecommendation) => void | Promise<void>;
  playerInstanceRef?: RefObject<{ getWidth?: () => number } | null>;
};

type ReadyWorkspaceInteractionResult<TUnit extends TimeRangedUnitDoc> = {
  recentTimelineEditEvents: EditEvent[];
  recordTimelineEdit: (event: PushTimelineEditInput) => void;
  getUnitDocById: (id: string) => TUnit | undefined;
  findUnitDocContainingRange: (start: number, end: number) => TUnit | undefined;
  findOverlappingUnitDoc: (start: number, end: number) => TUnit | undefined;
  handleExecuteObserverRecommendation: (item: RecommendationWithId) => void;
  playerInstanceGetWidth: () => number;
};

export function useReadyWorkspaceInteractionHelpers<
  TUnit extends TimeRangedUnitDoc,
  TRecommendation extends RecommendationWithId = RecommendationWithId,
>(
  input: ReadyWorkspaceInteractionInput<TUnit, TRecommendation>,
): ReadyWorkspaceInteractionResult<TUnit>;
export function useReadyWorkspaceInteractionHelpers(
  input: ReadyWorkspaceInteractionInput<TimeRangedUnitDoc>,
): ReadyWorkspaceInteractionResult<TimeRangedUnitDoc>;
export function useReadyWorkspaceInteractionHelpers<
  TUnit extends TimeRangedUnitDoc,
  TRecommendation extends RecommendationWithId = RecommendationWithId,
>(input: ReadyWorkspaceInteractionInput<TUnit, TRecommendation>): ReadyWorkspaceInteractionResult<TUnit> {
  const {
    unitsOnCurrentMedia,
    actionableObserverRecommendations = [],
    handleExecuteRecommendation,
    playerInstanceRef,
  } = input;

  const [recentTimelineEditEvents, setRecentTimelineEditEvents] = useState<EditEvent[]>([]);

  const recordTimelineEdit = useCallback((event: PushTimelineEditInput) => {
    setRecentTimelineEditEvents((prev) => pushTimelineEditToRing(prev, event));
  }, []);

  const { getUnitDocById, findUnitDocContainingRange, findOverlappingUnitDoc } = useMemo(() => ({
    getUnitDocById: (id: string) => unitsOnCurrentMedia.find((unit) => unit.id === id),
    findUnitDocContainingRange: (start: number, end: number) => unitsOnCurrentMedia.find(
      (unit) => unit.startTime <= start + 0.01 && unit.endTime >= end - 0.01,
    ),
    findOverlappingUnitDoc: (start: number, end: number) => unitsOnCurrentMedia.find(
      (unit) => unit.startTime <= end - 0.01 && unit.endTime >= start + 0.01,
    ),
  }), [unitsOnCurrentMedia]);

  const handleExecuteObserverRecommendation = (item: RecommendationWithId) => {
    if (!handleExecuteRecommendation) return;
    const match = actionableObserverRecommendations.find((candidate) => candidate.id === item.id);
    if (match) {
      fireAndForget(Promise.resolve(handleExecuteRecommendation(match)), { context: 'src/pages/useReadyWorkspaceInteractionHelpers.ts:L78', policy: 'user-visible' });
    }
  };

  const playerInstanceGetWidth = () => playerInstanceRef?.current?.getWidth?.() ?? 9999;

  return {
    recentTimelineEditEvents,
    recordTimelineEdit,
    getUnitDocById,
    findUnitDocContainingRange,
    findOverlappingUnitDoc,
    handleExecuteObserverRecommendation,
    playerInstanceGetWidth,
  };
}
