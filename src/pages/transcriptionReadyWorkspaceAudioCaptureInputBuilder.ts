/**
 * 音频采集 Controller 输入构建器 | Audio Capture Controller Input Builder
 *
 * 将录音、导入导出、媒体选择等音频相关的 controller 参数统一聚合为标准输入类型。
 * Aggregates recording, import/export, and media selection parameters into standard input type.
 */

import type { useReadyWorkspaceAudioCaptureController } from './useReadyWorkspaceAudioCaptureController';

type ReadyWorkspaceAudioCaptureControllerInput = Parameters<typeof useReadyWorkspaceAudioCaptureController>[0];

/**
 * 音频采集 Controller 输入类型 | Audio Capture Controller Input Type
 *
 * 允许媒体选择为三态（`string | null | undefined`），内部构建时用条件展开处理 `undefined`。
 * Allows media selection to be three-state (string | null | undefined), internal builder uses conditional spread.
 */
export type BuildReadyWorkspaceAudioCaptureControllerInput = {
  recordingInput: ReadyWorkspaceAudioCaptureControllerInput['recordingInput'];
  importExportInput: Omit<
    ReadyWorkspaceAudioCaptureControllerInput['importExportInput'],
    'selectedUnitMedia' | 'activeTimelineMediaItem'
  >;
  selectedTimelineMedia: ReadyWorkspaceAudioCaptureControllerInput['importExportInput']['selectedUnitMedia'];
  segmentScopeMediaItem?: ReadyWorkspaceAudioCaptureControllerInput['importExportInput']['activeTimelineMediaItem'];
  projectMediaInput: Omit<
    ReadyWorkspaceAudioCaptureControllerInput['projectMediaInput'],
    'selectedMediaUrl' | 'selectedTimelineMedia'
  >;
  selectedMediaUrl?: string | null | undefined;
};

/**
 * 构建音频采集 Controller 输入 | Build Audio Capture Controller Input
 *
 * 聚合录音状态、导入导出参数、媒体选择等，生成 useReadyWorkspaceAudioCaptureController 所需的标准输入格式。
 * Aggregates recording state, import/export params, and media selection into standard format for useReadyWorkspaceAudioCaptureController.
 */
export function buildReadyWorkspaceAudioCaptureControllerInput(
  input: BuildReadyWorkspaceAudioCaptureControllerInput,
): ReadyWorkspaceAudioCaptureControllerInput {
  return {
    recordingInput: input.recordingInput,
    importExportInput: {
      ...input.importExportInput,
      selectedUnitMedia: input.selectedTimelineMedia,
      activeTimelineMediaItem: input.segmentScopeMediaItem ?? input.selectedTimelineMedia,
    },
    projectMediaInput: {
      ...input.projectMediaInput,
      selectedMediaUrl: input.selectedMediaUrl ?? null,
      selectedTimelineMedia: input.selectedTimelineMedia ?? null,
    },
  };
}
