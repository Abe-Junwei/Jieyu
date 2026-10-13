/**
 * R1：待确认工具调用的本地续跑状态（24 h 过期视为拒绝，只存本机，不跨设备）。
 * Local continuation state for a tool call awaiting user confirmation; expires after 24 h.
 *
 * shortcut: localStorage per conversation, upgrade to a Dexie table if histories outgrow ~1 MB.
 */
import type { ModelMessage } from 'ai';

export const PENDING_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'jieyu.aiRuntimeV2.pending.';

export interface AiRuntimeV2PendingState {
  version: 1;
  requestId: string;
  toolName: string;
  /** 截至 pending 工具结果为止的完整消息（每个 tool-call 都已配对 tool-result）| paired history */
  messages: ModelMessage[];
  createdAt: number;
  expiresAt: number;
}

export function savePendingApproval(
  conversationId: string,
  state: Omit<AiRuntimeV2PendingState, 'version' | 'expiresAt'>,
): void {
  const full: AiRuntimeV2PendingState = {
    version: 1,
    ...state,
    expiresAt: state.createdAt + PENDING_APPROVAL_TTL_MS,
  };
  localStorage.setItem(KEY_PREFIX + conversationId, JSON.stringify(full));
}

export function clearPendingApproval(conversationId: string): void {
  localStorage.removeItem(KEY_PREFIX + conversationId);
}

export type LoadedPendingApproval =
  | { kind: 'none' }
  | { kind: 'expired'; state: AiRuntimeV2PendingState }
  | { kind: 'active'; state: AiRuntimeV2PendingState };

/** 读取并清掉过期或损坏的记录 | load; expired or corrupt entries are removed */
export function loadPendingApproval(conversationId: string, now: number): LoadedPendingApproval {
  const raw = localStorage.getItem(KEY_PREFIX + conversationId);
  if (!raw) return { kind: 'none' };
  let state: AiRuntimeV2PendingState;
  try {
    state = JSON.parse(raw) as AiRuntimeV2PendingState;
  } catch {
    clearPendingApproval(conversationId);
    return { kind: 'none' };
  }
  if (state.version !== 1 || !Array.isArray(state.messages)) {
    clearPendingApproval(conversationId);
    return { kind: 'none' };
  }
  if (now >= state.expiresAt) {
    clearPendingApproval(conversationId);
    return { kind: 'expired', state };
  }
  return { kind: 'active', state };
}
