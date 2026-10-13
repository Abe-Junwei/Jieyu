/**
 * v2 会话消息与工具审批请求的本地持久化（Dexie `ai_runtime_v2_turns`，24 h 过期，只存本机）。
 * 消息里带 SDK 原生 `tool-approval-request` / `tool-approval-response` 片段；未答复的请求即“待确认”。
 * Local persistence of v2 turn messages incl. native approval parts; expires after 24 h.
 *
 * shortcut: 每会话一行，整段消息覆盖写；历史变大再拆只追加表 | one row per conversation, overwrite.
 */
import type { ModelMessage, ToolApprovalResponse } from 'ai';
import { db } from '../../db';

export const PENDING_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const TABLE = 'ai_runtime_v2_turns';

export interface AiRuntimeV2TurnState {
  conversationId: string;
  /** 截至审批请求为止的完整消息（含 tool-approval-request 片段）| history incl. approval requests */
  messages: ModelMessage[];
  /** 每个审批请求：审计 requestId + 确认卡片快照（重载后重新渲染）| requestId + confirm-card snapshot */
  approvals: Record<string, ApprovalMeta>;
  createdAt: number;
  expiresAt: number;
}

export interface ApprovalMeta {
  requestId: string;
  card?: unknown;
}

export interface ToolOutcomeLike {
  status: 'done' | 'error';
  message: string;
}

export interface UnansweredApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}

const table = () => db.table<AiRuntimeV2TurnState, string>(TABLE);

export async function saveTurnState(state: Omit<AiRuntimeV2TurnState, 'expiresAt'>): Promise<void> {
  await table().put({ ...state, expiresAt: state.createdAt + PENDING_APPROVAL_TTL_MS });
}

export async function clearTurnState(conversationId: string): Promise<void> {
  await table().delete(conversationId);
}

export type LoadedTurnState =
  | { kind: 'none' }
  | { kind: 'expired'; state: AiRuntimeV2TurnState }
  | { kind: 'active'; state: AiRuntimeV2TurnState };

/** 读取；过期或损坏的行被删除 | load; expired or corrupt rows are removed */
export async function loadTurnState(conversationId: string, now: number): Promise<LoadedTurnState> {
  const state = await table().get(conversationId);
  if (!state) return { kind: 'none' };
  if (!Array.isArray(state.messages)) {
    await clearTurnState(conversationId);
    return { kind: 'none' };
  }
  if (now >= state.expiresAt) {
    await clearTurnState(conversationId);
    return { kind: 'expired', state };
  }
  return { kind: 'active', state };
}

/** 消息里还没有答复的审批请求 | approval requests without a response */
export function unansweredApprovals(messages: ModelMessage[]): UnansweredApproval[] {
  const calls = new Map<string, { toolName: string; input: unknown }>();
  const requests: Array<{ approvalId: string; toolCallId: string }> = [];
  const answered = new Set<string>();
  for (const m of messages) {
    if (typeof m.content === 'string') continue;
    for (const part of m.content as Array<Record<string, unknown>>) {
      if (part.type === 'tool-call') {
        calls.set(String(part.toolCallId), { toolName: String(part.toolName), input: part.input });
      } else if (part.type === 'tool-approval-request') {
        requests.push({ approvalId: String(part.approvalId), toolCallId: String(part.toolCallId) });
      } else if (part.type === 'tool-approval-response') {
        answered.add(String(part.approvalId));
      }
    }
  }
  return requests
    .filter((r) => !answered.has(r.approvalId))
    .map((r) => ({
      ...r,
      toolName: calls.get(r.toolCallId)?.toolName ?? '',
      input: calls.get(r.toolCallId)?.input,
    }));
}

/** 追加原生 tool-approval-response；返回剩余未答复数 | append a native approval response */
export function withApprovalResponse(
  messages: ModelMessage[],
  approvalId: string,
  approved: boolean,
  reason?: string,
): ModelMessage[] {
  const response: ToolApprovalResponse = {
    type: 'tool-approval-response',
    approvalId,
    approved,
    ...(reason ? { reason } : {}),
  };
  const last = messages.at(-1);
  if (last?.role === 'tool') {
    return [...messages.slice(0, -1), { ...last, content: [...last.content, response] }];
  }
  return [...messages, { role: 'tool', content: [response] }];
}

/** 给 tool 消息追加 tool-result（批准执行结果或 execution-denied）| append a tool-result part */
export function withToolResult(
  messages: ModelMessage[],
  item: { toolCallId: string; toolName: string },
  outcome: ToolOutcomeLike | { denied: string },
): ModelMessage[] {
  const output =
    'denied' in outcome
      ? { type: 'execution-denied' as const, reason: outcome.denied }
      : { type: 'json' as const, value: { status: outcome.status, message: outcome.message } };
  const part = {
    type: 'tool-result' as const,
    toolCallId: item.toolCallId,
    toolName: item.toolName,
    output,
  };
  const last = messages.at(-1);
  if (last?.role === 'tool') {
    return [...messages.slice(0, -1), { ...last, content: [...last.content, part] }];
  }
  return [...messages, { role: 'tool', content: [part] }];
}

/** 本页内由 v2 回合注册的执行器：批准即经决策管线执行 | executor registered by the live v2 turn */
export type ApprovalExecutor = (
  item: UnansweredApproval & { requestId: string },
) => Promise<ToolOutcomeLike>;
const executors = new Map<string, ApprovalExecutor>();
export function registerApprovalExecutor(conversationId: string, fn: ApprovalExecutor): void {
  executors.set(conversationId, fn);
}

export interface ApprovalResolution {
  /** 已立即执行时的结果文案 | outcome text when executed right away */
  outcome?: ToolOutcomeLike;
  /** 下一个待确认卡片快照 | next confirm card */
  nextCard?: unknown;
}

/**
 * 确认卡片的确认/取消：写入原生 tool-approval-response；有执行器则立即经管线执行并补 tool-result，
 * 否则（如重载后）留到下一回合开头执行。| record the decision; execute now if the live turn registered an executor.
 */
export async function resolveApproval(
  conversationId: string,
  approvalId: string,
  approved: boolean,
  now: number,
  /** 已由其他路径执行（如 propose_changes 批处理）时直接记录结果 | outcome already produced elsewhere */
  outcomeOverride?: ToolOutcomeLike,
): Promise<ApprovalResolution | null> {
  const loaded = await loadTurnState(conversationId, now);
  if (loaded.kind !== 'active') return null;
  const item = unansweredApprovals(loaded.state.messages).find((a) => a.approvalId === approvalId);
  const meta = loaded.state.approvals[approvalId];
  if (!item || !meta) return null;
  let messages = withApprovalResponse(loaded.state.messages, approvalId, approved);
  let outcome: ToolOutcomeLike | undefined;
  const executor = executors.get(conversationId);
  if (approved && (outcomeOverride || executor)) {
    outcome = outcomeOverride ?? (await executor!({ ...item, requestId: meta.requestId }));
    messages = withToolResult(messages, item, outcome);
  } else if (!approved) {
    messages = withToolResult(messages, item, { denied: 'rejected by the user' });
  }
  await table().put({ ...loaded.state, messages });
  const next = unansweredApprovals(messages)[0];
  return {
    ...(outcome ? { outcome } : {}),
    ...(next ? { nextCard: loaded.state.approvals[next.approvalId]?.card } : {}),
  };
}

/** 重载后：第一个未答复审批的卡片 | first unanswered card after reload */
export async function firstUnansweredCard(conversationId: string, now: number): Promise<unknown> {
  const loaded = await loadTurnState(conversationId, now);
  if (loaded.kind !== 'active') return undefined;
  const next = unansweredApprovals(loaded.state.messages)[0];
  return next ? loaded.state.approvals[next.approvalId]?.card : undefined;
}

/** 已批准但还没有 tool-result 的调用（重载后批准的）| approved calls still lacking a result */
export function approvedWithoutResult(
  messages: ModelMessage[],
): Array<{ approvalId: string; toolCallId: string; toolName: string; input: unknown }> {
  const calls = new Map<string, { toolName: string; input: unknown }>();
  const reqs = new Map<string, string>();
  const approved: string[] = [];
  const results = new Set<string>();
  for (const m of messages) {
    if (typeof m.content === 'string') continue;
    for (const part of m.content as Array<Record<string, unknown>>) {
      if (part.type === 'tool-call')
        calls.set(String(part.toolCallId), { toolName: String(part.toolName), input: part.input });
      else if (part.type === 'tool-approval-request')
        reqs.set(String(part.approvalId), String(part.toolCallId));
      else if (part.type === 'tool-approval-response' && part.approved === true)
        approved.push(String(part.approvalId));
      else if (part.type === 'tool-result') results.add(String(part.toolCallId));
    }
  }
  return approved
    .map((approvalId) => ({ approvalId, toolCallId: reqs.get(approvalId) ?? '' }))
    .filter((a) => a.toolCallId && !results.has(a.toolCallId))
    .map((a) => ({
      ...a,
      toolName: calls.get(a.toolCallId)?.toolName ?? '',
      input: calls.get(a.toolCallId)?.input,
    }));
}
