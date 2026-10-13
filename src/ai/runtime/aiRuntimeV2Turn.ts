/**
 * R1：用 ToolLoopAgent 跑一个聊天回合（flag `aiAgentRuntimeV2Enabled`）。
 * 输出与旧路径相同的 AssistantStreamChunk；每个工具调用经现有决策管线（策略、确认、写入门禁、审计）。
 * Runs one chat turn on ToolLoopAgent and yields the legacy chunk shape; every tool call goes
 * through the existing decision pipeline.
 */
import type { LanguageModel, ModelMessage } from 'ai';
import { jsonSchema } from 'ai';
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AiChatSettings } from '../providers/providerCatalog';
import type { ChatMessage } from '../providers/LLMProvider';
import type { AiChatToolCall } from '../chat/chatDomain.types';
import { AI_CHAT_TOOL_NAMES_FROM_PARSER, toolArgumentSchemas } from '../chat/toolCallSchemas';
import { TOOL_STRATEGY_TABLE } from '../chat/toolCallStrategy';
import { createThinkTagStripper } from '../providers/streamUtils';
import {
  createPilotAgent,
  isToolsRejectedError,
  mapStreamPart,
  type PilotToolOutcome,
  type PilotToolSpec,
} from './toolLoopAgentPilot';
import { markNoToolsThisSession } from './noToolsThisSession';
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

const decodeEscapedLabel = (label: string) =>
  label.replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/**
 * 工具定义由现有 zod schema 派生（参数 + 描述）给模型看；SDK 边界不校验（jsonSchema 无 validate），
 * 严格校验仍在 toolDecisionPipeline，invalid_args 走澄清。
 * Tool definitions derived from the zod schemas; no validation at the SDK boundary.
 */
export function buildRuntimeV2ToolSpecs(): Record<string, PilotToolSpec> {
  const specs: Record<string, PilotToolSpec> = {};
  for (const name of AI_CHAT_TOOL_NAMES_FROM_PARSER) {
    const zodSchema = (toolArgumentSchemas as Record<string, z.ZodType | undefined>)[name];
    const label = (TOOL_STRATEGY_TABLE as Record<string, { label?: string } | undefined>)[name]
      ?.label;
    let schema: Record<string, unknown> = { type: 'object', properties: {} };
    if (zodSchema) {
      try {
        schema = z.toJSONSchema(zodSchema, { io: 'input', unrepresentable: 'any' }) as Record<
          string,
          unknown
        >;
      } catch {
        // shortcut: 不可转换的 schema 退回空对象，管线仍会严格校验 | fall back to open object
      }
    }
    // shortcut: 去掉顶层 required，可由选区/上下文补全的字段让模型可省略 | context-fill fields may be omitted
    const { required: _required, $schema: _s, ...loose } = schema;
    specs[name] = {
      description: label ? `${decodeEscapedLabel(label)} (${name})` : name,
      inputSchema: jsonSchema(loose),
    };
  }
  return specs;
}

/** B4：v2 走原生 function calling，正文里出现旧式 tool_call JSON 视为泄漏 | legacy text tool-call leak */
export const hasTextToolCallLeak = (text: string) => /"tool_call"\s*:\s*\{/.test(text);

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
  /** B2：参数无法解析时进入澄清（写 invalid_args 审计），返回给用户的澄清文案 | clarification text */
  onInvalidArgs?: (call: AiChatToolCall, raw: unknown) => Promise<string>;
  /** B4：模型在正文输出了文本 tool_call | model emitted a text tool_call */
  onTextToolCallLeak?: (text: string) => void;
  /** 待确认提示后缀：确认后不会自动继续 | appended to pending text */
  pendingHint?: string;
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
  // B1：并行调用串行化；一步内已有待确认时，其余调用直接拒绝，不进管线，避免孤儿 pending 审计
  let decisionChain: Promise<unknown> = Promise.resolve();
  const agent = createPilotAgent({
    model: p.model,
    tools: buildRuntimeV2ToolSpecs(),
    instructions: p.systemPrompt,
    runToolDecision: (name, input) => {
      const run = decisionChain.then(() => decideOne(name, input));
      decisionChain = run.catch(() => undefined);
      return run;
    },
  });

  async function decideOne(name: string, input: unknown): Promise<PilotToolOutcome> {
    if (pendingRequest) {
      return {
        status: 'error',
        message: `skipped: another action (${pendingRequest.toolName}) is awaiting user confirmation`,
      };
    }
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
  }

  const messages = await resolveStartMessages(p, now());
  let yieldedAny = false;
  // 护栏 6（M2）：未输出任何内容前遇到“拒收 tools”，记入本会话集合，由调用方改走旧路径
  const toolsRejected = (error: unknown) => {
    if (yieldedAny || !isToolsRejectedError(error)) return false;
    markNoToolsThisSession(p.providerId, p.modelId);
    return true;
  };
  // 可见正文剥离 <think> | strip <think> from visible text
  const thinkStripper = createThinkTagStripper();
  let visibleText = '';
  try {
    const result = await agent.stream({ messages, abortSignal: p.signal });
    for await (const part of result.fullStream) {
      const ev = mapStreamPart(part);
      if (!ev) continue;
      if (ev.type === 'text') {
        yieldedAny = true;
        const visible = thinkStripper.feed(ev.text);
        visibleText += visible;
        if (visible) yield { delta: visible };
      } else if (ev.type === 'invalid-args') {
        yieldedAny = true;
        const call: AiChatToolCall = { name: ev.toolName as AiChatToolCall['name'], arguments: {} };
        call.requestId = p.genRequestId(call);
        const clarify = await p.onInvalidArgs?.(call, ev.raw);
        if (clarify) yield { delta: clarify };
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
    const tail = thinkStripper.feed('', true);
    visibleText += tail;
    if (tail) yield { delta: tail };
    if (hasTextToolCallLeak(visibleText)) {
      console.warn('[aiRuntimeV2] model emitted a text tool_call; ignored (native tools only)');
      p.onTextToolCallLeak?.(visibleText);
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
      // 确认后不自动续跑，需用户再发一条消息 | the loop does not auto-continue after confirmation
      if (pendingText) yield { delta: `${pendingText}${p.pendingHint ?? ''}` };
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

export {
  clearNoToolsThisSession,
  isNoToolsThisSession,
  markNoToolsThisSession,
} from './noToolsThisSession';

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
