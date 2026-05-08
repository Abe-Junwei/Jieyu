/**
 * PR-P4-3: AdoptionQueue MVP — 人在环审阅队列
 *
 * 状态机：pending → accepted | ignored | copied | expired
 * accept 必须带可跳转证据占位（与 vertical audit envelope / citations 对齐）；真写入仍由 propose_changes / confirm 承接。
 */

import type { AiMessageCitation } from '../../db/types';
import type { VerticalWorkflowAuditMetadataV1 } from './verticalWorkflowAudit';

/** Dexie `audit_logs.field` for adoption user outcomes */
export const AI_ADOPTION_OUTCOME_AUDIT_FIELD = 'ai_adoption_outcome' as const;

export type AdoptionStatus = 'pending' | 'accepted' | 'ignored' | 'copied' | 'expired';

export type AdoptionAction = 'accept' | 'ignore' | 'copy' | 'jump_to_evidence' | 'expire';

export interface AdoptionItem {
  id: string;
  workflowId: string;
  requestId: string;
  createdAt: string;
  status: AdoptionStatus;
  /** 对应垂直工作流审计里的助手消息 id，用于 jump → citation | Assistant message id from vertical workflow audit */
  sourceAssistantMessageId?: string;
  /** 输出类型 | Output kind */
  outputKind?: string;
  /** 标题 | Title */
  title?: string;
  /** 原始 AI 输出摘要 | AI output summary */
  summary: string;
  /** 关联 evidence packet ids | Associated evidence packet ids */
  evidencePacketIds: string[];
  /** 推荐操作 | Recommended action */
  recommendedAction?: string;
  /** 写入模式 | Write mode */
  writeMode?: string;
  /** 采纳前的原始内容（用于 audit）| Pre-adoption raw content */
  rawContent?: string;
  /** 用户采纳后的结果（用于 audit）| Post-adoption outcome */
  outcomeContent?: string;
  /** 忽略/过期原因 | Ignore / expiry reason */
  reasonCode?: string;
  /** 用户可见的操作标签 | User-visible action label */
  actionLabel?: string;
}

export interface AdoptionQueueState {
  items: AdoptionItem[];
  /** 已过期项的自动清理标记 | Auto-cleanup marker for expired items */
  lastPrunedAt?: string;
}

const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Synthetic packet ids: `vertical_evidence:{assistantMessageId}:{index}` */
export function buildVerticalAdoptionEvidencePacketIds(options: {
  assistantMessageId: string;
  metadata: VerticalWorkflowAuditMetadataV1;
  citations?: AiMessageCitation[] | null | undefined;
}): string[] {
  const { assistantMessageId, metadata, citations } = options;
  const n = Math.max(
    metadata.envelope.evidencePacketCount,
    citations?.length ?? 0,
  );
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => `vertical_evidence:${assistantMessageId}:${i}`);
}

export function canAcceptAdoptionItem(item: AdoptionItem): boolean {
  return item.status === 'pending' && item.evidencePacketIds.length > 0;
}

export function createAdoptionItem(params: Omit<AdoptionItem, 'id' | 'createdAt' | 'status'>): AdoptionItem {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...params,
  };
}

export function transitionAdoptionItem(
  item: AdoptionItem,
  action: AdoptionAction,
  options?: {
    outcomeContent?: string;
    reasonCode?: string;
    actionLabel?: string;
  },
): AdoptionItem {
  switch (action) {
    case 'accept':
      if (item.status !== 'pending') {
        throw new Error(`Cannot accept item with status ${item.status}`);
      }
      if (item.evidencePacketIds.length === 0) {
        throw new Error('Cannot accept adoption item without evidence packets');
      }
      {
        const next: AdoptionItem = {
          id: item.id,
          workflowId: item.workflowId,
          requestId: item.requestId,
          createdAt: item.createdAt,
          summary: item.summary,
          evidencePacketIds: item.evidencePacketIds,
          status: 'accepted',
          actionLabel: options?.actionLabel ?? 'accepted',
        };
        if (item.outputKind !== undefined) next.outputKind = item.outputKind;
        if (item.title !== undefined) next.title = item.title;
        if (item.recommendedAction !== undefined) next.recommendedAction = item.recommendedAction;
        if (item.writeMode !== undefined) next.writeMode = item.writeMode;
        if (item.rawContent !== undefined) next.rawContent = item.rawContent;
        if (options?.outcomeContent !== undefined) next.outcomeContent = options.outcomeContent;
        return next;
      }
    case 'ignore':
      if (item.status !== 'pending') {
        throw new Error(`Cannot ignore item with status ${item.status}`);
      }
      return {
        ...item,
        status: 'ignored',
        reasonCode: options?.reasonCode ?? 'user_ignored',
        actionLabel: options?.actionLabel ?? 'ignored',
      };
    case 'copy':
      return {
        ...item,
        status: item.status === 'pending' ? 'copied' : item.status,
        actionLabel: options?.actionLabel ?? 'copied',
      };
    case 'jump_to_evidence':
      // jump_to_evidence 不改变状态，只触发导航 | jump_to_evidence is a navigation action
      return item;
    case 'expire':
      return item.status === 'pending'
        ? { ...item, status: 'expired', reasonCode: options?.reasonCode ?? 'auto_expired' }
        : item;
    default:
      throw new Error(`Unknown adoption action: ${action}`);
  }
}

export function pruneExpiredItems(
  state: AdoptionQueueState,
  nowMs = Date.now(),
  expiryMs = DEFAULT_EXPIRY_MS,
  auditCallback?: (expiredItems: AdoptionItem[]) => void,
): AdoptionQueueState {
  const newlyExpiredItems: AdoptionItem[] = [];
  const pruned = state.items.map((item) => {
    if (item.status !== 'pending') return item;
    const createdMs = new Date(item.createdAt).getTime();
    if (nowMs - createdMs > expiryMs) {
      const expiredItem = { ...item, status: 'expired' as const, reasonCode: 'auto_expired' };
      newlyExpiredItems.push(expiredItem);
      return expiredItem;
    }
    return item;
  });
  if (newlyExpiredItems.length > 0 && auditCallback) {
    auditCallback(newlyExpiredItems);
  }
  return {
    items: pruned,
    lastPrunedAt: new Date().toISOString(),
  };
}

export function filterAdoptionItemsByStatus(
  items: AdoptionItem[],
  status: AdoptionStatus,
): AdoptionItem[] {
  return items.filter((item) => item.status === status);
}

/** Build audit log metadata for an adoption outcome */
export function buildAdoptionOutcomeAuditMetadata(
  item: AdoptionItem,
  action: AdoptionAction,
): {
  schemaVersion: number;
  phase: 'adoption_outcome';
  itemId: string;
  workflowId: string;
  requestId: string;
  action: AdoptionAction;
  fromStatus: AdoptionStatus;
  toStatus: AdoptionStatus;
  reasonCode?: string;
} {
  const toStatus: AdoptionStatus =
    action === 'accept' ? 'accepted' :
    action === 'ignore' ? 'ignored' :
    action === 'copy' ? 'copied' :
    action === 'expire' ? 'expired' : item.status;

  const meta: {
    schemaVersion: number;
    phase: 'adoption_outcome';
    itemId: string;
    workflowId: string;
    requestId: string;
    action: AdoptionAction;
    fromStatus: AdoptionStatus;
    toStatus: AdoptionStatus;
    reasonCode?: string;
  } = {
    schemaVersion: 1,
    phase: 'adoption_outcome',
    itemId: item.id,
    workflowId: item.workflowId,
    requestId: item.requestId,
    action,
    fromStatus: item.status,
    toStatus,
  };
  if (item.reasonCode !== undefined) {
    meta.reasonCode = item.reasonCode;
  }
  return meta;
}
