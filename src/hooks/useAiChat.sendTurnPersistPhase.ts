/**
 * ARCHITECTURE-NOTE(P1-6): Unified ai_messages persistence layer.
 *
 * Previously scattered across:
 * - useAiChat.sendPersistTurnAndBuildPromptContext.ts — user + assistant placeholder inserts
 * - useAiChat.sendTurnPersistAndPrimaryStream.ts — generation metadata update
 * - useAiChat.assistantPersistence.ts — stream flush + finalize inserts
 * - useAiChat.sendTurnStreamPhase.ts — retry generation metadata update
 *
 * This module centralizes all ai_messages DB mutations into a single file.
 */

import type { AiMessageCitation, AiMessageDoc } from '../db';
import { getDb } from '../db';
import { nowIso } from './useAiChat.helpers';

type AiChatDb = Awaited<ReturnType<typeof getDb>>;

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
  const existing = await db.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
  if (!existing) return;
  await db.collections.ai_messages.insert({
    ...existing.toJSON(),
    content,
    updatedAt: nowIso(),
  } as AiMessageDoc);
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
  input: FinalizeAssistantMessageInput,
): Promise<void> {
  const existing = await db.collections.ai_messages.findOne({ selector: { id: input.assistantId } }).exec();
  if (!existing) return;

  const row = existing.toJSON();
  await db.collections.ai_messages.insert({
    ...row,
    content: input.content,
    status: input.status,
    ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
    ...(input.citations !== undefined ? { citations: input.citations } : {}),
    ...(input.reasoningContent !== undefined ? { reasoningContent: input.reasoningContent } : {}),
    ...(input.contextSnapshot !== undefined ? { contextSnapshot: input.contextSnapshot } : {}),
    ...(input.sourceScopeSummary !== undefined ? { sourceScopeSummary: input.sourceScopeSummary } : {}),
    ...(input.reflectionChecks !== undefined ? { reflectionChecks: input.reflectionChecks } : {}),
    ...(input.compatibilityReport !== undefined ? { compatibilityReport: input.compatibilityReport } : {}),
    updatedAt: nowIso(),
  } as AiMessageDoc);
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
