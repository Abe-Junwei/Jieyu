import { getDb } from '../../db';
import { newAuditLogId, nowIso } from '../../hooks/useAiChat.helpers';
import {
  AI_ADOPTION_OUTCOME_AUDIT_FIELD,
  buildAdoptionOutcomeAuditMetadata,
  type AdoptionAction,
  type AdoptionItem,
} from './adoptionQueue';

/**
 * Persist AdoptionQueue user actions to Dexie `audit_logs` (best-effort, non-blocking).
 */
export function scheduleAdoptionOutcomeAuditLog(options: {
  conversationId: string | null | undefined;
  item: AdoptionItem;
  action: AdoptionAction;
}): void {
  const { conversationId, item, action } = options;
  if (action === 'jump_to_evidence') return;
  const documentId = (conversationId && conversationId.trim().length > 0)
    ? conversationId.trim()
    : item.requestId;
  const baseMeta = buildAdoptionOutcomeAuditMetadata(item, action);
  const meta = {
    ...baseMeta,
    ...(item.sourceAssistantMessageId !== undefined
      ? { sourceAssistantMessageId: item.sourceAssistantMessageId }
      : {}),
  };
  const timestamp = nowIso();
  void getDb()
    .then((db) => db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId,
      action: 'update',
      field: AI_ADOPTION_OUTCOME_AUDIT_FIELD,
      oldValue: item.workflowId,
      newValue: meta.toStatus,
      source: 'human',
      timestamp,
      requestId: `${item.id}_${action}_${timestamp}`,
      metadataJson: JSON.stringify(meta),
    }))
    .catch(() => {
      // 审计写入失败不阻断主流程 | Do not block UX when audit insert fails.
    });
}
