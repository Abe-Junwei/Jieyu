import { getDb } from '../../db';
import type { AiConversationDoc } from '../../db/types';
import type { AiConversationListItem } from './aiConversationManager.types';
import { toAiConversationListItem } from './aiConversationManager.types';

export function isConversationCleared(row: AiConversationDoc): boolean {
  return typeof row.clearedAt === 'string' && row.clearedAt.length > 0;
}

export function isConversationVisibleInList(row: AiConversationDoc): boolean {
  if (row.archived === true) return false;
  if (isConversationCleared(row)) return false;
  return true;
}

export function isConversationArchivedVisible(row: AiConversationDoc): boolean {
  if (row.archived !== true) return false;
  if (isConversationCleared(row)) return false;
  return true;
}

function matchesTextIdScope(row: AiConversationDoc, textId?: string): boolean {
  if (!textId) return true;
  return row.textId === textId;
}

/** G1c: scoped by `textId` when provided; otherwise global active rows. */
export function matchesConversationScope(row: AiConversationDoc, textId?: string): boolean {
  if (!isConversationVisibleInList(row)) return false;
  return matchesTextIdScope(row, textId);
}

/** G2a: archived rows for "view archived" list. */
export function matchesArchivedConversationScope(row: AiConversationDoc, textId?: string): boolean {
  if (!isConversationArchivedVisible(row)) return false;
  return matchesTextIdScope(row, textId);
}

export function sortConversationsByUpdatedAtDesc(rows: AiConversationDoc[]): AiConversationDoc[] {
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function pickLatestConversationInScope(
  rows: AiConversationDoc[],
  textId?: string,
): AiConversationDoc | null {
  const scoped = rows.filter((row) => matchesConversationScope(row, textId));
  if (scoped.length === 0) return null;
  return sortConversationsByUpdatedAtDesc(scoped)[0] ?? null;
}

/** Cap list/bootstrap queries to recent rows (G1g spirit). */
export const MAX_CONVERSATION_LIST_ROWS = 200;

export async function fetchAllConversationRows(): Promise<AiConversationDoc[]> {
  const db = await getDb();
  return db.dexie.ai_conversations
    .orderBy('updatedAt')
    .reverse()
    .limit(MAX_CONVERSATION_LIST_ROWS)
    .toArray();
}

export async function listConversationsInScope(textId?: string): Promise<AiConversationListItem[]> {
  const rows = await fetchAllConversationRows();
  return sortConversationsByUpdatedAtDesc(
    rows.filter((row) => matchesConversationScope(row, textId)),
  ).map(toAiConversationListItem);
}

export async function listArchivedConversationsInScope(
  textId?: string,
): Promise<AiConversationListItem[]> {
  const rows = await fetchAllConversationRows();
  return sortConversationsByUpdatedAtDesc(
    rows.filter((row) => matchesArchivedConversationScope(row, textId)),
  ).map(toAiConversationListItem);
}
