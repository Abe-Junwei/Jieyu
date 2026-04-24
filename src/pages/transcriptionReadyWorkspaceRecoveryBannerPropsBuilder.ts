import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';

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
    onApply: input.onApply,
    onDismiss: input.onDismiss,
  };
}
