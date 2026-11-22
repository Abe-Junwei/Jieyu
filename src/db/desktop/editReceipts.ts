import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export type EditReceiptKind =
  | 'create'
  | 'moveEdge'
  | 'moveSharedBoundary'
  | 'moveUnit'
  | 'delete'
  | 'deleteMany'
  | 'undo'
  | 'redo';

export type EditInspection =
  { status: 'committed'; result: unknown } | { status: 'not-submitted' } | { status: 'conflict' };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** kind + payload without the operation id. */
export function editDigest(kind: EditReceiptKind, payload: Record<string, unknown>): string {
  const { operationId: _ignored, ...rest } = payload;
  return createHash('sha256')
    .update(`${kind}\n${stable(rest)}`)
    .digest('hex');
}

interface ReceiptRow {
  digest: string;
  result_json: string;
}

function receiptOf(db: SqliteDatabase, operationId: string): ReceiptRow | undefined {
  return db
    .prepare('SELECT digest, result_json FROM edit_receipts WHERE operation_id = ?')
    .get(operationId) as ReceiptRow | undefined;
}

/**
 * Runs `exec` and writes the receipt in one transaction. A known id with the same digest returns the
 * stored result without running again; a different digest is an operation id conflict.
 */
export function withEditReceipt<T>(
  db: SqliteDatabase,
  receipt: {
    operationId: string | undefined;
    kind: EditReceiptKind;
    payload: Record<string, unknown>;
    manuscriptId: (value: T) => string;
  },
  exec: () => T,
): T {
  const { operationId } = receipt;
  if (operationId === undefined) return exec();
  const digest = editDigest(receipt.kind, receipt.payload);
  const run = db.transaction((): T => {
    const row = receiptOf(db, operationId);
    if (row !== undefined) {
      if (row.digest !== digest) throw new Error('operation id conflict');
      return JSON.parse(row.result_json) as T;
    }
    const value = exec();
    const manuscriptId = receipt.manuscriptId(value);
    db.prepare(
      `INSERT INTO edit_receipts (operation_id, kind, digest, manuscript_id, result_json, committed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      operationId,
      receipt.kind,
      digest,
      manuscriptId,
      JSON.stringify(value ?? null),
      new Date().toISOString(),
    );
    return value;
  });
  return run();
}

export function inspectEditReceipt(
  db: SqliteDatabase,
  input: { operationId: string; kind: EditReceiptKind; payload: Record<string, unknown> },
): EditInspection {
  const row = receiptOf(db, input.operationId);
  if (row === undefined) return { status: 'not-submitted' };
  if (row.digest !== editDigest(input.kind, input.payload)) return { status: 'conflict' };
  return { status: 'committed', result: JSON.parse(row.result_json) as unknown };
}
