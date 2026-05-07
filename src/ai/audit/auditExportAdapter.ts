import type { AuditLogDocType } from '../../db/types';

export interface AuditExportRow {
  id: string;
  collection: string;
  documentId: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  source: string;
  timestamp: string;
  requestId?: string;
  metadataJson?: string;
}

export function auditDocToExportRow(doc: AuditLogDocType): AuditExportRow {
  return {
    id: doc.id,
    collection: doc.collection,
    documentId: doc.documentId,
    action: doc.action,
    ...(doc.field !== undefined ? { field: doc.field } : {}),
    ...(doc.oldValue !== undefined ? { oldValue: doc.oldValue } : {}),
    ...(doc.newValue !== undefined ? { newValue: doc.newValue } : {}),
    source: doc.source,
    timestamp: doc.timestamp,
    ...(doc.requestId !== undefined ? { requestId: doc.requestId } : {}),
    ...(doc.metadataJson !== undefined ? { metadataJson: doc.metadataJson } : {}),
  };
}

export function auditDocsToNdjson(docs: readonly AuditLogDocType[]): string {
  const rows = docs.map(auditDocToExportRow);
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '');
}
