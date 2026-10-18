import { getDb } from './engine';
import { validateAgentArtifactDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AgentArtifactDoc, AuditLogDocType } from './types';
import { withTransaction } from './withTransaction';

export async function readAgentArtifact(id: string): Promise<AgentArtifactDoc | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.agent_artifacts.get(key);
}

/** 产物行和它的审计行是一次写入。审计失败时产物也不留下。 */
export async function saveAgentArtifact(
  doc: AgentArtifactDoc,
  audit: AuditLogDocType,
): Promise<AgentArtifactDoc> {
  const id = doc.id.trim();
  if (id.length === 0 || audit.documentId.trim() !== id) {
    throw new StorageReadbackError('saveAgentArtifact');
  }
  const row: AgentArtifactDoc = { ...doc, id };
  validateAgentArtifactDoc(row);
  const database = await getDb();
  await withTransaction(
    database,
    'rw',
    [database.dexie.agent_artifacts, database.dexie.audit_logs],
    async () => {
      await database.dexie.agent_artifacts.put(row);
      await database.dexie.audit_logs.put({ ...audit, documentId: id });
    },
    { label: 'saveAgentArtifact' },
  );
  const stored = await database.dexie.agent_artifacts.get(id);
  const storedAudit = await database.dexie.audit_logs.get(audit.id);
  if (
    !stored ||
    stored.id !== id ||
    stored.uri !== row.uri ||
    stored.createdAt !== row.createdAt ||
    !storedAudit ||
    storedAudit.documentId !== id
  ) {
    throw new StorageReadbackError('saveAgentArtifact');
  }
  return stored;
}
