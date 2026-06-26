import { buildReadyWorkspaceWaveformBridgeControllerInput } from './transcriptionReadyWorkspaceWaveformBridgeInput';
import type { ReadyWorkspaceWaveformBridgeInputParams } from './transcriptionReadyWorkspaceWaveformBridgeInput';
import { useTranscriptionWaveformBridgeController } from './useTranscriptionWaveformBridgeController';

export type UseReadyWorkspaceWaveformBridgeControllerInput =
  ReadyWorkspaceWaveformBridgeInputParams;

/**
 * ReadyWorkspace 波形桥：入参构建与 `useTranscriptionWaveformBridgeController` 同栈，减轻页面壳行数。
 * 桥内 `documentSpanSec` / `fitSpanSec` 经 `readyWorkspaceTimelineExtents`，与 read model `timeline.extentSec` 同源。
 */
export function useReadyWorkspaceWaveformBridgeController(
  input: UseReadyWorkspaceWaveformBridgeControllerInput,
) {
  return useTranscriptionWaveformBridgeController(
    buildReadyWorkspaceWaveformBridgeControllerInput(input),
  );
}
