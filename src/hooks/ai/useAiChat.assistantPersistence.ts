import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { nowIso } from './useAiChat.helpers';
import { getDb } from '../../db';
import type { AiMessageCitation } from '../../db';
import { mergeContextSnapshotWithWorkflowExplainability } from '../../ai/chat/workflowExplainability';
import type { UiChatMessage } from './useAiChat.types';
import {
  flushAssistantContent,
  finalizeAssistantMessageInDb,
} from './useAiChat.sendTurnPersistPhase';
import {
  isConversationGenerationStale,
  type ConversationGenerationRef,
} from '../../ai/chat/conversationGeneration';

interface RefLike<T> {
  current: T;
}

type AiChatDb = Awaited<ReturnType<typeof getDb>>;

interface CreateAssistantPersistenceHelpersOptions {
  assistantId: string;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  messagesRef: MutableRefObject<UiChatMessage[]>;
  streamPersistIntervalMsRef: RefLike<number>;
  getDbRef: () => AiChatDb | null;
  getActiveConversationId: () => string | null;
  conversationGenerationRef?: ConversationGenerationRef;
  streamGenerationAtStart?: number;
}

export function createAssistantPersistenceHelpers({
  assistantId,
  setMessages,
  messagesRef,
  streamPersistIntervalMsRef,
  getDbRef,
  getActiveConversationId,
  conversationGenerationRef,
  streamGenerationAtStart = 0,
}: CreateAssistantPersistenceHelpersOptions) {
  const isStreamGenerationStale = () =>
    isConversationGenerationStale(conversationGenerationRef, streamGenerationAtStart);
  let lastPersistedAssistantContent = '';
  let lastPersistedAt = 0;

  const touchConversationTimestamp = async (conversationId?: string) => {
    const dbRef = getDbRef();
    const targetConversationId = conversationId ?? getActiveConversationId();
    if (!dbRef || !targetConversationId) return;

    const conversation = await dbRef.collections.ai_conversations
      .findOne({
        selector: { id: targetConversationId },
      })
      .exec();
    if (!conversation) return;

    await dbRef.collections.ai_conversations.update(targetConversationId, {
      updatedAt: nowIso(),
    });
  };

  const flushAssistantDraft = async (content: string, force = false): Promise<void> => {
    if (isStreamGenerationStale()) return;
    const dbRef = getDbRef();
    if (!dbRef) return;
    if (content === lastPersistedAssistantContent) return;

    const now = Date.now();
    if (!force && now - lastPersistedAt < streamPersistIntervalMsRef.current) return;

    await flushAssistantContent(dbRef, assistantId, content);
    lastPersistedAssistantContent = content;
    lastPersistedAt = now;
  };

  /** 串行持久化且不阻塞 SSE 消费；若 await 每段 flush 会卡住 for-await，缓冲后一次性渲染 | Serialized persistence without blocking stream consumption */
  let persistTail: Promise<void> = Promise.resolve();

  const queueFlushAssistantDraft = (content: string, force = false): void => {
    persistTail = persistTail
      .then(() => flushAssistantDraft(content, force))
      .catch(() => {
        // 避免队列因单次写入失败而中断 | Keep chain alive after a failed write
      });
  };

  const awaitQueuedPersistence = (): Promise<void> => persistTail;

  const finalizeAssistantMessage = async (
    status: 'done' | 'error' | 'aborted',
    content: string,
    errorMessage?: string,
    citations?: AiMessageCitation[],
    reasoningContent?: string,
    options?: {
      sourceScopeSummary?: UiChatMessage['sourceScopeSummary'];
      reflectionChecks?: UiChatMessage['reflectionChecks'];
      compatibilityReport?: UiChatMessage['compatibilityReport'];
    },
  ) => {
    const staleGeneration = isStreamGenerationStale();

    if (!staleGeneration) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantId) return msg;
          if (status === 'error') {
            return {
              ...msg,
              content,
              status,
              ...(errorMessage ? { error: errorMessage } : {}),
              ...(citations ? { citations } : {}),
              ...(reasoningContent ? { reasoningContent } : {}),
              ...(options?.sourceScopeSummary
                ? { sourceScopeSummary: options.sourceScopeSummary }
                : {}),
              ...(options?.reflectionChecks ? { reflectionChecks: options.reflectionChecks } : {}),
              ...(options?.compatibilityReport
                ? { compatibilityReport: options.compatibilityReport }
                : {}),
            };
          }
          return {
            ...msg,
            content,
            status,
            ...(citations ? { citations } : {}),
            ...(reasoningContent ? { reasoningContent } : {}),
            ...(options?.sourceScopeSummary
              ? { sourceScopeSummary: options.sourceScopeSummary }
              : {}),
            ...(options?.reflectionChecks ? { reflectionChecks: options.reflectionChecks } : {}),
            ...(options?.compatibilityReport
              ? { compatibilityReport: options.compatibilityReport }
              : {}),
          };
        }),
      );
    }

    const dbRef = getDbRef();
    if (!dbRef) return;

    const existing = await dbRef.collections.ai_messages
      .findOne({ selector: { id: assistantId } })
      .exec();
    if (existing) {
      const row = existing.toJSON();
      const explainDto = staleGeneration
        ? undefined
        : messagesRef.current.find((m) => m.id === assistantId)?.workflowExplainability;
      const contextSnapshot = explainDto
        ? mergeContextSnapshotWithWorkflowExplainability(row.contextSnapshot, explainDto)
        : row.contextSnapshot;
      await finalizeAssistantMessageInDb(dbRef, row, {
        content,
        status,
        errorMessage,
        citations,
        reasoningContent,
        contextSnapshot,
        sourceScopeSummary: options?.sourceScopeSummary,
        reflectionChecks: options?.reflectionChecks,
        compatibilityReport: options?.compatibilityReport,
      });
      await touchConversationTimestamp(row.conversationId);
      return;
    }

    if (!staleGeneration) {
      await touchConversationTimestamp();
    }
  };

  return {
    flushAssistantDraft,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
  };
}
