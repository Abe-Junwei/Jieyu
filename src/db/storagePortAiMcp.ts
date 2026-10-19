import { getDb } from './engine';
import { validateAuditLogDoc, validateExternalMcpTrustDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiSourceSetDoc, AuditLogDocType, ExternalMcpTrustDoc } from './types';

export async function listExternalMcpTrustEntries(): Promise<ExternalMcpTrustDoc[]> {
  const database = await getDb();
  // shortcut(P2-3): 全局表，量小 | global table, small
  return database.dexie.external_mcp_trust.toArray();
}

export async function readExternalMcpTrust(id: string): Promise<ExternalMcpTrustDoc | undefined> {
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.external_mcp_trust.get(id);
}

export async function insertExternalMcpTrust(
  doc: ExternalMcpTrustDoc,
): Promise<ExternalMcpTrustDoc> {
  validateExternalMcpTrustDoc(doc);
  const database = await getDb();
  await database.dexie.external_mcp_trust.put(doc);
  const stored = await database.dexie.external_mcp_trust.get(doc.id);
  if (!stored || stored.id !== doc.id) throw new StorageReadbackError('insertExternalMcpTrust');
  return stored;
}

/** Full-row assign, matching collection `update` of a complete trust document. */
export async function updateExternalMcpTrust(
  doc: ExternalMcpTrustDoc,
): Promise<ExternalMcpTrustDoc> {
  validateExternalMcpTrustDoc(doc);
  const database = await getDb();
  const updated = await database.dexie.external_mcp_trust.update(doc.id, doc);
  if (updated === 0) throw new StorageReadbackError('updateExternalMcpTrust');
  const stored = await database.dexie.external_mcp_trust.get(doc.id);
  if (!stored || stored.id !== doc.id) throw new StorageReadbackError('updateExternalMcpTrust');
  return stored;
}

export async function insertExternalMcpTrustAudit(doc: AuditLogDocType): Promise<void> {
  validateAuditLogDoc(doc);
  const database = await getDb();
  await database.dexie.audit_logs.put(doc);
  const stored = await database.dexie.audit_logs.get(doc.id);
  if (!stored || stored.id !== doc.id)
    throw new StorageReadbackError('insertExternalMcpTrustAudit');
}

export async function listAiSourceSets(): Promise<AiSourceSetDoc[]> {
  const database = await getDb();
  // shortcut(P2-3): 全局表，量小 | global table, small
  return database.dexie.ai_source_sets.toArray();
}

export async function readAiSourceSet(id: string): Promise<AiSourceSetDoc | undefined> {
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_source_sets.get(id);
}
