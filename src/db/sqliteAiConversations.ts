/**
 * 会话和消息写在项目库里（ADR-0080）。
 * 改标题、改一条消息、清空一个会话的消息，各是一次事务，提交后再读回。读回失败不撤销。
 * 引用、推理正文和上下文快照不在消息行上。
 */
import Database from 'better-sqlite3';
import { StorageReadbackError } from './storageReadbackError';
import type { AiConversationDoc, AiMessageDoc } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

type ConversationPatch = { title?: string; updatedAt?: string };
type MessagePatch = {
  content: string;
  status: AiMessageDoc['status'];
  errorMessage?: string;
  updatedAt: string;
};

const CONVERSATION_MODES = new Set(['assistant', 'analysis', 'review']);
const MESSAGE_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const MESSAGE_STATUSES = new Set(['streaming', 'done', 'error', 'aborted']);

const CONVERSATION_COLUMNS =
  'id, text_id, title, mode, provider_id, model, archived, cleared_at, created_at, updated_at';
const MESSAGE_COLUMNS =
  'id, conversation_id, role, content, status, generation_source, generation_model, error_message, created_at, updated_at';

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`${label} row is incomplete`);
  return value as Record<string, unknown>;
}

function requiredText(row: Record<string, unknown>, key: string, label: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} row is incomplete`);
  return value;
}

function textValue(row: Record<string, unknown>, key: string, label: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`${label} row is incomplete`);
  return value;
}

function conversationMode(value: string): AiConversationDoc['mode'] {
  if (value === 'assistant' || value === 'analysis' || value === 'review') return value;
  throw new Error('conversation row is incomplete');
}

function messageRole(value: string): AiMessageDoc['role'] {
  if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') {
    return value;
  }
  throw new Error('message row is incomplete');
}

function messageStatus(value: string): AiMessageDoc['status'] {
  if (value === 'streaming' || value === 'done' || value === 'error' || value === 'aborted') {
    return value;
  }
  throw new Error('message status is not recognized');
}

function generationSource(value: string | undefined): 'llm' | 'local' | undefined {
  if (value === undefined) return undefined;
  if (value === 'llm' || value === 'local') return value;
  throw new Error('message row is incomplete');
}

function archivedOf(row: Record<string, unknown>): boolean | undefined {
  const value = row.archived;
  if (value === null || value === undefined) return undefined;
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error('conversation row is incomplete');
}

function conversationFromRow(value: unknown): AiConversationDoc {
  const row = record(value, 'conversation');
  const mode = requiredText(row, 'mode', 'conversation');
  if (!CONVERSATION_MODES.has(mode)) throw new Error('conversation row is incomplete');
  const archived = archivedOf(row);
  const clearedAt = textValue(row, 'cleared_at', 'conversation');
  if (clearedAt === '') throw new Error('conversation row is incomplete');
  return {
    id: requiredText(row, 'id', 'conversation'),
    textId: requiredText(row, 'text_id', 'conversation'),
    title: requiredText(row, 'title', 'conversation'),
    mode: conversationMode(mode),
    providerId: requiredText(row, 'provider_id', 'conversation'),
    model: requiredText(row, 'model', 'conversation'),
    createdAt: requiredText(row, 'created_at', 'conversation'),
    updatedAt: requiredText(row, 'updated_at', 'conversation'),
    ...(archived !== undefined ? { archived } : {}),
    ...(clearedAt !== null ? { clearedAt } : {}),
  };
}

function messageFromRow(value: unknown): AiMessageDoc {
  const row = record(value, 'message');
  const role = requiredText(row, 'role', 'message');
  const status = requiredText(row, 'status', 'message');
  if (!MESSAGE_ROLES.has(role)) throw new Error('message row is incomplete');
  if (!MESSAGE_STATUSES.has(status)) throw new Error('message row is incomplete');
  const content = textValue(row, 'content', 'message');
  if (content === null) throw new Error('message row is incomplete');
  const source = generationSource(textValue(row, 'generation_source', 'message') ?? undefined);
  const model = textValue(row, 'generation_model', 'message');
  const errorMessage = textValue(row, 'error_message', 'message');
  if (model === '') throw new Error('message row is incomplete');
  return {
    id: requiredText(row, 'id', 'message'),
    conversationId: requiredText(row, 'conversation_id', 'message'),
    role: messageRole(role),
    content,
    status: messageStatus(status),
    createdAt: requiredText(row, 'created_at', 'message'),
    updatedAt: requiredText(row, 'updated_at', 'message'),
    ...(source !== undefined ? { generationSource: source } : {}),
    ...(model !== null ? { generationModel: model } : {}),
    ...(errorMessage !== null ? { errorMessage } : {}),
  };
}

function findConversation(project: SqliteDatabase, id: string): AiConversationDoc | undefined {
  const row = project
    .prepare(`SELECT ${CONVERSATION_COLUMNS} FROM ai_conversations WHERE id = ?`)
    .get(id);
  return row === undefined ? undefined : conversationFromRow(row);
}

export async function listRecentAiConversationsInProject(
  project: SqliteDatabase,
  limit: number,
): Promise<AiConversationDoc[]> {
  const capped = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (capped === 0) return [];
  const rows = project
    .prepare(
      `SELECT ${CONVERSATION_COLUMNS} FROM ai_conversations ORDER BY updated_at DESC, id ASC LIMIT ?`,
    )
    .all(capped);
  return rows.map((row) => conversationFromRow(row));
}

export async function readAiConversationInProject(
  project: SqliteDatabase,
  id: string,
): Promise<AiConversationDoc | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  return findConversation(project, key);
}

export async function patchAiConversationInProject(
  project: SqliteDatabase,
  id: string,
  patch: ConversationPatch,
): Promise<AiConversationDoc | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  const current = findConversation(project, key);
  if (current === undefined) return undefined;
  const title = patch.title !== undefined ? patch.title : current.title;
  const updatedAt = patch.updatedAt !== undefined ? patch.updatedAt : current.updatedAt;
  if (title.length === 0 || updatedAt.length === 0) {
    throw new Error('conversation row is incomplete');
  }
  const update = project.prepare(
    'UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?',
  );
  project.transaction(() => {
    update.run(title, updatedAt, key);
  })();
  const stored = findConversation(project, key);
  if (stored === undefined || stored.title !== title || stored.updatedAt !== updatedAt) {
    throw new StorageReadbackError('patchAiConversation');
  }
  return stored;
}

export async function clearAiConversationMessagesInProject(
  project: SqliteDatabase,
  conversationId: string,
  updatedAt: string,
): Promise<boolean> {
  const id = conversationId.trim();
  if (id.length === 0) return false;
  const current = findConversation(project, id);
  if (updatedAt.length === 0) throw new Error('conversation row is incomplete');
  const remove = project.prepare('DELETE FROM ai_messages WHERE conversation_id = ?');
  const stamp = project.prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?');
  project.transaction(() => {
    remove.run(id);
    if (current !== undefined) stamp.run(updatedAt, id);
  })();
  const left = project.prepare('SELECT id FROM ai_messages WHERE conversation_id = ?').get(id);
  if (left !== undefined) throw new StorageReadbackError('clearAiConversationMessages');
  if (current === undefined) return false;
  const stored = findConversation(project, id);
  if (stored === undefined || stored.updatedAt !== updatedAt) {
    throw new StorageReadbackError('clearAiConversationMessages');
  }
  return true;
}

export async function listAiMessagesByConversationInProject(
  project: SqliteDatabase,
  conversationId: string,
): Promise<AiMessageDoc[]> {
  const id = conversationId.trim();
  if (id.length === 0) return [];
  const rows = project
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC`)
    .all(id);
  return rows.map((row) => messageFromRow(row));
}

export async function patchAiMessageContentInProject(
  project: SqliteDatabase,
  id: string,
  patch: MessagePatch,
): Promise<void> {
  const key = id.trim();
  if (key.length === 0) return;
  const row = project.prepare(`SELECT ${MESSAGE_COLUMNS} FROM ai_messages WHERE id = ?`).get(key);
  if (row === undefined) return;
  const current = messageFromRow(row);
  if (patch.updatedAt.length === 0) throw new Error('message row is incomplete');
  const status = messageStatus(patch.status);
  const errorMessage = patch.errorMessage !== undefined ? patch.errorMessage : current.errorMessage;
  const update = project.prepare(
    'UPDATE ai_messages SET content = ?, status = ?, error_message = ?, updated_at = ? WHERE id = ?',
  );
  project.transaction(() => {
    update.run(patch.content, status, errorMessage ?? null, patch.updatedAt, key);
  })();
  const after = project.prepare(`SELECT ${MESSAGE_COLUMNS} FROM ai_messages WHERE id = ?`).get(key);
  if (after === undefined) throw new StorageReadbackError('patchAiMessageContent');
  const stored = messageFromRow(after);
  if (
    stored.content !== patch.content ||
    stored.status !== status ||
    stored.updatedAt !== patch.updatedAt ||
    (patch.errorMessage !== undefined && stored.errorMessage !== patch.errorMessage)
  ) {
    throw new StorageReadbackError('patchAiMessageContent');
  }
}

export function aiConversationMethods(project: () => SqliteDatabase) {
  return {
    async listRecentAiConversations(limit: number) {
      return listRecentAiConversationsInProject(project(), limit);
    },
    async readAiConversation(id: string) {
      return readAiConversationInProject(project(), id);
    },
    async patchAiConversation(id: string, patch: ConversationPatch) {
      return patchAiConversationInProject(project(), id, patch);
    },
    async clearAiConversationMessages(conversationId: string, updatedAt: string) {
      return clearAiConversationMessagesInProject(project(), conversationId, updatedAt);
    },
    async listAiMessagesByConversation(conversationId: string) {
      return listAiMessagesByConversationInProject(project(), conversationId);
    },
    async patchAiMessageContent(id: string, patch: MessagePatch) {
      return patchAiMessageContentInProject(project(), id, patch);
    },
  };
}
