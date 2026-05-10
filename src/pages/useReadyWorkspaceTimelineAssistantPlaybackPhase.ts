import type { MutableRefObject } from 'react';

import type { UseTranscriptionAssistantControllerInput } from './transcriptionAssistantController.types';
import { buildReadyWorkspaceAudioCaptureControllerInput } from './transcriptionReadyWorkspaceDomainInputBuilder';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';
import { useReadyWorkspaceAudioCaptureController } from './useReadyWorkspaceAudioCaptureController';
import type { UseReadyWorkspacePlaybackReadModelSetupParams } from './useReadyWorkspacePlaybackReadModelSetup';
import { useReadyWorkspacePlaybackReadModelSetup } from './useReadyWorkspacePlaybackReadModelSetup';
import type { UseReadyWorkspaceTimelineSyncSetupParams } from './useReadyWorkspaceTimelineSyncSetup';
import { useReadyWorkspaceTimelineSyncSetup } from './useReadyWorkspaceTimelineSyncSetup';

export interface UseReadyWorkspaceTimelineAssistantPlaybackPhaseParams {
  timelineSync: UseReadyWorkspaceTimelineSyncSetupParams;
  assistant: UseTranscriptionAssistantControllerInput;
  playback: Omit<
    UseReadyWorkspacePlaybackReadModelSetupParams,
    'timelineSyncController' | 'documentSpanSec'
  > & {
    documentSpanSecFromBridgeRef: MutableRefObject<number>;
  };
  audioCaptureBuild: Parameters<typeof buildReadyWorkspaceAudioCaptureControllerInput>[0];
}

/** L9：时间轴同步 + Assistant + 回放读模型 + 采集/导入导出/项目媒体 */
export function useReadyWorkspaceTimelineAssistantPlaybackPhase(
  params: UseReadyWorkspaceTimelineAssistantPlaybackPhaseParams,
) {
  const { timelineSync, assistant, playback, audioCaptureBuild } = params;
  const timelineSyncController = useReadyWorkspaceTimelineSyncSetup(timelineSync);
  const assistantController = useTranscriptionAssistantController(assistant);

  const { documentSpanSecFromBridgeRef, ...playbackRest } = playback;
  const { playbackKeyboardController, timelineReadModel } = useReadyWorkspacePlaybackReadModelSetup(
    {
      ...playbackRest,
      documentSpanSec: documentSpanSecFromBridgeRef.current,
      timelineSyncController,
    },
  );

  const audioBundle = useReadyWorkspaceAudioCaptureController(
    buildReadyWorkspaceAudioCaptureControllerInput(audioCaptureBuild),
  );
  const {
    recording,
    recordingUnitId,
    recordingError,
    recordingLayerId,
    startRecordingForUnit,
    stopRecording,
    importExportController,
    projectMediaController,
  } = audioBundle;

  return {
    timelineSyncController,
    assistantController,
    playbackKeyboardController,
    timelineReadModel,
    recording,
    recordingUnitId,
    recordingError,
    recordingLayerId,
    startRecordingForUnit,
    stopRecording,
    importExportController,
    projectMediaController,
  };
}
