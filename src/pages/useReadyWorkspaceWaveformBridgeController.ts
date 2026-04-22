import { useMemo } from 'react';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';
import { buildReadyWorkspaceWaveformBridgeControllerInput } from './transcriptionReadyWorkspaceWaveformBridgeInput';
import type { ReadyWorkspaceWaveformBridgeInputParams } from './transcriptionReadyWorkspaceWaveformBridgeInput';
import { useTranscriptionWaveformBridgeController } from './useTranscriptionWaveformBridgeController';

export type UseReadyWorkspaceWaveformBridgeControllerInput = Omit<
  ReadyWorkspaceWaveformBridgeInputParams,
  'logicalTimelineDurationForZoom'
> & {
  activeTextTimeLogicalDurationSec: number | undefined;
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
};

/**
 * ReadyWorkspace 波形桥：文献秒跨度派生 + 入参构建与 `useTranscriptionWaveformBridgeController` 同栈，减轻页面壳行数。
 */
export function useReadyWorkspaceWaveformBridgeController(input: UseReadyWorkspaceWaveformBridgeControllerInput) {
  const {
    activeTextTimeLogicalDurationSec,
    unitsOnCurrentMedia,
    ...bridgeFieldParams
  } = input;

  const logicalTimelineDurationForZoom = useMemo(
    () => computeLogicalTimelineDurationForZoom(activeTextTimeLogicalDurationSec, unitsOnCurrentMedia),
    [activeTextTimeLogicalDurationSec, unitsOnCurrentMedia],
  );

  return useTranscriptionWaveformBridgeController(
    buildReadyWorkspaceWaveformBridgeControllerInput({
      ...bridgeFieldParams,
      logicalTimelineDurationForZoom,
    }),
  );
}
