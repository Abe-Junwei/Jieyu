import type { UseTranscriptionRuntimePropsInput } from './useTranscriptionRuntimeProps';
import { buildAssistantRuntimeVoiceAnalysisFireAndForgetHandler } from './readyWorkspaceViewModelsTailFireAndForgetHandlers';

export type ReadyWorkspaceAssistantSidebarRuntimePropsInputDeps = Omit<
  UseTranscriptionRuntimePropsInput,
  'handleVoiceAnalysisResult'
> & {
  /** Unwrapped handler; wrapped with fire-and-forget for runtime props. */
  voiceAnalysisResultHandler: UseTranscriptionRuntimePropsInput['handleVoiceAnalysisResult'];
};

export function buildReadyWorkspaceAssistantSidebarRuntimePropsInput(
  deps: ReadyWorkspaceAssistantSidebarRuntimePropsInputDeps,
): UseTranscriptionRuntimePropsInput {
  const { voiceAnalysisResultHandler, ...rest } = deps;
  return {
    ...rest,
    handleVoiceAnalysisResult: buildAssistantRuntimeVoiceAnalysisFireAndForgetHandler({
      handleVoiceAnalysisResult: voiceAnalysisResultHandler,
    }),
  };
}
