import { useImportExport } from '../hooks/useImportExport';
import { useRecording } from '../hooks/useRecording';
import { useTranscriptionImportExportInput } from './useTranscriptionImportExportInput';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';
import { useTranscriptionProjectMediaControllerInput } from './useTranscriptionProjectMediaControllerInput';

type UseRecordingInput = Parameters<typeof useRecording>[0];
type UseImportExportInput = Parameters<typeof useTranscriptionImportExportInput>[0];
type UseProjectMediaInput = Parameters<typeof useTranscriptionProjectMediaControllerInput>[0];

interface UseReadyWorkspaceAudioCaptureControllerInput {
  recordingInput: UseRecordingInput;
  importExportInput: UseImportExportInput;
  projectMediaInput: UseProjectMediaInput;
}

/**
 * 音频采集与媒体导入导出控制器聚合。
 * Aggregate audio capture and media import/export controllers.
 */
export function useReadyWorkspaceAudioCaptureController(
  input: UseReadyWorkspaceAudioCaptureControllerInput,
) {
  const recordingController = useRecording(input.recordingInput);
  const importExportController = useImportExport(
    useTranscriptionImportExportInput(input.importExportInput),
  );
  const projectMediaController = useTranscriptionProjectMediaController({
    ...useTranscriptionProjectMediaControllerInput(input.projectMediaInput),
  });

  return {
    ...recordingController,
    importExportController,
    projectMediaController,
  };
}
