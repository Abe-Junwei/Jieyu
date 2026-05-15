/**
 * Shared types for send-turn stream post-completion pipeline (agent loop + vertical/finalize).
 */

import type {
  ResolveAiChatStreamCompletionParams,
  ResolveAiChatStreamCompletionResult,
} from './useAiChat.streamCompletion';
import type {
  RunAiChatSendTurnStreamPhaseInput,
  SendTurnStreamPhaseState,
} from './useAiChat.sendTurnStreamPhase.types';
import type {
  VerticalWorkflowOutputEnvelopeV0,
  VerticalWorkflowSelectionV0,
} from '../../ai/vertical/verticalWorkflowSelection';

export type SendTurnStreamCompletionSnapshot = ResolveAiChatStreamCompletionResult & {
  verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null;
  verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null;
};

export type RunSendTurnStreamPostCompletionPipelineArgs = Readonly<{
  input: RunAiChatSendTurnStreamPhaseInput;
  phaseState: SendTurnStreamPhaseState;
  streamCompletionResult: SendTurnStreamCompletionSnapshot;
  buildStreamCompletionEnv: () => Omit<
    ResolveAiChatStreamCompletionParams,
    'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
  >;
}>;

/** Mutable resolution state threaded through agent loop → vertical/finalize (composed workflow may rewrite content). */
export type SendTurnStreamPostAgentResolution = {
  content: string;
  status: 'done' | 'error';
  errorMessage?: string;
  connectionErrorMessage?: string;
};
