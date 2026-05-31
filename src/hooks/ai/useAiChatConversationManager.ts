import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { AiSessionMemory } from '../../ai/chat/chatDomain.types';
import { t, type Locale } from '../../i18n';
import { getDb } from '../../db';
import { clearSessionMemoryFastPath } from '../../ai/chat/clearSessionMemoryFastPath';
import {
  bindSessionMemoryConversation,
  loadSessionMemoryAsync,
  persistSessionMemoryAsync,
} from '../../ai/chat/sessionMemory';
import {
  bumpConversationGeneration,
  isConversationGenerationStale,
  type ConversationGenerationRef,
} from '../../ai/chat/conversationGeneration';
import { createLogger } from '../../observability/logger';
import {
  listArchivedConversationsInScope,
  listConversationsInScope,
  pickLatestConversationInScope,
  fetchAllConversationRows,
} from './aiConversationManager.helpers';
import type {
  AiConversationListItem,
  AiConversationManagementApi,
} from './aiConversationManager.types';
import { loadConversationUiMessages } from './useAiChat.conversationState';
import { newMessageId, nowIso } from './useAiChat.helpers';
import type { UiChatMessage } from './useAiChat.types';
import {
  notifyConversationListMutated,
  subscribeConversationListSync,
} from './conversationListSync';

const log = createLogger('useAiChatConversationManager');

export type UseAiChatConversationManagerInput = Readonly<{
  enabled: boolean;
  locale: Locale;
  providerId: string;
  model: string;
  textId?: string;
  conversationId: string | null;
  conversationIdRef: MutableRefObject<string | null>;
  setConversationId: (id: string | null) => void;
  conversationGenerationRef: MutableRefObject<ConversationGenerationRef>;
  abortActiveStream: () => void;
  resetChatUiState: () => void;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
}>;

export function useAiChatConversationManager(
  input: UseAiChatConversationManagerInput,
): AiConversationManagementApi | null {
  const {
    enabled,
    locale,
    providerId,
    model,
    textId,
    conversationId,
    conversationIdRef,
    setConversationId,
    conversationGenerationRef,
    abortActiveStream,
    resetChatUiState,
    setMessages,
    sessionMemoryRef,
  } = input;

  const [conversations, setConversations] = useState<AiConversationListItem[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<AiConversationListItem[]>([]);

  const refreshConversations = useCallback(async () => {
    const [active, archived] = await Promise.all([
      listConversationsInScope(textId),
      listArchivedConversationsInScope(textId),
    ]);
    setConversations(active);
    setArchivedConversations(archived);
  }, [textId]);

  useEffect(() => {
    if (!enabled) {
      setConversations([]);
      setArchivedConversations([]);
      return;
    }
    void refreshConversations();
  }, [enabled, refreshConversations]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeConversationListSync(() => {
      void refreshConversations();
    });
  }, [enabled, refreshConversations]);

  const applyConversationSwitch = useCallback(
    async (nextConversationId: string) => {
      bumpConversationGeneration(conversationGenerationRef.current);
      const generationAtStart = conversationGenerationRef.current.current;
      abortActiveStream();
      conversationIdRef.current = nextConversationId;
      setConversationId(nextConversationId);
      bindSessionMemoryConversation(nextConversationId);
      const [uiMessages, sessionMemory] = await Promise.all([
        loadConversationUiMessages(nextConversationId),
        loadSessionMemoryAsync(nextConversationId),
      ]);
      if (isConversationGenerationStale(conversationGenerationRef.current, generationAtStart)) {
        return;
      }
      sessionMemoryRef.current = sessionMemory;
      setMessages(uiMessages);
    },
    [
      abortActiveStream,
      conversationGenerationRef,
      conversationIdRef,
      sessionMemoryRef,
      setConversationId,
      setMessages,
    ],
  );

  const detachActiveConversationUi = useCallback(() => {
    bumpConversationGeneration(conversationGenerationRef.current);
    abortActiveStream();
    resetChatUiState();
    setMessages([]);
    conversationIdRef.current = null;
    setConversationId(null);
    bindSessionMemoryConversation(null);
    sessionMemoryRef.current = {};
  }, [
    abortActiveStream,
    conversationGenerationRef,
    conversationIdRef,
    resetChatUiState,
    sessionMemoryRef,
    setConversationId,
    setMessages,
  ]);

  const switchToLatestInScopeOrEmpty = useCallback(async () => {
    const rows = await fetchAllConversationRows();
    const latest = pickLatestConversationInScope(rows, textId);
    if (!latest) {
      detachActiveConversationUi();
      return;
    }
    resetChatUiState();
    await applyConversationSwitch(latest.id);
  }, [applyConversationSwitch, detachActiveConversationUi, resetChatUiState, textId]);

  const startNewConversation = useCallback(async () => {
    const db = await getDb();
    const id = newMessageId('conv');
    const timestamp = nowIso();
    await db.collections.ai_conversations.insert({
      id,
      title: t(locale, 'ai.chat.defaultConversationTitle'),
      mode: 'assistant',
      providerId,
      model: model || providerId,
      ...(textId ? { textId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    bumpConversationGeneration(conversationGenerationRef.current);
    abortActiveStream();
    resetChatUiState();
    conversationIdRef.current = id;
    setConversationId(id);
    bindSessionMemoryConversation(id);
    sessionMemoryRef.current = {};
    setMessages([]);
    await persistSessionMemoryAsync(id, {});
    await refreshConversations();
    notifyConversationListMutated({ conversationId: id, ...(textId ? { textId } : {}) });
  }, [
    abortActiveStream,
    conversationGenerationRef,
    conversationIdRef,
    locale,
    model,
    providerId,
    refreshConversations,
    resetChatUiState,
    sessionMemoryRef,
    setConversationId,
    setMessages,
    textId,
  ]);

  const switchConversation = useCallback(
    async (targetConversationId: string) => {
      if (targetConversationId === conversationIdRef.current) return;
      resetChatUiState();
      await applyConversationSwitch(targetConversationId);
      await refreshConversations();
    },
    [applyConversationSwitch, conversationIdRef, refreshConversations, resetChatUiState],
  );

  const clearCurrentConversation = useCallback(() => {
    const activeId = conversationIdRef.current;
    detachActiveConversationUi();

    if (!activeId) return;

    void (async () => {
      try {
        const db = await getDb();
        const conversation = await db.collections.ai_conversations
          .findOne({ selector: { id: activeId } })
          .exec();
        if (conversation) {
          await db.collections.ai_conversations.update(activeId, {
            clearedAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        await db.collections.ai_messages.removeBySelector({ conversationId: activeId });
        const clearedMemory = clearSessionMemoryFastPath(sessionMemoryRef.current);
        sessionMemoryRef.current = clearedMemory;
        await persistSessionMemoryAsync(activeId, clearedMemory);
      } catch (error) {
        log.warn('clearCurrentConversation persistence failed', {
          conversationId: activeId,
          error,
        });
      } finally {
        await refreshConversations();
        notifyConversationListMutated({
          conversationId: activeId,
          ...(textId ? { textId } : {}),
        });
      }
    })();
  }, [
    conversationIdRef,
    detachActiveConversationUi,
    refreshConversations,
    sessionMemoryRef,
    textId,
  ]);

  const archiveConversation = useCallback(
    async (targetConversationId: string) => {
      const db = await getDb();
      const conversation = await db.collections.ai_conversations
        .findOne({ selector: { id: targetConversationId } })
        .exec();
      if (!conversation) return;

      await db.collections.ai_conversations.update(targetConversationId, {
        archived: true,
        updatedAt: nowIso(),
      });

      if (conversationIdRef.current === targetConversationId) {
        await switchToLatestInScopeOrEmpty();
      }

      await refreshConversations();
      notifyConversationListMutated({
        conversationId: targetConversationId,
        ...(textId ? { textId } : {}),
      });
    },
    [conversationIdRef, refreshConversations, switchToLatestInScopeOrEmpty, textId],
  );

  const deleteConversation = useCallback(
    async (targetConversationId: string) => {
      const db = await getDb();
      const wasActive = conversationIdRef.current === targetConversationId;

      if (wasActive) {
        detachActiveConversationUi();
      }

      await db.collections.ai_messages.removeBySelector({ conversationId: targetConversationId });
      try {
        await db.collections.ai_session_memories.removeBySelector({
          conversationId: targetConversationId,
        });
      } catch {
        // best-effort
      }
      await db.collections.ai_conversations.removeBySelector({ id: targetConversationId });

      if (wasActive) {
        await switchToLatestInScopeOrEmpty();
      }

      await refreshConversations();
      notifyConversationListMutated({
        conversationId: targetConversationId,
        ...(textId ? { textId } : {}),
      });
    },
    [
      conversationIdRef,
      detachActiveConversationUi,
      refreshConversations,
      switchToLatestInScopeOrEmpty,
      textId,
    ],
  );

  if (!enabled) return null;

  return {
    enabled: true,
    activeConversationId: conversationId,
    conversations,
    archivedConversations,
    refreshConversations,
    startNewConversation,
    switchConversation,
    clearCurrentConversation,
    archiveConversation,
    deleteConversation,
  };
}
