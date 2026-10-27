import { createHash } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';

const RECEIPTS = `
CREATE TABLE IF NOT EXISTS diagnostic_receipts (
  origin_project_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  event_seq INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (origin_project_id, operation_id, event_seq)
);
`;

export interface DiagnosticReceipt {
  originProjectId: string;
  operationId: string;
  eventSeq: number;
  payloadHash: string;
}

let storeFile: string | null = null;

export function useDiagnosticStore(file: string | null): void {
  storeFile = file;
}

export function diagnosticStoreFile(): string | null {
  return storeFile;
}

/** Desktop host: receipts live under userData, outside any project folder. */
export function configureDesktopDiagnosticStore(userDataRoot: string): void {
  useDiagnosticStore(path.join(userDataRoot, 'diagnostics.sqlite'));
}

export function payloadHash(summary: unknown): string {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex');
}

/** Idempotent insert into the userData file. A different hash for the same identity is left untouched. */
export function receiveDiagnostic(file: string, receipt: DiagnosticReceipt): void {
  const db = new Database(file);
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec(RECEIPTS);
    const write = db.transaction(() => {
      const existing = db
        .prepare(
          `SELECT payload_hash FROM diagnostic_receipts
           WHERE origin_project_id = ? AND operation_id = ? AND event_seq = ?`,
        )
        .get(receipt.originProjectId, receipt.operationId, receipt.eventSeq) as
        { payload_hash: string } | undefined;
      if (existing === undefined) {
        db.prepare(
          `INSERT INTO diagnostic_receipts (
             origin_project_id, operation_id, event_seq, payload_hash, received_at
           ) VALUES (?, ?, ?, ?, ?)`,
        ).run(
          receipt.originProjectId,
          receipt.operationId,
          receipt.eventSeq,
          receipt.payloadHash,
          new Date().toISOString(),
        );
        return;
      }
      if (existing.payload_hash !== receipt.payloadHash) {
        throw new Error('diagnostic payload conflict');
      }
    });
    write();
  } finally {
    db.close();
  }
}
