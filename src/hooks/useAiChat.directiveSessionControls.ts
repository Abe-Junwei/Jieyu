import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getDb } from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import { deactivateSessionDirective as deactivateSessionDirectiveFromMemory, persistSessionMemory, pruneDirectiveLedgerBySourceMessage } from '../ai/chat/sessionMemory';
import { extractUserDirectives } from '../ai/memory/userDirectiveExtractor';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import {
  AI_CHAT_BACKGROUND_MEMORY_SANDBOX_AUTHORIZED_DIRS,
  AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE,
} from './useAiChat.backgroundMemory';
import {
  AI_CHAT_SESSION_SIDECAR_WRITE_PATH,
  resolveAiChatSessionSidecarSandboxPolicy,
} from '../ai/policy/resolveExecutionPolicy';
import { resolvePinnedMessageSessionMemory } from './useAiChat.messagePinning';
import { scheduleSessionSidecarSandboxAudit } from './useAiChat.sessionSidecarAudit';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';

export function useAiChatDirectiveSessionControls(options: {
  conversationIdRef: MutableRefObject<string | null>;
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  messagesRef: MutableRefObject<UiChatMessage[]>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
}) {
  const { conversationIdRef, sessionMemoryRef, messagesRef, setMessages } = options;

  const writeDirectiveMutationAuditLog = useCallback((
    mutationType: 'deactivate' | 'prune_source',
    payload: Record<string, unknown>,
  ) => {
    const activeConversationId = conversationIdRef.current;
    if (!activeConversationId) return;
    const timestamp = nowIso();
    void getDb()
      .then((db) => db.collections.audit_logs.insert({
        id: newAuditLogId(),
        collection: 'ai_messages',
        documentId: activeConversationId,
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
  }, [conversationIdRef]);

  const toggleMessagePinned = useCallback((messageId: string) => {
    const sessionSidecarSandbox = featureFlags.aiBackgroundToolSandboxEnabled
      ? {
          sandboxEnabled: true,
          profile: AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE,
          authorizedWriteDirs: AI_CHAT_BACKGROUND_MEMORY_SANDBOX_AUTHORIZED_DIRS,
        }
      : undefined;
    const normalizedMessageId = messageId.trim();
    const activeConversationId = conversationIdRef.current;
    const currentlyPinned = (sessionMemoryRef.current.pinnedMessageIds ?? []).includes(normalizedMessageId);
    if (!currentlyPinned && activeConversationId && sessionSidecarSandbox?.sandboxEnabled) {
      const message = messagesRef.current.find((item) => item.id === normalizedMessageId);
      if (message?.role === 'user') {
        const extracted = extractUserDirectives({
          userText: message.content,
          source: 'pinned_message',
          sourceMessageId: normalizedMessageId,
        });
        if (extracted.length > 0) {
          const decision = resolveAiChatSessionSidecarSandboxPolicy({
            sandboxEnabled: true,
            profile: sessionSidecarSandbox.profile,
            authorizedWriteDirs: sessionSidecarSandbox.authorizedWriteDirs,
            virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.pinnedMessageDirective,
          });
          if (decision.action !== 'allow') {
            scheduleSessionSidecarSandboxAudit({
              conversationId: activeConversationId,
              virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.pinnedMessageDirective,
              sandboxAction: decision.action,
              sandboxReason: decision.reason,
              sourceMessageId: normalizedMessageId,
            });
          }
        }
      }
    }
    const nextMemory = resolvePinnedMessageSessionMemory(
      sessionMemoryRef.current,
      messagesRef.current,
      normalizedMessageId,
      sessionSidecarSandbox,
    );
    if (nextMemory === sessionMemoryRef.current) return;
    sessionMemoryRef.current = nextMemory;
    persistSessionMemory(sessionMemoryRef.current);
    setMessages((prev) => [...prev]);
  }, [conversationIdRef, messagesRef, sessionMemoryRef, setMessages]);

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
