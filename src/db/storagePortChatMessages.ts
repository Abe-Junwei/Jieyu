import { getDb } from './engine';
import { validateAiMessageDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiMessageCitation, AiMessageDoc } from './types';

function trimmed(id: string): string {
  return id.trim();
}

function messageReadbackMatches(
  stored: AiMessageDoc,
  messageId: string,
  patch: Partial<AiMessageDoc>,
): boolean {
  if (stored.id !== messageId) return false;
  if (patch.conversationId !== undefined && stored.conversationId !== patch.conversationId) {
    return false;
  }
  if (patch.content !== undefined && stored.content !== patch.content) return false;
  if (patch.status !== undefined && stored.status !== patch.status) return false;
  if (patch.updatedAt !== undefined && stored.updatedAt !== patch.updatedAt) return false;
  if (patch.role !== undefined && stored.role !== patch.role) return false;
  return true;
}

export async function readAiMessage(id: string): Promise<AiMessageDoc | undefined> {
  const messageId = trimmed(id);
  if (messageId.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_messages.get(messageId);
}

export async function listAiMessagesByConversation(
  conversationId: string,
): Promise<AiMessageDoc[]> {
  const id = trimmed(conversationId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.ai_messages.where('conversationId').equals(id).toArray();
}

export async function listAiMessagesByStatus(
  status: AiMessageDoc['status'],
): Promise<AiMessageDoc[]> {
  const database = await getDb();
  return database.dexie.ai_messages.where('status').equals(status).toArray();
}

export async function insertAiMessage(doc: AiMessageDoc): Promise<void> {
  const id = trimmed(doc.id);
  if (id.length === 0) throw new StorageReadbackError('insertAiMessage');
  const row: AiMessageDoc = { ...doc, id };
  validateAiMessageDoc(row);
  const database = await getDb();
  await database.dexie.ai_messages.put(row);
  const stored = await database.dexie.ai_messages.get(id);
  if (!stored || !messageReadbackMatches(stored, id, row)) {
    throw new StorageReadbackError('insertAiMessage');
  }
}

export async function insertUserChatMessage(input: {
  id: string;
  conversationId: string;
  content: string;
  timestamp: string;
}): Promise<void> {
  await insertAiMessage({
    id: input.id,
    conversationId: input.conversationId,
    role: 'user',
    content: input.content,
    status: 'done',
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  });
}

export async function insertAssistantChatPlaceholder(input: {
  id: string;
  conversationId: string;
  generationSource: 'local' | 'llm' | undefined;
  generationModel: string | undefined;
  timestamp: string;
}): Promise<void> {
  await insertAiMessage({
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

export async function patchAiMessage(id: string, patch: Partial<AiMessageDoc>): Promise<boolean> {
  const messageId = trimmed(id);
  if (messageId.length === 0) return false;
  const database = await getDb();
  const current = await database.dexie.ai_messages.get(messageId);
  if (!current) return false;
  const next: AiMessageDoc = { ...current, ...patch, id: messageId };
  await database.dexie.ai_messages.put(next);
  const stored = await database.dexie.ai_messages.get(messageId);
  if (!stored || !messageReadbackMatches(stored, messageId, patch)) {
    throw new StorageReadbackError('patchAiMessage');
  }
  return true;
}

export async function flushAiAssistantContent(assistantId: string, content: string): Promise<void> {
  await patchAiMessage(assistantId, {
    content,
    updatedAt: new Date().toISOString(),
  });
}

export interface FinalizeAiAssistantMessageInput {
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

export async function finalizeAiAssistantMessage(
  row: AiMessageDoc,
  input: FinalizeAiAssistantMessageInput,
): Promise<void> {
  const patch: Partial<AiMessageDoc> = {
    content: input.content,
    status: input.status,
    updatedAt: new Date().toISOString(),
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
  const patched = await patchAiMessage(row.id, patch);
  if (!patched) throw new StorageReadbackError('finalizeAiAssistantMessage');
}

export async function deleteAiMessagesByConversation(conversationId: string): Promise<void> {
  const id = trimmed(conversationId);
  if (id.length === 0) return;
  const database = await getDb();
  await database.dexie.ai_messages.where('conversationId').equals(id).delete();
  const remaining = await database.dexie.ai_messages.where('conversationId').equals(id).count();
  if (remaining !== 0) throw new StorageReadbackError('deleteAiMessagesByConversation');
}
