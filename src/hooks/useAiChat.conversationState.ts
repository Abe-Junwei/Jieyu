import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type Locale } from '../i18n';
import { getDb } from '../db';
import { formatHistoryLoadFailedFallbackError, formatRecoveredInterruptedMessage } from '../ai/messages';
import { newMessageId, nowIso } from './useAiChat.helpers';
import type { UiChatMessage } from './useAiChat.types';
import { parseWorkflowExplainabilityFromContextSnapshot } from '../ai/chat/workflowExplainability';

interface UseAiChatConversationStateOptions {
  locale: Locale;
  providerId: string;
  model: string;
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

export function useAiChatConversationState({
  locale,
  providerId,
  model,
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
    const existingRows = (await db.collections.ai_conversations.find().exec())
      .map((doc) => doc.toJSON())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (existingRows.length > 0) {
      const recentId = existingRows[0]!.id;
      conversationIdRef.current = recentId;
      setConversationId(recentId);
      return recentId;
    }

    const id = newMessageId('conv');
    const timestamp = nowIso();
    await db.collections.ai_conversations.insert({
      id,
      title: t(locale, 'ai.chat.defaultConversationTitle'),
      mode: 'assistant',
      providerId,
      model: model || providerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    conversationIdRef.current = id;
    setConversationId(id);
    return id;
  }, [locale, model, providerId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const db = await getDb();
        // Recover crashed/interrupted sessions by marking stale streaming rows as aborted.
        const zombieStreamingRows = await db.collections.ai_messages.findByIndex('status', 'streaming');
        if (zombieStreamingRows.length > 0) {
          const now = nowIso();
          await Promise.all(zombieStreamingRows.map(async (doc) => {
            const row = doc.toJSON();
            await db.collections.ai_messages.insert({
              ...row,
              status: 'aborted',
              errorMessage: row.errorMessage ?? formatRecoveredInterruptedMessage(),
              updatedAt: now,
            });
          }));
        }

        const conversations = (await db.collections.ai_conversations.find().exec())
          .map((doc) => doc.toJSON())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        if (cancelled) return;
        if (conversations.length === 0) {
          setIsBootstrapping(false);
          return;
        }

        const latest = conversations[0]!;
        conversationIdRef.current = latest.id;
        setConversationId(latest.id);
        const rows = (await db.collections.ai_messages.findByIndex('conversationId', latest.id))
          .map((doc) => doc.toJSON())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        if (!cancelled) {
          // UI renders newest-first to keep latest dialog always visible at top.
          onHistoryLoaded(
            mapHistoryRowsToUiMessages(rows)
              .filter((row) => row.role === 'user' || row.role === 'assistant')
              .reverse(),
          );
        }
      } catch (error) {
        if (!cancelled) {
          onHistoryLoadError(error instanceof Error ? error.message : formatHistoryLoadFailedFallbackError());
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
  }, [onHistoryLoadError, onHistoryLoaded]);

  return {
    conversationId,
    conversationIdRef,
    isBootstrapping,
    ensureConversation,
  };
}
