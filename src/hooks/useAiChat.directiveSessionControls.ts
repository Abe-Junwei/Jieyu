import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getDb } from '../db';
import { deactivateSessionDirective as deactivateSessionDirectiveFromMemory, persistSessionMemory, pruneDirectiveLedgerBySourceMessage } from '../ai/chat/sessionMemory';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { resolvePinnedMessageSessionMemory } from './useAiChat.messagePinning';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';

export function useAiChatDirectiveSessionControls(options: {
  conversationId: string | null;
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  messagesRef: MutableRefObject<UiChatMessage[]>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
}) {
  const { conversationId, sessionMemoryRef, messagesRef, setMessages } = options;

  const writeDirectiveMutationAuditLog = useCallback((
    mutationType: 'deactivate' | 'prune_source',
    payload: Record<string, unknown>,
  ) => {
    if (!conversationId) return;
    const timestamp = nowIso();
    void getDb()
      .then((db) => db.collections.audit_logs.insert({
        id: newAuditLogId(),
        collection: 'ai_messages',
        documentId: conversationId,
        action: 'update',
        field: 'ai_user_directive_mutation',
        newValue: mutationType,
        source: 'human',
        timestamp,
        requestId: `directive_mutation_${mutationType}_${timestamp}`,
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'user_directive_mutation',
          mutationType,
          ...payload,
        }),
      }))
      .catch(() => {
        // 审计写入失败不阻断主流程 | Do not block the main flow when audit write fails.
      });
  }, [conversationId]);

  const toggleMessagePinned = useCallback((messageId: string) => {
    const nextMemory = resolvePinnedMessageSessionMemory(sessionMemoryRef.current, messagesRef.current, messageId);
    if (nextMemory === sessionMemoryRef.current) return;
    sessionMemoryRef.current = nextMemory;
    persistSessionMemory(sessionMemoryRef.current);
    setMessages((prev) => [...prev]);
  }, [messagesRef, sessionMemoryRef, setMessages]);

  const deactivateSessionDirective = useCallback((directiveId: string) => {
    const normalizedDirectiveId = directiveId.trim();
    if (!normalizedDirectiveId) return;
    const previousMemory = sessionMemoryRef.current;
    const inSession = (previousMemory.sessionDirectives ?? []).some((item) => item.id === normalizedDirectiveId);
    const inLedgerAccepted = (previousMemory.directiveLedger ?? []).some(
      (e) => e.id === normalizedDirectiveId && e.action === 'accepted',
    );
    if (!inSession && !inLedgerAccepted) return;
    const nextMemory = deactivateSessionDirectiveFromMemory(previousMemory, normalizedDirectiveId);
    if (nextMemory === previousMemory) return;
    sessionMemoryRef.current = nextMemory;
    persistSessionMemory(sessionMemoryRef.current);
    setMessages((prev) => [...prev]);
    writeDirectiveMutationAuditLog('deactivate', {
      directiveId: normalizedDirectiveId,
      before: {
        sessionDirectiveCount: (previousMemory.sessionDirectives ?? []).length,
        directiveLedgerCount: (previousMemory.directiveLedger ?? []).length,
      },
      after: {
        sessionDirectiveCount: (nextMemory.sessionDirectives ?? []).length,
        directiveLedgerCount: (nextMemory.directiveLedger ?? []).length,
      },
    });
  }, [sessionMemoryRef, setMessages, writeDirectiveMutationAuditLog]);

  const pruneSessionDirectivesBySourceMessage = useCallback((sourceMessageId: string) => {
    const normalizedSourceMessageId = sourceMessageId.trim();
    if (!normalizedSourceMessageId) return;
    const previousMemory = sessionMemoryRef.current;
    const matchedDirectiveCount = (previousMemory.sessionDirectives ?? []).filter((directive) => directive.sourceMessageId === normalizedSourceMessageId).length;
    const matchedLedgerCount = (previousMemory.directiveLedger ?? []).filter((entry) => entry.sourceMessageId === normalizedSourceMessageId).length;
    if (matchedDirectiveCount === 0 && matchedLedgerCount === 0) return;
    const nextMemory = pruneDirectiveLedgerBySourceMessage(previousMemory, normalizedSourceMessageId);
    if (nextMemory === previousMemory) return;
    sessionMemoryRef.current = nextMemory;
    persistSessionMemory(sessionMemoryRef.current);
    setMessages((prev) => [...prev]);
    writeDirectiveMutationAuditLog('prune_source', {
      sourceMessageId: normalizedSourceMessageId,
      removed: {
        sessionDirectiveCount: matchedDirectiveCount,
        directiveLedgerCount: matchedLedgerCount,
      },
      after: {
        sessionDirectiveCount: (nextMemory.sessionDirectives ?? []).length,
        directiveLedgerCount: (nextMemory.directiveLedger ?? []).length,
      },
    });
  }, [sessionMemoryRef, setMessages, writeDirectiveMutationAuditLog]);

  return {
    writeDirectiveMutationAuditLog,
    toggleMessagePinned,
    deactivateSessionDirective,
    pruneSessionDirectivesBySourceMessage,
  };
}
