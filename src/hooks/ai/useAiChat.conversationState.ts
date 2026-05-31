import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type Locale } from '../../i18n';
import { getDb } from '../../db';
import {
  formatHistoryLoadFailedFallbackError,
  formatRecoveredInterruptedMessage,
} from '../../ai/messages';
import { newMessageId, nowIso } from './useAiChat.helpers';
import type { UiChatMessage } from './useAiChat.types';
import { parseWorkflowExplainabilityFromContextSnapshot } from '../../ai/chat/workflowExplainability';
import {
  fetchAllConversationRows,
  pickLatestConversationInScope,
  sortConversationsByUpdatedAtDesc,
} from './aiConversationManager.helpers';

interface UseAiChatConversationStateOptions {
  locale: Locale;
  providerId: string;
  model: string;
  textId?: string;
  onHistoryLoaded: (messages: UiChatMessage[]) => void;
  onHistoryLoadError: (message: string) => void;
}

function mapHistoryRowsToUiMessages(
  rows: Array<{
    id: string;
    role: string;
    content: string;
    status?: 'streaming' | 'done' | 'error' | 'aborted';
    generationSource?: 'llm' | 'local';
    generationModel?: string;
    errorMessage?: string;
    citations?: UiChatMessage['citations'];
    reasoningContent?: unknown;
    contextSnapshot?: Record<string, unknown>;
    reflectionChecks?: Array<{ name: string; passed: boolean }>;
    compatibilityReport?: UiChatMessage['compatibilityReport'];
    sourceScopeSummary?: UiChatMessage['sourceScopeSummary'];
  }>,
): UiChatMessage[] {
  return rows.map((row) => {
    const message: UiChatMessage = {
      id: row.id,
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
    };
    if (row.status) {
      message.status = row.status;
    }
    if (row.generationSource) {
      message.generationSource = row.generationSource;
    }
    if (typeof row.generationModel === 'string') {
      message.generationModel = row.generationModel;
    }
    if (row.errorMessage) {
      message.error = row.errorMessage;
    }
    if (row.citations) {
      message.citations = row.citations;
    }
    if (typeof row.reasoningContent === 'string' && row.reasoningContent.length > 0) {
      message.reasoningContent = row.reasoningContent;
    }
    if (row.reflectionChecks) {
      message.reflectionChecks = row.reflectionChecks;
    }
    if (row.compatibilityReport) {
      message.compatibilityReport = row.compatibilityReport;
    }
    if (row.sourceScopeSummary) {
      message.sourceScopeSummary = row.sourceScopeSummary;
    }
    if (message.role === 'assistant') {
      const fromSnap = parseWorkflowExplainabilityFromContextSnapshot(row.contextSnapshot);
      if (fromSnap) {
        message.workflowExplainability = fromSnap;
      }
    }
    return message;
  });
}

export async function loadConversationUiMessages(conversationId: string): Promise<UiChatMessage[]> {
  const db = await getDb();
  const rows = (await db.collections.ai_messages.findByIndex('conversationId', conversationId))
    .map((doc) => doc.toJSON())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const chatRows = rows.filter((row) => row.role === 'user' || row.role === 'assistant');
  return mapHistoryRowsToUiMessages(chatRows).reverse();
}

export function useAiChatConversationState({
  locale,
  providerId,
  model,
  textId,
  onHistoryLoaded,
  onHistoryLoadError,
}: UseAiChatConversationStateOptions) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  /** Same id as `conversationId` state, updated synchronously when a row is chosen/created so handlers (e.g. pin) run before the next React commit. */
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;

    const db = await getDb();
    const existingRows = await fetchAllConversationRows();
    const latestInScope = pickLatestConversationInScope(existingRows, textId);

    if (latestInScope) {
      conversationIdRef.current = latestInScope.id;
      setConversationId(latestInScope.id);
      return latestInScope.id;
    }

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
    conversationIdRef.current = id;
    setConversationId(id);
    return id;
  }, [locale, model, providerId, textId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const db = await getDb();
        // Recover crashed/interrupted sessions by marking stale streaming rows as aborted.
        const zombieStreamingRows = await db.collections.ai_messages.findByIndex(
          'status',
          'streaming',
        );
        if (zombieStreamingRows.length > 0) {
          const now = nowIso();
          await Promise.all(
            zombieStreamingRows.map(async (doc) => {
              const row = doc.toJSON();
              await db.collections.ai_messages.update(row.id, {
                status: 'aborted',
                errorMessage: row.errorMessage ?? formatRecoveredInterruptedMessage(),
                updatedAt: now,
              });
            }),
          );
        }

        const conversations = sortConversationsByUpdatedAtDesc(await fetchAllConversationRows());
        const latest = pickLatestConversationInScope(conversations, textId);

        if (cancelled) return;
        if (!latest) {
          setIsBootstrapping(false);
          return;
        }

        conversationIdRef.current = latest.id;
        setConversationId(latest.id);
        const uiMessages = await loadConversationUiMessages(latest.id);

        if (!cancelled) {
          onHistoryLoaded(uiMessages);
        }
      } catch (error) {
        if (!cancelled) {
          onHistoryLoadError(
            error instanceof Error ? error.message : formatHistoryLoadFailedFallbackError(),
          );
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [onHistoryLoadError, onHistoryLoaded, textId]);

  return {
    conversationId,
    conversationIdRef,
    setConversationId,
    isBootstrapping,
    ensureConversation,
  };
}
