/**
 * #280/#274：写一条审计行的存储操作，调用方不再直连 db 桶。
 * Storage op to insert one audit row so callers avoid the db barrel.
 */
import { getDb } from './engine';
import type { AuditLogDocType } from './types';

export async function insertAuditLog(row: AuditLogDocType): Promise<void> {
  const db = await getDb();
  await db.collections.audit_logs.insert(row);
}
