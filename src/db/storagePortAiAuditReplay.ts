import { getDb } from './engine';
import type { AuditLogDocType } from './types';

export async function listRecentAuditLogsByCollectionField(
  collection: string,
  field: string,
  limit: number,
): Promise<AuditLogDocType[]> {
  const database = await getDb();
  return database.dexie.audit_logs
    .where('[collection+field+timestamp]')
    .between([collection, field, ''], [collection, field, '\uffff'])
    .reverse()
    .limit(limit)
    .toArray();
}

export async function listAuditLogsByRequestId(requestId: string): Promise<AuditLogDocType[]> {
  const database = await getDb();
  return database.dexie.audit_logs.where('requestId').equals(requestId).toArray();
}
