/**
 * v2 会话消息与工具审批请求的本地持久化（Dexie `ai_runtime_v2_turns`，24 h 过期，只存本机）。
 * 消息里带 SDK 原生 `tool-approval-request` / `tool-approval-response` 片段；未答复的请求即“待确认”。
 * Local persistence of v2 turn messages incl. native approval parts; expires after 24 h.
 *
 * shortcut: 每会话一行，整段消息覆盖写；历史变大再拆只追加表 | one row per conversation, overwrite.
 */
import type { ModelMessage, ToolApprovalResponse } from 'ai';
import {
  deleteTurn,
  fingerprintTarget,
  getTurn,
  putTurn,
  sweepExpiredTurns,
} from '../../db/aiRuntimeV2TurnStore';

export const PENDING_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export interface AiRuntimeV2TurnState {
  conversationId: string;
  /** 截至审批请求为止的完整消息（含 tool-approval-request 片段）| history incl. approval requests */
  messages: ModelMessage[];
  /** 每个审批请求：审计 requestId + 确认卡片快照（重载后重新渲染）| requestId + confirm-card snapshot */
  approvals: Record<string, ApprovalMeta>;
  createdAt: number;
  expiresAt: number;
}

/** 卡片上展示、用户批准的具体调用（N1：批准后原样执行，不再按当时选区重新解析）| resolved call shown on the card */
export interface ApprovedCallSnapshot {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ApprovalMeta {
  requestId: string;
  card?: unknown;
  executionCall?: ApprovedCallSnapshot;
  /** S1：目标 id → 指纹（updatedAt），重载恢复时比对 | target fingerprints checked on restore */
  targets?: Record<string, string>;
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

// S2：递归收集（覆盖 propose_changes 的 changes[].arguments）| recurse into nested args
function targetIdsOf(value: unknown, ids: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => targetIdsOf(v, ids));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/Id$/.test(k) && typeof v === 'string') ids.push(v);
      else if (/Ids$/.test(k) && Array.isArray(v))
        ids.push(...v.filter((x): x is string => typeof x === 'string'));
      else targetIdsOf(v, ids);
    }
  }
  return ids;
}
async function fingerprintTargets(call?: ApprovedCallSnapshot): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of targetIdsOf(call?.arguments)) {
    const fp = await fingerprintTarget(id);
    if (fp) out[id] = fp;
  }
  return out;
}

export async function saveTurnState(state: Omit<AiRuntimeV2TurnState, 'expiresAt'>): Promise<void> {
  const approvals: Record<string, ApprovalMeta> = {};
  for (const [id, meta] of Object.entries(state.approvals)) {
    approvals[id] = meta.executionCall
      ? { ...meta, targets: await fingerprintTargets(meta.executionCall) }
      : meta;
  }
  await putTurn({ ...state, approvals, expiresAt: state.createdAt + PENDING_APPROVAL_TTL_MS });
}

export async function clearTurnState(conversationId: string): Promise<void> {
  await deleteTurn(conversationId);
}

export type LoadedTurnState =
  | { kind: 'none' }
  | { kind: 'expired'; state: AiRuntimeV2TurnState }
  | { kind: 'active'; state: AiRuntimeV2TurnState };

/** 读取；过期或损坏的行被删除 | load; expired or corrupt rows are removed */
export async function loadTurnState(conversationId: string, now: number): Promise<LoadedTurnState> {
  const state = await getTurn<AiRuntimeV2TurnState>(conversationId);
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
  item: UnansweredApproval & { requestId: string; executionCall?: ApprovedCallSnapshot },
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
  /** S1：目标已变，审批按过期关闭 | target changed, approval expired */
  stale?: true;
}

// S3：重载后可恢复的工具（指纹覆盖完整）；其余一律过期。merge_prev/next 不含邻居指纹，不在内 |
// tools whose fingerprints fully cover their targets; everything else expires after a reload
const RESTORE_SAFE_TOOLS = new Set([
  'create_transcription_segment',
  'split_transcription_segment',
  'merge_transcription_segments',
  'delete_transcription_segment',
  'clear_translation_segment',
  'set_transcription_text',
  'set_translation_text',
  'delete_layer',
  'set_token_pos',
  'set_token_gloss',
  'propose_changes',
]);
function restoreSafe(call: ApprovedCallSnapshot): boolean {
  if (!RESTORE_SAFE_TOOLS.has(call.name)) return false;
  if (call.name !== 'propose_changes') return true;
  const changes = (call.arguments as { changes?: unknown }).changes;
  return (
    Array.isArray(changes) &&
    changes.every((c: { tool?: unknown; name?: unknown }) => {
      const n = String(c?.tool ?? c?.name ?? '').trim();
      return n !== 'propose_changes' && RESTORE_SAFE_TOOLS.has(n);
    })
  );
}

async function targetsChanged(meta: ApprovalMeta, failClosed = false): Promise<boolean> {
  if (failClosed && meta.executionCall && !restoreSafe(meta.executionCall)) return true;
  // S2：重载后写工具没有可核对的目标 → 安全优先按过期（同页仍由 epoch 保护）| fail closed after reload
  if (failClosed && meta.executionCall && Object.keys(meta.targets ?? {}).length === 0) return true;
  for (const [id, fp] of Object.entries(meta.targets ?? {})) {
    if ((await fingerprintTarget(id)) !== fp) return true;
  }
  return false;
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
  if (approved && (await targetsChanged(meta))) {
    // S1：批准那一刻再核对一次目标指纹 | re-check fingerprints at approval time
    const reason = 'target changed since the approval was requested';
    let closed = withApprovalResponse(loaded.state.messages, approvalId, false, reason);
    closed = withToolResult(closed, item, { denied: reason });
    await putTurn({ ...loaded.state, messages: closed });
    const after = unansweredApprovals(closed)[0];
    return {
      stale: true,
      ...(after ? { nextCard: loaded.state.approvals[after.approvalId]?.card } : {}),
    };
  }
  let messages = withApprovalResponse(loaded.state.messages, approvalId, approved);
  let outcome: ToolOutcomeLike | undefined;
  const executor = executors.get(conversationId);
  if (approved && (outcomeOverride || executor)) {
    outcome =
      outcomeOverride ??
      (await executor!({
        ...item,
        requestId: meta.requestId,
        ...(meta.executionCall ? { executionCall: meta.executionCall } : {}),
      }));
    messages = withToolResult(messages, item, outcome);
  } else if (!approved) {
    messages = withToolResult(messages, item, { denied: 'rejected by the user' });
  }
  await putTurn({ ...loaded.state, messages });
  const next = unansweredApprovals(messages)[0];
  return {
    ...(outcome ? { outcome } : {}),
    ...(next ? { nextCard: loaded.state.approvals[next.approvalId]?.card } : {}),
  };
}

/**
 * S2：只核对不执行；目标已变则按过期关闭（供 propose_changes 批处理执行前调用）。
 * check-only: close as expired when targets changed (used before the propose_changes batch).
 */
export async function expireApprovalIfStale(
  conversationId: string,
  approvalId: string,
  now: number,
): Promise<boolean> {
  const loaded = await loadTurnState(conversationId, now);
  if (loaded.kind !== 'active') return false;
  const item = unansweredApprovals(loaded.state.messages).find((a) => a.approvalId === approvalId);
  const meta = loaded.state.approvals[approvalId];
  if (!item || !meta || !(await targetsChanged(meta))) return false;
  const reason = 'target changed since the approval was requested';
  let messages = withApprovalResponse(loaded.state.messages, approvalId, false, reason);
  messages = withToolResult(messages, item, { denied: reason });
  await putTurn({ ...loaded.state, messages });
  return true;
}

/** N3：打开 AI 面板时清理过期行 | sweep expired rows when the AI panel opens */
export async function sweepExpiredTurnStates(now: number): Promise<void> {
  await sweepExpiredTurns(now);
}

export type RestoredApproval =
  | { kind: 'card'; card: unknown }
  | { kind: 'stale'; requestId: string; toolName: string; card: unknown };

/**
 * S1：重载后恢复第一张未答复卡片前，按库核对目标指纹；目标消失或已变则按拒绝关闭该审批。
 * S1: on restore, verify target fingerprints; a missing/changed target expires the approval.
 */
export async function restoreFirstUnanswered(
  conversationId: string,
  now: number,
): Promise<RestoredApproval | undefined> {
  const loaded = await loadTurnState(conversationId, now);
  if (loaded.kind !== 'active') return undefined;
  const next = unansweredApprovals(loaded.state.messages)[0];
  const meta = next ? loaded.state.approvals[next.approvalId] : undefined;
  if (!next || !meta) return undefined;
  if (await targetsChanged(meta, true)) {
    const reason = 'target changed since the approval was requested';
    let messages = withApprovalResponse(loaded.state.messages, next.approvalId, false, reason);
    messages = withToolResult(messages, next, { denied: reason });
    await putTurn({ ...loaded.state, messages });
    return { kind: 'stale', requestId: meta.requestId, toolName: next.toolName, card: meta.card };
  }
  return { kind: 'card', card: meta.card };
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
