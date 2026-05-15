/**
 * Post-primary-stream completion: delegates to agent-loop checkpoint slice, then vertical/finalize slice.
 */

import { runSendTurnStreamAgentLoopAfterPrimaryCompletion } from './useAiChat.sendTurnStreamPhase.completionPipelineAgentLoop';
import { runSendTurnStreamVerticalQualityAndFinalize } from './useAiChat.sendTurnStreamPhase.completionPipelineVerticalFinalize';
import type {
  RunSendTurnStreamPostCompletionPipelineArgs,
  SendTurnStreamPostAgentResolution,
} from './useAiChat.sendTurnStreamPhase.completionPipelineShared';

export type {
  RunSendTurnStreamPostCompletionPipelineArgs,
  SendTurnStreamCompletionSnapshot,
  SendTurnStreamPostAgentResolution,
} from './useAiChat.sendTurnStreamPhase.completionPipelineShared';

export async function runSendTurnStreamPostCompletionPipeline(
  args: RunSendTurnStreamPostCompletionPipelineArgs,
): Promise<void> {
  const { streamCompletionResult } = args;
  const resolution: SendTurnStreamPostAgentResolution = {
    content: streamCompletionResult.finalContent,
    status: streamCompletionResult.finalStatus,
  };
  if (streamCompletionResult.finalErrorMessage !== undefined) {
    resolution.errorMessage = streamCompletionResult.finalErrorMessage;
  }
  if (streamCompletionResult.connectionErrorMessage !== undefined) {
    resolution.connectionErrorMessage = streamCompletionResult.connectionErrorMessage;
  }

  await runSendTurnStreamAgentLoopAfterPrimaryCompletion({ ...args, resolution });
  await runSendTurnStreamVerticalQualityAndFinalize({ ...args, resolution });
}
