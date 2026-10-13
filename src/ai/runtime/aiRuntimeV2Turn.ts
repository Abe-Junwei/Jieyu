/**
 * R1：用 ToolLoopAgent 跑一个聊天回合（flag `aiAgentRuntimeV2Enabled`）。
 * 输出与旧路径相同的 AssistantStreamChunk；每个工具调用经现有决策管线（策略、确认、写入门禁、审计）。
 * Runs one chat turn on ToolLoopAgent and yields the legacy chunk shape; every tool call goes
 * through the existing decision pipeline.
 */
import type { LanguageModel, ModelMessage } from 'ai';
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AiChatSettings } from '../providers/providerCatalog';
import type { ChatMessage } from '../providers/LLMProvider';
import type { AiChatToolCall } from '../chat/chatDomain.types';
import { AI_CHAT_TOOL_NAMES_FROM_PARSER, toolArgumentSchemas } from '../chat/toolCallSchemas';
import {
  createPilotAgent,
  isToolsRejectedError,
  mapStreamPart,
  markNoToolsThisSession,
  type PilotToolOutcome,
  type PilotToolSpec,
} from './toolLoopAgentPilot';
import {
  clearPendingApproval,
  loadPendingApproval,
  savePendingApproval,
} from './aiRuntimeV2Pending';

const OPENAI_COMPATIBLE_KINDS = new Set<AiChatSettings['providerKind']>([
  'openai-compatible',
  'deepseek',
  'qwen',
  'minimax',
]);

/**
 * 从设置构造 provider 实例；不支持的 provider 返回 null（走旧路径）。
 * Builds a provider instance from settings; unsupported providers return null (legacy path).
 * shortcut: openai-compatible family only, add @ai-sdk/anthropic / google in R3.
 */
export function createAiSdkModelFromSettings(settings: AiChatSettings): LanguageModel | null {
  if (!OPENAI_COMPATIBLE_KINDS.has(settings.providerKind)) return null;
  if (!settings.baseUrl || !settings.model) return null;
  const provider = createOpenAICompatible({
    name: settings.providerKind,
    baseURL: settings.baseUrl,
    ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
    includeUsage: true,
  });
  return provider(settings.model);
}

export function buildRuntimeV2ToolSpecs(): Record<string, PilotToolSpec> {
  const schemas = toolArgumentSchemas as Record<string, z.ZodType | undefined>;
  const specs: Record<string, PilotToolSpec> = {};
  for (const name of AI_CHAT_TOOL_NAMES_FROM_PARSER) {
    specs[name] = { description: name, inputSchema: schemas[name] ?? z.object({}).loose() };
  }
  return specs;
}

export interface RuntimeV2Decision {
  finalContent: string;
  finalStatus: 'done' | 'error';
  /** 管线是否把调用交给了确认界面 | whether the pipeline handed the call to the confirm UI */
  pending: boolean;
}

export interface RunAiRuntimeV2TurnParams {
  model: LanguageModel;
  providerId: string;
  modelId: string;
  conversationId: string;
  history: ChatMessage[];
  systemPrompt: string;
  userText: string;
  signal: AbortSignal;
  genRequestId: (call: AiChatToolCall) => string;
  decide: (call: AiChatToolCall) => Promise<RuntimeV2Decision>;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  onExpired?: (requestId: string, toolName: string) => Promise<void>;
  now?: () => number;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type RuntimeV2Chunk = {
  toolsRejected?: boolean;
  delta?: string;
  reasoningContent?: string;
  done?: boolean;
  error?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

/** 跨重载恢复：上回合停在待确认时，接上它的消息并告诉模型用户的决定 | reload recovery */
async function resolveStartMessages(
  p: RunAiRuntimeV2TurnParams,
  now: number,
): Promise<ModelMessage[]> {
  const fresh: ModelMessage[] = p.history.map(
    (m) => ({ role: m.role, content: m.content }) as ModelMessage,
  );
  const loaded = loadPendingApproval(p.conversationId, now);
  if (loaded.kind === 'none') return [...fresh, { role: 'user', content: p.userText }];
  if (loaded.kind === 'expired') {
    await p.onExpired?.(loaded.state.requestId, loaded.state.toolName);
    return [...fresh, { role: 'user', content: p.userText }];
  }
  clearPendingApproval(p.conversationId);
  const executed = await p.hasPersistedExecutionForRequest(loaded.state.requestId);
  const note = `[tool ${loaded.state.toolName} requestId=${loaded.state.requestId}: ${executed ? 'confirmed and executed by the user' : 'not executed (rejected or not yet confirmed)'}]`;
  return [...loaded.state.messages, { role: 'user', content: `${note}\n${p.userText}` }];
}

export async function* runAiRuntimeV2Turn(
  p: RunAiRuntimeV2TurnParams,
): AsyncGenerator<RuntimeV2Chunk> {
  const now = p.now ?? Date.now;
  let pendingRequest: { requestId: string; toolName: string } | null = null;
  const agent = createPilotAgent({
    model: p.model,
    tools: buildRuntimeV2ToolSpecs(),
    instructions: p.systemPrompt,
    runToolDecision: async (name, input): Promise<PilotToolOutcome> => {
      const call: AiChatToolCall = {
        name: name as AiChatToolCall['name'],
        arguments: (input ?? {}) as Record<string, unknown>,
      };
      call.requestId = p.genRequestId(call);
      const decision = await p.decide(call);
      if (decision.pending) {
        pendingRequest = { requestId: call.requestId, toolName: name };
        return {
          status: 'pending_user_confirmation',
          message: decision.finalContent,
          requestId: call.requestId,
        };
      }
      return {
        status: decision.finalStatus,
        message: decision.finalContent,
        requestId: call.requestId,
      };
    },
  });

  const messages = await resolveStartMessages(p, now());
  let yieldedAny = false;
  // 护栏 6（M2）：未输出任何内容前遇到“拒收 tools”，记入本会话集合，由调用方改走旧路径
  const toolsRejected = (error: unknown) => {
    if (yieldedAny || !isToolsRejectedError(error)) return false;
    markNoToolsThisSession(p.providerId, p.modelId);
    return true;
  };
  try {
    const result = await agent.stream({ messages, abortSignal: p.signal });
    for await (const part of result.fullStream) {
      const ev = mapStreamPart(part);
      if (!ev) continue;
      if (ev.type === 'text') {
        yieldedAny = true;
        yield { delta: ev.text };
      } else if (ev.type === 'reasoning') {
        yieldedAny = true;
        yield { reasoningContent: ev.text };
      } else if (ev.type === 'provider-error') {
        yield {
          error: errorText(ev.error),
          ...(toolsRejected(ev.error) ? { toolsRejected: true } : {}),
        };
        return;
      }
    }
    const usage = await result.totalUsage;
    const pending = pendingRequest as { requestId: string; toolName: string } | null;
    if (pending) {
      const response = await result.response;
      savePendingApproval(p.conversationId, {
        requestId: pending.requestId,
        toolName: pending.toolName,
        messages: [...messages, ...response.messages],
        createdAt: now(),
      });
      const toolResults = (await result.steps).flatMap((s) => s.toolResults);
      const pendingText = (toolResults.at(-1)?.output as PilotToolOutcome | undefined)?.message;
      if (pendingText) yield { delta: pendingText };
    }
    yield {
      usage: {
        ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
        ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
        ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
      },
      done: true,
    };
  } catch (error) {
    if (p.signal.aborted) return;
    yield { error: errorText(error), ...(toolsRejected(error) ? { toolsRejected: true } : {}) };
  }
}

export { isNoToolsThisSession } from './toolLoopAgentPilot';

/** M2：v2 首个片段即“拒收 tools”时，本回合改用尚未消费的旧路径流 | fall back to the untouched legacy stream */
export async function* withLegacyFallback<T>(
  v2: AsyncGenerator<RuntimeV2Chunk>,
  legacy: AsyncGenerator<T>,
): AsyncGenerator<RuntimeV2Chunk | T> {
  for await (const chunk of v2) {
    if (chunk.toolsRejected) {
      yield* legacy;
      return;
    }
    yield chunk;
  }
  await legacy.return?.(undefined as never);
}
