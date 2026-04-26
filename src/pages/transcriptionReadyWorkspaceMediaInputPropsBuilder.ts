import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../services/transcriptionKeyboardActionTelemetry';

type ReadyWorkspaceStageProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps'];
type ReadyWorkspaceMediaInputProps = ReadyWorkspaceStageProps['mediaInputProps'];

export type BuildReadyWorkspaceMediaInputPropsInput = {
  mediaFileInputRef: ReadyWorkspaceMediaInputProps['ref'];
  onDirectMediaImport: ReadyWorkspaceMediaInputProps['onChange'];
};

/** ARCH-7 收口：mediaInputProps 程序集独立模块化 | ARCH-7 closure: isolate media input props assembly. */
export function buildReadyWorkspaceMediaInputProps(
  input: BuildReadyWorkspaceMediaInputPropsInput,
): ReadyWorkspaceMediaInputProps {
  return {
    ref: input.mediaFileInputRef,
    onChange: (event) => {
      if (event.target.files?.length) {
        recordTranscriptionKeyboardAction('workspaceDirectMediaImportSelect');
      }
      input.onDirectMediaImport(event);
    },
  };
}
