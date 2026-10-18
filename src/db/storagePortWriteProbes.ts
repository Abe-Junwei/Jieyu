import { getDb } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import type {
  AiMessageDoc,
  AuditLogDocType,
  LayerUnitDocType,
  TierDefinitionDocType,
} from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function countPresentLayerUnits(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const database = await getDb();
  const rows = await database.dexie.layer_units.bulkGet([...ids]);
  return rows.filter((row) => row != null).length;
}

export async function listLayerUnitIdsByText(textId: string): Promise<string[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  const keys = await database.dexie.layer_units.where('textId').equals(id).primaryKeys();
  return keys.map((key) => String(key));
}

export async function listLayerUnitsAtMediaStart(
  mediaId: string,
  startTime: number,
): Promise<LayerUnitDocType[]> {
  const id = trimmed(mediaId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.layer_units.where('[mediaId+startTime]').equals([id, startTime]).toArray();
}

export async function readTierDefinition(
  layerId: string,
): Promise<TierDefinitionDocType | undefined> {
  const id = trimmed(layerId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.tier_definitions.get(id);
}

export async function listTierIdsByContentLanguage(
  contentType: TierDefinitionDocType['contentType'],
  languageId: string,
): Promise<string[]> {
  const language = trimmed(languageId);
  if (language.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.tier_definitions
    .where('contentType')
    .equals(contentType)
    .toArray();
  return rows.filter((row) => row.languageId === language).map((row) => row.id);
}

export interface AiMessageContentPatch {
  content: string;
  status: AiMessageDoc['status'];
  errorMessage?: string;
  updatedAt: string;
}

export async function listAiMessagesByConversation(
  conversationId: string,
): Promise<AiMessageDoc[]> {
  const id = trimmed(conversationId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.ai_messages.where('conversationId').equals(id).toArray();
}

export async function listAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]> {
  const id = trimmed(collection);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.audit_logs.where('collection').equals(id).toArray();
}

export async function listAuditLogsByFieldRequest(
  collection: string,
  field: string,
  requestId: string,
): Promise<AuditLogDocType[]> {
  const collectionId = trimmed(collection);
  const fieldId = trimmed(field);
  const request = trimmed(requestId);
  if (collectionId.length === 0 || fieldId.length === 0 || request.length === 0) return [];
  const database = await getDb();
  return database.dexie.audit_logs
    .where('[collection+field+requestId]')
    .equals([collectionId, fieldId, request])
    .toArray();
}
export async function patchAiMessageContent(
  id: string,
  patch: AiMessageContentPatch,
): Promise<void> {
  const messageId = trimmed(id);
  if (messageId.length === 0) return;
  const database = await getDb();
  const current = await database.dexie.ai_messages.get(messageId);
  if (!current) return;
  const next: AiMessageDoc = {
    ...current,
    content: patch.content,
    status: patch.status,
    updatedAt: patch.updatedAt,
    ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
  };
  await database.dexie.ai_messages.put(next);
  const stored = await database.dexie.ai_messages.get(messageId);
  if (
    !stored ||
    stored.content !== patch.content ||
    stored.status !== patch.status ||
    stored.updatedAt !== patch.updatedAt
  ) {
    throw new StorageReadbackError('patchAiMessageContent');
  }
}
