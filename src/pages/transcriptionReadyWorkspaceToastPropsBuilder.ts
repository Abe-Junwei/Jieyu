import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';

type ReadyWorkspaceToastProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps']['toastProps'];

export type BuildReadyWorkspaceToastPropsInput = {
  assistantFrame: Pick<ReadyWorkspaceToastProps, 'saveState' | 'recording' | 'recordingUnitId' | 'recordingError' | 'tf'>
    & Partial<Pick<ReadyWorkspaceToastProps, 'overlapCycleToast' | 'lockConflictToast'>>;
};

export function buildReadyWorkspaceToastProps(
  input: BuildReadyWorkspaceToastPropsInput,
): ReadyWorkspaceToastProps {
  return {
    mode: 'core-only',
    voiceAgent: {
      agentState: 'idle',
      mode: 'command',
      listening: false,
      isRecording: false,
    },
    saveState: input.assistantFrame.saveState,
    recording: input.assistantFrame.recording,
    recordingUnitId: input.assistantFrame.recordingUnitId,
    recordingError: input.assistantFrame.recordingError,
    ...(input.assistantFrame.overlapCycleToast !== undefined ? { overlapCycleToast: input.assistantFrame.overlapCycleToast } : {}),
    ...(input.assistantFrame.lockConflictToast !== undefined ? { lockConflictToast: input.assistantFrame.lockConflictToast } : {}),
    tf: input.assistantFrame.tf,
  };
}
