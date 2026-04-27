import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';

type ReadyWorkspaceStageProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps'];
type ReadyWorkspaceRecoveryBannerProps = ReadyWorkspaceStageProps['recoveryBannerProps'];

export type BuildReadyWorkspaceRecoveryBannerPropsInput = {
  shouldRender: boolean;
  recoveryAvailable: ReadyWorkspaceRecoveryBannerProps['recoveryAvailable'];
  recoveryDiffSummary: ReadyWorkspaceRecoveryBannerProps['recoveryDiffSummary'];
  onApply: ReadyWorkspaceRecoveryBannerProps['onApply'];
  onDismiss: ReadyWorkspaceRecoveryBannerProps['onDismiss'];
};

/** ARCH-7 收口：recoveryBannerProps 程序集独立模块化 | ARCH-7 closure: isolate recovery banner props assembly. */
export function buildReadyWorkspaceRecoveryBannerProps(
  input: BuildReadyWorkspaceRecoveryBannerPropsInput,
): ReadyWorkspaceRecoveryBannerProps {
  return {
    shouldRender: input.shouldRender,
    recoveryAvailable: input.recoveryAvailable,
    recoveryDiffSummary: input.recoveryDiffSummary,
    onApply: () => {
      recordTranscriptionKeyboardAction('workspaceRecoveryApply');
      input.onApply();
    },
    onDismiss: () => {
      recordTranscriptionKeyboardAction('workspaceRecoveryDismiss');
      input.onDismiss();
    },
  };
}
