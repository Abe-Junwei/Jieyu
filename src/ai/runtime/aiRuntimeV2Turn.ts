/**
 * R1：用 ToolLoopAgent 跑一个聊天回合（flag `aiAgentRuntimeV2Enabled`）。
 * 输出与旧路径相同的 AssistantStreamChunk；每个工具调用经现有决策管线（策略、确认、写入门禁、审计）。
 * Runs one chat turn on ToolLoopAgent and yields the legacy chunk shape; every tool call goes
 * through the existing decision pipeline.
 */
import type { LanguageModel, ModelMessage, ToolApprovalStatus } from 'ai';
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
  approvedWithoutResult,
  clearTurnState,
  loadTurnState,
  registerApprovalExecutor,
  saveTurnState,
  unansweredApprovals,
  withApprovalResponse,
  withToolResult,
  type ApprovalMeta,
} from './aiRuntimeV2Pending';
import { getAiToolPolicy } from '../policy/aiToolPolicyMatrix';
import type { AiChatToolName } from '../chat/aiChatToolName.types';

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
  /** 管线是否仍把调用交给了确认界面 | whether the pipeline still handed the call to the confirm UI */
  pending: boolean;
}

/** 审批请求的管线结果：pending=已出确认卡片；card=卡片快照（存 Dexie，重载后重渲染）| request outcome */
export interface RuntimeV2ApprovalRequestOutcome {
  pending: boolean;
  text: string;
  card?: unknown;
}

/**
 * toolApproval 回调：用现有写入策略。读工具 not-applicable；写/破坏性工具一律 user-approval（护栏：写工具不得 not-applicable）。
 * Approval policy: reads are not-applicable; every write/destructive tool needs user approval.
 */
export function runtimeV2ToolApproval(name: string): ToolApprovalStatus {
  if (!(AI_CHAT_TOOL_NAMES_FROM_PARSER as readonly string[]).includes(name)) return 'denied';
  const policy = getAiToolPolicy(name as AiChatToolName) as
    | ReturnType<typeof getAiToolPolicy>
    | undefined;
  if (policy?.effect === 'read') return 'not-applicable';
  return {
    type: 'user-approval',
    reason: policy?.effect === 'destructive' ? 'destructive' : 'write_gate_preview_required',
  };
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
  /** 执行：auto=无需审批的工具；approved=用户已批准（管线跳过确认分支，仍过写入门禁与审计）| execute */
  decide: (call: AiChatToolCall, mode: 'auto' | 'approved') => Promise<RuntimeV2Decision>;
  /** 每个 tool-approval-request：经管线出确认卡片并写 pending 审计 | per approval request */
  requestApproval: (
    call: AiChatToolCall,
    approvalId: string,
  ) => Promise<RuntimeV2ApprovalRequestOutcome>;
  /** 审批过期 / 未答复即被下一条消息放弃 | approval expired or abandoned by the next message */
  onApprovalClosed?: (
    requestId: string,
    toolName: string,
    reason: 'expired' | 'unanswered',
  ) => Promise<void>;
  /** B2：参数无法解析时进入澄清（写 invalid_args 审计），返回给用户的澄清文案 | clarification text */
  onInvalidArgs?: (call: AiChatToolCall, raw: unknown) => Promise<string>;
  /** B4：模型在正文输出了文本 tool_call | model emitted a text tool_call */
  onTextToolCallLeak?: (text: string) => void;
  /** 待确认提示后缀：确认后不会自动继续 | appended to pending text */
  pendingHint?: string;
  approvalFor?: (name: string) => ToolApprovalStatus;
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

const toCall = (name: string, input: unknown, requestId: string): AiChatToolCall => ({
  name: name as AiChatToolCall['name'],
  arguments: (input ?? {}) as Record<string, unknown>,
  requestId,
});

/**
 * 跨回合/重载续跑：读 Dexie 中上回合的消息；未答复的审批按拒绝补 response（新消息即放弃），
 * 已批准未执行的经管线执行并补 tool-result（与 SDK collectToolApprovals 同语义；用户新消息须排在 tool 消息之后）。
 * Resume: unanswered approvals are denied, approved-but-unexecuted ones run through the pipeline.
 */
async function resolveStartMessages(
  p: RunAiRuntimeV2TurnParams,
  now: number,
  execute: (item: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    requestId: string;
  }) => Promise<PilotToolOutcome>,
): Promise<ModelMessage[]> {
  const fresh: ModelMessage[] = p.history.map(
    (m) => ({ role: m.role, content: m.content }) as ModelMessage,
  );
  const loaded = await loadTurnState(p.conversationId, now);
  if (loaded.kind === 'none') return [...fresh, { role: 'user', content: p.userText }];
  if (loaded.kind === 'expired') {
    for (const a of unansweredApprovals(loaded.state.messages)) {
      await p.onApprovalClosed?.(
        loaded.state.approvals[a.approvalId]?.requestId ?? '',
        a.toolName,
        'expired',
      );
    }
    return [...fresh, { role: 'user', content: p.userText }];
  }
  await clearTurnState(p.conversationId);
  let messages = loaded.state.messages;
  for (const a of unansweredApprovals(messages)) {
    await p.onApprovalClosed?.(
      loaded.state.approvals[a.approvalId]?.requestId ?? '',
      a.toolName,
      'unanswered',
    );
    messages = withApprovalResponse(
      messages,
      a.approvalId,
      false,
      'no decision before the next message',
    );
    messages = withToolResult(messages, a, { denied: 'no decision before the next message' });
  }
  for (const a of approvedWithoutResult(messages)) {
    const requestId =
      loaded.state.approvals[a.approvalId]?.requestId ??
      p.genRequestId(toCall(a.toolName, a.input, ''));
    messages = withToolResult(messages, a, await execute({ ...a, requestId }));
  }
  return [...messages, { role: 'user', content: p.userText }];
}

export async function* runAiRuntimeV2Turn(
  p: RunAiRuntimeV2TurnParams,
): AsyncGenerator<RuntimeV2Chunk> {
  const now = p.now ?? Date.now;
  const approvalFor = p.approvalFor ?? runtimeV2ToolApproval;
  // 审批请求的 requestId 跨回合保持（审计配对）| keep the request's requestId across turns
  const requestIdByToolCallId = new Map<string, string>();

  const executeCall = async (
    call: AiChatToolCall,
    mode: 'auto' | 'approved',
  ): Promise<PilotToolOutcome> => {
    const decision = await p.decide(call, mode);
    if (decision.pending) {
      // 审批已由 SDK 完成；管线若仍要确认，按失败返回，不留第二张卡 | never a second confirmation
      return { status: 'error', message: decision.finalContent, requestId: call.requestId ?? '' };
    }
    return {
      status: decision.finalStatus,
      message: decision.finalContent,
      requestId: call.requestId ?? '',
    };
  };

  const agent = createPilotAgent({
    model: p.model,
    tools: buildRuntimeV2ToolSpecs(),
    instructions: p.systemPrompt,
    toolApproval: (name) => approvalFor(name),
    runToolDecision: (name, input, toolCallId) => {
      const requestId =
        requestIdByToolCallId.get(toolCallId) ?? p.genRequestId(toCall(name, input, ''));
      // SDK 只在批准后才执行写工具 | the SDK only executes write tools after approval
      const mode = approvalFor(name) === 'not-applicable' ? 'auto' : 'approved';
      return executeCall(toCall(name, input, requestId), mode);
    },
  });

  // 本页内确认卡片批准即执行（重载后则留到下一回合开头）| live executor for the confirm card
  registerApprovalExecutor(p.conversationId, (item) =>
    executeCall(toCall(item.toolName, item.input, item.requestId), 'approved'),
  );

  const messages = await resolveStartMessages(p, now(), (item) =>
    executeCall(toCall(item.toolName, item.input, item.requestId), 'approved'),
  );
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
  const approvalRequests: Array<{
    approvalId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
  }> = [];
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
      } else if (ev.type === 'approval-request') {
        yieldedAny = true;
        approvalRequests.push(ev);
      } else if (ev.type === 'invalid-args') {
        yieldedAny = true;
        const call = toCall(ev.toolName, {}, '');
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
    if (approvalRequests.length > 0) {
      // 每个审批请求各自经管线出卡片 + pending 审计；管线拒绝的（澄清/拦截）直接按拒绝补 response
      const response = await result.response;
      let saved: ModelMessage[] = [...messages, ...response.messages];
      const approvals: Record<string, ApprovalMeta> = {};
      const texts: string[] = [];
      for (const req of approvalRequests) {
        const call = toCall(req.toolName, req.input, '');
        call.requestId = p.genRequestId(call);
        const outcome = await p.requestApproval(call, req.approvalId);
        texts.push(outcome.text);
        if (outcome.pending) {
          approvals[req.approvalId] = {
            requestId: call.requestId,
            ...(outcome.card !== undefined ? { card: outcome.card } : {}),
          };
        } else {
          saved = withApprovalResponse(saved, req.approvalId, false, outcome.text);
          saved = withToolResult(saved, req, { denied: outcome.text });
        }
      }
      if (Object.keys(approvals).length > 0) {
        await saveTurnState({
          conversationId: p.conversationId,
          messages: saved,
          approvals,
          createdAt: now(),
        });
        // 确认后不自动续跑，需用户再发一条消息 | the loop does not auto-continue after confirmation
        yield { delta: `${texts.join('\n')}${p.pendingHint ?? ''}` };
      } else if (texts.length > 0) {
        yield { delta: texts.join('\n') };
      }
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
