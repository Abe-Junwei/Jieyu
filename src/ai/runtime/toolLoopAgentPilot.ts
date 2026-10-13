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
}

/** 工具决策结果（审批由 SDK toolApproval 完成，这里只有执行结果）| execution outcome */
export interface PilotToolOutcome {
  status: 'done' | 'error';
  message: string;
  requestId?: string;
}

export interface PilotAgentOptions {
  model: LanguageModel;
  tools: Record<string, PilotToolSpec>;
  /**
   * 每个工具调用的唯一执行入口（生产 = resolveToolDecisionPipeline：策略、确认、写入门禁、审计）。
   * The only execution path for every tool call (prod: the existing decision pipeline).
   */
  runToolDecision: (name: string, input: unknown, toolCallId: string) => Promise<PilotToolOutcome>;
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
  for (const [name, spec] of Object.entries(options.tools)) {
    tools[name] = tool({
      description: spec.description,
      inputSchema: spec.inputSchema,
      execute: (input, { toolCallId }) => options.runToolDecision(name, input, toolCallId),
    });
  }
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
    ],
    ...(options.toolApproval
      ? {
          toolApproval: ({ toolCall }: { toolCall: { toolName: string; input: unknown } }) =>
            options.toolApproval!(toolCall.toolName, toolCall.input),
        }
      : {}),
    ...(options.instructions ? { instructions: options.instructions } : {}),
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
