/**
 * R1 试点：ToolLoopAgent 骨架（flag `aiAgentRuntimeV2Enabled` 之后接入，见迁移方案 v4.2 §3）。
 * 所有工具调用交给注入的 `runToolDecision`（生产 = resolveToolDecisionPipeline → toolWriteGate → commitToolEffects）。
 * R1 pilot: every tool call delegates to the injected `runToolDecision` (prod: the existing decision pipeline).
 *
 * shortcut: mock-provider only, upgrade when user-recorded fixtures land (scripts/record-ai-fixtures.mjs).
 */
import {
  APICallError,
  ToolLoopAgent,
  isStepCount,
  tool,
  toolSearch,
  type LanguageModel,
  type TextStreamPart,
  type ToolApprovalStatus,
  type Schema,
  type ToolSet,
} from 'ai';
import type { z } from 'zod';

export interface PilotToolSpec {
  description: string;
  inputSchema: z.ZodType | Schema;
  /** Hidden from the model until `tool_search` finds it; callable from the next step. */
  deferLoading?: boolean;
}

/** ADR-0065: tool definitions the model sees at the start of a turn, `tool_search` included. */
export const PILOT_EAGER_TOOL_LIMIT = 20;

export const PILOT_TOOL_SEARCH_NAME = 'tool_search';

const TOOL_SEARCH_INSTRUCTIONS =
  'Only some tools are listed. If none fits, call tool_search with English keywords (for example "layer", "gloss", "notes", "speaker", "corpus") and call the found tool on the next step.';

export function countEagerPilotTools(tools: Record<string, PilotToolSpec>): number {
  const specs = Object.values(tools);
  const eager = specs.filter((s) => !s.deferLoading).length;
  return specs.some((s) => s.deferLoading) ? eager + 1 : eager;
}

/** 工具决策结果（审批由 SDK toolApproval 完成，这里只有执行结果）| execution outcome */
export interface PilotToolOutcome {
  status: 'done' | 'error';
  message: string;
  requestId?: string;
  /** Not sent to the model. End the loop after this step, e.g. the tool waits for user input. */
  stopLoop?: boolean;
  /** Not sent to the model. Text shown in the chat when an approved call runs from the card. */
  userMessage?: string;
}

export interface PilotAgentOptions {
  model: LanguageModel;
  tools: Record<string, PilotToolSpec>;
  /**
   * 每个工具调用的唯一执行入口（生产 = resolveToolDecisionPipeline：策略、确认、写入门禁、审计）。
   * The only execution path for every tool call (prod: the existing decision pipeline).
   */
  runToolDecision: (
    name: string,
    input: unknown,
    toolCallId: string,
    abortSignal?: AbortSignal,
  ) => Promise<PilotToolOutcome>;
  /**
   * SDK 原生审批（toolApproval 回调）；'user-approval' 时循环停下并发出 tool-approval-request。
   * Native SDK approval; 'user-approval' stops the loop and emits tool-approval-request parts.
   */
  toolApproval?: (name: string, input: unknown) => ToolApprovalStatus | Promise<ToolApprovalStatus>;
  instructions?: string;
  maxSteps?: number;
}

/** 护栏 1：只接受 provider 实例，字符串 id 会落到 Vercel AI Gateway | provider instances only */
export function assertProviderInstance(
  model: unknown,
): asserts model is Exclude<LanguageModel, string> {
  if (typeof model === 'string') {
    throw new Error(
      'AI runtime: string model ids are forbidden (would route via the default gateway)',
    );
  }
}

/**
 * 审批用 SDK 原生 toolApproval（回调内用现有写入策略）；批准后 execute 仍走决策管线、写入门禁与审计。
 * Approval via native toolApproval; approved calls still execute through the decision pipeline.
 */
export function createPilotAgent(options: PilotAgentOptions) {
  assertProviderInstance(options.model);
  const tools: ToolSet = {};
  const stopAfter = new Set<string>();
  const eagerCount = countEagerPilotTools(options.tools);
  if (eagerCount > PILOT_EAGER_TOOL_LIMIT) {
    throw new Error(
      `AI runtime: ${eagerCount} tools visible at turn start, limit ${PILOT_EAGER_TOOL_LIMIT}`,
    );
  }
  const hasDeferred = Object.values(options.tools).some((s) => s.deferLoading);
  if (hasDeferred && PILOT_TOOL_SEARCH_NAME in options.tools) {
    throw new Error(`AI runtime: tool name ${PILOT_TOOL_SEARCH_NAME} is reserved`);
  }
  for (const [name, spec] of Object.entries(options.tools)) {
    tools[name] = tool({
      description: spec.description,
      inputSchema: spec.inputSchema,
      ...(spec.deferLoading ? { deferLoading: true } : {}),
      execute: async (input, { toolCallId, abortSignal }) => {
        const {
          stopLoop,
          userMessage: _userMessage,
          ...outcome
        } = await options.runToolDecision(name, input, toolCallId, abortSignal);
        if (stopLoop) stopAfter.add(toolCallId);
        return outcome;
      },
    });
  }
  if (hasDeferred) tools[PILOT_TOOL_SEARCH_NAME] = toolSearch();
  const instructions = hasDeferred
    ? [options.instructions, TOOL_SEARCH_INSTRUCTIONS].filter(Boolean).join('\n\n')
    : options.instructions;
  return new ToolLoopAgent({
    model: options.model,
    tools,
    // 护栏 7：重试只由上层控制 | retries are owned by the caller
    maxRetries: 0,
    stopWhen: [
      isStepCount(options.maxSteps ?? 6),
      // B2：参数不可解析即停，交给澄清，不让模型盲重试 | stop on invalid args, clarification takes over
      ({ steps }) =>
        (steps.at(-1)?.toolCalls ?? []).some((c) => (c as { invalid?: boolean }).invalid === true),
      // A tool asked for user input: do not let the model call it again in this turn.
      ({ steps }) => (steps.at(-1)?.toolResults ?? []).some((r) => stopAfter.has(r.toolCallId)),
    ],
    ...(options.toolApproval
      ? {
          toolApproval: ({ toolCall }: { toolCall: { toolName: string; input: unknown } }) =>
            hasDeferred && toolCall.toolName === PILOT_TOOL_SEARCH_NAME
              ? 'not-applicable'
              : options.toolApproval!(toolCall.toolName, toolCall.input),
        }
      : {}),
    ...(instructions ? { instructions } : {}),
  });
}

export type PilotEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-input-ui'; toolCallId: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'invalid-args'; toolCallId: string; toolName: string; raw: unknown }
  | {
      type: 'approval-request';
      approvalId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | { type: 'provider-error'; error: unknown };

/**
 * 把 fullStream 片段映射为运行时事件。
 * 护栏 3：providerExecuted 丢弃；护栏 4：tool-error / tool-result 不是 provider 故障；
 * 护栏 5：invalid 调用走 invalid-args，不默认 `{}`；护栏 8：tool-input-* 只供 UI。
 */
export function mapStreamPart(part: TextStreamPart<ToolSet>): PilotEvent | null {
  if ('providerExecuted' in part && part.providerExecuted) return null;
  switch (part.type) {
    case 'text-delta':
      return { type: 'text', text: part.text };
    case 'reasoning-delta':
      return { type: 'reasoning', text: part.text };
    case 'tool-input-start':
    case 'tool-input-delta':
      return { type: 'tool-input-ui', toolCallId: part.id };
    case 'tool-call':
      if (part.invalid)
        return {
          type: 'invalid-args',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          raw: part.input,
        };
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      };
    case 'tool-approval-request':
      if (part.isAutomatic) return null;
      return {
        type: 'approval-request',
        approvalId: part.approvalId,
        toolCallId: part.toolCall.toolCallId,
        toolName: part.toolCall.toolName,
        input: part.toolCall.input,
      };
    case 'error':
      return { type: 'provider-error', error: part.error };
    default:
      return null;
  }
}

const TOOLS_REJECTED_RE = /tool|function|工具|函数/i;

/** 护栏 6（M2）：provider 拒收 tools 的判定；APICallError 与流内 error 片段共用 | tools-rejected detection */
export function isToolsRejectedError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error ?? '');
  if (!TOOLS_REJECTED_RE.test(message)) return false;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === undefined) return true;
    return status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429;
  }
  return true; // 流内 error 片段无状态码，只看文案 | stream error parts carry no status
}

/** 本会话不再带 tools 的 provider+model 集合（R2 设置开关复用）| per-session no-tools set */
export {
  clearNoToolsThisSession,
  isNoToolsThisSession,
  markNoToolsThisSession,
  resetNoToolsThisSessionForTests,
} from './noToolsThisSession';
