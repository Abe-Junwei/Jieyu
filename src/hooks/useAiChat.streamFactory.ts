import { resolveCommand } from '../services/CommandResolver';
import type { ChatMessage, ChatTokenUsage } from '../ai/providers/LLMProvider';

export type AssistantStreamChunk = {
  delta?: string;
  done?: boolean;
  error?: string;
  reasoningContent?: string;
  thinking?: boolean;
  usage?: ChatTokenUsage;
};

interface ToolCallLike {
  name: string;
  arguments: Record<string, unknown>;
}

interface OrchestratorLike {
  sendMessage(input: {
    history: ChatMessage[];
    userText: string;
    systemPrompt: string;
    options: { signal: AbortSignal; model?: string };
  }): {
    stream: AsyncGenerator<AssistantStreamChunk>;
  };
}

interface CreateAssistantStreamParams {
  userText: string;
  clarifyFastPathCall: ToolCallLike | null;
  history: ChatMessage[];
  orchestrator: OrchestratorLike;
  systemPrompt: string;
  signal: AbortSignal;
  taskSessionStatus: 'idle' | 'waiting_clarify' | 'waiting_confirm' | 'executing' | 'explaining';
  model: string;
  explainModel?: string;
}

export interface CreateAssistantStreamResult {
  stream: AsyncGenerator<AssistantStreamChunk>;
  generationSource: 'local' | 'llm';
  generationModel: string;
}

function createSyntheticToolCallStream(call: ToolCallLike): AsyncGenerator<AssistantStreamChunk> {
  const syntheticJson = JSON.stringify({ tool_call: { name: call.name, arguments: call.arguments } });
  return (async function* syntheticStream() {
    yield { delta: syntheticJson };
    yield { delta: '', done: true };
  })();
}

export function createAssistantStream(params: CreateAssistantStreamParams): CreateAssistantStreamResult {
  const {
    userText,
    clarifyFastPathCall,
    history,
    orchestrator,
    systemPrompt,
    signal,
    taskSessionStatus,
    model,
    explainModel,
  } = params;

  const localResolve = clarifyFastPathCall ? null : resolveCommand(userText);

  if (clarifyFastPathCall) {
    return {
      stream: createSyntheticToolCallStream(clarifyFastPathCall),
      generationSource: 'local',
      generationModel: '',
    };
  }

  if (localResolve) {
    return {
      stream: createSyntheticToolCallStream(localResolve.call),
      generationSource: 'local',
      generationModel: '',
    };
  }

  const effectiveModel = taskSessionStatus === 'explaining' && explainModel
    ? explainModel
    : model;
  const generationModel = (effectiveModel ?? '').trim();
  const { stream } = orchestrator.sendMessage({
    history,
    userText,
    systemPrompt,
    options: { signal, model: effectiveModel },
  });

  return {
    stream,
    generationSource: 'llm',
    generationModel,
  };
}
