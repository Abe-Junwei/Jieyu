/**
 * ARCHITECTURE-NOTE(P1-6): Unified ai_messages persistence layer.
 *
 * Previously scattered across:
 * - useAiChat.sendPersistTurnAndBuildPromptContext.ts — user + assistant placeholder inserts
 * - useAiChat.sendTurnPersistAndPrimaryStream.ts — generation metadata update
 * - useAiChat.assistantPersistence.ts — stream flush + finalize inserts
 * - useAiChat.sendTurnStreamPhase.persistOutputCapRetry.ts — retry generation metadata update (output-cap path)
 *
 * This module centralizes all ai_messages DB mutations into a single file.
 */

import type { AiMessageCitation, AiMessageDoc } from '../../db';
import type { JieyuDatabase } from '../../db/engine';
import { nowIso } from './useAiChat.helpers';

type AiChatDb = JieyuDatabase;

interface PersistUserMessageInput {
  id: string;
  conversationId: string;
  content: string;
  timestamp: string;
}

export async function persistUserMessage(
  db: AiChatDb,
  input: PersistUserMessageInput,
): Promise<void> {
  await db.collections.ai_messages.insert({
    id: input.id,
    conversationId: input.conversationId,
    role: 'user',
    content: input.content,
    status: 'done',
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  });
}

interface PersistAssistantPlaceholderInput {
  id: string;
  conversationId: string;
  generationSource: 'local' | 'llm' | undefined;
  generationModel: string | undefined;
  timestamp: string;
}

export async function persistAssistantPlaceholder(
  db: AiChatDb,
  input: PersistAssistantPlaceholderInput,
): Promise<void> {
  await db.collections.ai_messages.insert({
    id: input.id,
    conversationId: input.conversationId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    ...(input.generationSource !== undefined ? { generationSource: input.generationSource } : {}),
    ...(input.generationModel !== undefined ? { generationModel: input.generationModel } : {}),
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  });
}

export async function updateAssistantGenerationMeta(
  db: AiChatDb,
  assistantId: string,
  generationSource: 'local' | 'llm',
  generationModel: string,
): Promise<void> {
  await db.collections.ai_messages.update(assistantId, {
    generationSource,
    generationModel,
    updatedAt: nowIso(),
  });
}

export async function flushAssistantContent(
  db: AiChatDb,
  assistantId: string,
  content: string,
): Promise<void> {
  const existing = await db.collections.ai_messages
    .findOne({ selector: { id: assistantId } })
    .exec();
  if (!existing) return;
  await db.collections.ai_messages.update(assistantId, {
    content,
    updatedAt: nowIso(),
  });
}

interface FinalizeAssistantMessageInput {
  assistantId: string;
  content: string;
  status: 'done' | 'error' | 'aborted';
  errorMessage: string | undefined;
  citations: AiMessageCitation[] | undefined;
  reasoningContent: string | undefined;
  contextSnapshot: unknown | undefined;
  sourceScopeSummary: unknown | undefined;
  reflectionChecks: unknown | undefined;
  compatibilityReport: unknown | undefined;
}

export async function finalizeAssistantMessageInDb(
  db: AiChatDb,
  row: AiMessageDoc,
  input: Omit<FinalizeAssistantMessageInput, 'assistantId'>,
): Promise<void> {
  const patch: Partial<AiMessageDoc> = {
    content: input.content,
    status: input.status,
    updatedAt: nowIso(),
  };
  if (input.errorMessage !== undefined) patch.errorMessage = input.errorMessage;
  if (input.citations !== undefined) patch.citations = input.citations;
  if (input.reasoningContent !== undefined) patch.reasoningContent = input.reasoningContent;
  if (input.contextSnapshot !== undefined && input.contextSnapshot !== null) {
    patch.contextSnapshot = input.contextSnapshot as Record<string, unknown>;
  }
  if (input.sourceScopeSummary != null) {
    patch.sourceScopeSummary = input.sourceScopeSummary as NonNullable<
      AiMessageDoc['sourceScopeSummary']
    >;
  }
  if (input.reflectionChecks != null) {
    patch.reflectionChecks = input.reflectionChecks as NonNullable<
      AiMessageDoc['reflectionChecks']
    >;
  }
  if (input.compatibilityReport != null) {
    patch.compatibilityReport = input.compatibilityReport as NonNullable<
      AiMessageDoc['compatibilityReport']
    >;
  }
  await db.collections.ai_messages.update(row.id, patch);
}

export async function updateAssistantRetryMeta(
  db: AiChatDb,
  assistantId: string,
  retryGenerationSource: 'local' | 'llm',
  retryGenerationModel: string,
): Promise<void> {
  await db.collections.ai_messages.update(assistantId, {
    generationSource: retryGenerationSource,
    generationModel: retryGenerationModel,
    updatedAt: nowIso(),
  });
}
