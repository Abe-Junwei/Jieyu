import { getDb } from './engine';
import { validateAuditLogDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AuditLogDocType } from './types';

export async function insertChatAuditLog(doc: AuditLogDocType): Promise<void> {
  const id = doc.id.trim();
  if (id.length === 0) throw new StorageReadbackError('insertChatAuditLog');
  const row: AuditLogDocType = { ...doc, id };
  validateAuditLogDoc(row);
  const database = await getDb();
  await database.dexie.audit_logs.put(row);
  const stored = await database.dexie.audit_logs.get(id);
  if (
    !stored ||
    stored.id !== id ||
    stored.timestamp !== row.timestamp ||
    stored.field !== row.field
  ) {
    throw new StorageReadbackError('insertChatAuditLog');
  }
}
