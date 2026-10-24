/**
 * 审计列表在本机 userData 的 audit_logs.payload_json 里。
 * 不另加列。按已写入的 collection，或 collection、field、requestId 一起过滤。
 */
import Database from 'better-sqlite3';
import { StorageReadbackError } from './storageReadbackError';
import type { AuditLogDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

function payload(json: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new StorageReadbackError('listAuditLogs');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StorageReadbackError('listAuditLogs');
  }
  return value as Record<string, unknown>;
}

function textField(row: Record<string, unknown>, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return undefined;
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('audit row is incomplete');
  return value;
}

function logs(db: SqliteDatabase): Record<string, unknown>[] {
  const rows: unknown = db.prepare('SELECT payload_json FROM audit_logs ORDER BY id').all();
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null) throw new StorageReadbackError('listAuditLogs');
    const json = (row as { payload_json?: unknown }).payload_json;
    if (typeof json !== 'string') throw new StorageReadbackError('listAuditLogs');
    return payload(json);
  });
}

export function auditListMethods(db: SqliteDatabase) {
  return {
    async listAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]> {
      const id = collection.trim();
      if (id.length === 0) return [];
      return logs(db).filter(
        (row) => textField(row, 'collection') === id,
      ) as unknown as AuditLogDocType[];
    },
    async listAuditLogsByFieldRequest(
      collection: string,
      field: string,
      requestId: string,
    ): Promise<AuditLogDocType[]> {
      const collectionId = collection.trim();
      const fieldId = field.trim();
      const request = requestId.trim();
      if (collectionId.length === 0 || fieldId.length === 0 || request.length === 0) return [];
      return logs(db).filter(
        (row) =>
          textField(row, 'collection') === collectionId &&
          textField(row, 'field') === fieldId &&
          textField(row, 'requestId') === request,
      ) as unknown as AuditLogDocType[];
    },
  };
}
