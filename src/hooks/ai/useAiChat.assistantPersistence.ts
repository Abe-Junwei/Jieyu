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
}

export function createAssistantPersistenceHelpers({
  assistantId,
  setMessages,
  messagesRef,
  streamPersistIntervalMsRef,
  getDbRef,
  getActiveConversationId,
}: CreateAssistantPersistenceHelpersOptions) {
  let lastPersistedAssistantContent = '';
  let lastPersistedAt = 0;

  const updateConversationTimestamp = async () => {
    const dbRef = getDbRef();
    const activeConversationId = getActiveConversationId();
    if (!dbRef || !activeConversationId) return;

    const conversation = await dbRef.collections.ai_conversations
      .findOne({
        selector: { id: activeConversationId },
      })
      .exec();
    if (!conversation) return;

    await dbRef.collections.ai_conversations.insert({
      ...conversation.toJSON(),
      updatedAt: nowIso(),
    });
  };

  const flushAssistantDraft = async (content: string, force = false): Promise<void> => {
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

    const dbRef = getDbRef();
    if (!dbRef) return;

    const existing = await dbRef.collections.ai_messages
      .findOne({ selector: { id: assistantId } })
      .exec();
    if (existing) {
      const row = existing.toJSON();
      const explainDto = messagesRef.current.find(
        (m) => m.id === assistantId,
      )?.workflowExplainability;
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
    }

    await updateConversationTimestamp();
  };

  return {
    flushAssistantDraft,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
  };
}
