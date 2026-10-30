import type Database from 'better-sqlite3';
import {
  diagnosticStoreFile,
  payloadHash,
  receiveDiagnostic,
  type DiagnosticReceipt,
} from './diagnosticDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

export type FieldDelivery = 'unchanged' | 'pending' | 'confirmed';

interface DeliveryRow {
  origin_project_id: string;
  operation_id: string;
  event_seq: number;
  payload_hash: string;
  input_fingerprint: string;
  summary_json: string;
  status: 'pending' | 'confirmed';
}

export interface StoredDelivery {
  receipt: DiagnosticReceipt;
  status: 'pending' | 'confirmed';
  summary: unknown;
}

export function replayDelivery<R>(
  db: SqliteDatabase,
  operationId: string,
  fingerprint: string,
  read: (summary: unknown) => R,
): { reading: R; receipt: DiagnosticReceipt; status: 'pending' | 'confirmed' } | null {
  const row = findDelivery(db, operationId);
  if (row === null) return null;
  if (row.input_fingerprint !== fingerprint) throw new Error('diagnostic delivery conflict');
  const stored = storedDelivery(row);
  return { reading: read(stored.summary), receipt: stored.receipt, status: stored.status };
}

export function resumeDelivery<R extends object>(
  db: SqliteDatabase,
  operationId: string,
  read: (summary: unknown) => R,
): Omit<R, 'delivery'> & { delivery: 'pending' | 'confirmed' } {
  const row = findDelivery(db, operationId);
  if (row === null) throw new Error('diagnostic delivery is missing');
  const stored = storedDelivery(row);
  return finishFieldDelivery(db, read(stored.summary), stored.receipt, stored.status);
}

export function recordPendingDelivery(
  db: SqliteDatabase,
  input: { operationId: string; fingerprint: string; summary: unknown },
): DiagnosticReceipt {
  const hash = payloadHash(input.summary);
  const origin = originProjectId(db);
  db.prepare(
    `INSERT INTO diagnostic_deliveries (
       origin_project_id, operation_id, event_seq, payload_hash, input_fingerprint, summary_json, status
     ) VALUES (?, ?, 0, ?, ?, ?, 'pending')`,
  ).run(origin, input.operationId, hash, input.fingerprint, JSON.stringify(input.summary));
  return {
    originProjectId: origin,
    operationId: input.operationId,
    eventSeq: 0,
    payloadHash: hash,
  };
}

export function finishFieldDelivery<T extends object>(
  db: SqliteDatabase,
  reading: T,
  receipt: DiagnosticReceipt,
  current: FieldDelivery,
): Omit<T, 'delivery'> & { delivery: 'pending' | 'confirmed' } {
  const file = diagnosticStoreFile();
  if (file === null) {
    return { ...reading, delivery: current === 'confirmed' ? 'confirmed' : 'pending' };
  }
  try {
    receiveDiagnostic(file, receipt);
  } catch (error) {
    if (error instanceof Error && error.message === 'diagnostic payload conflict') throw error;
    return { ...reading, delivery: 'pending' };
  }
  db.prepare(
    `UPDATE diagnostic_deliveries SET status = 'confirmed'
     WHERE origin_project_id = ? AND operation_id = ? AND event_seq = ?`,
  ).run(receipt.originProjectId, receipt.operationId, receipt.eventSeq);
  return { ...reading, delivery: 'confirmed' };
}

function storedDelivery(row: DeliveryRow): StoredDelivery {
  return {
    receipt: {
      originProjectId: row.origin_project_id,
      operationId: row.operation_id,
      eventSeq: row.event_seq,
      payloadHash: row.payload_hash,
    },
    status: row.status,
    summary: JSON.parse(row.summary_json) as unknown,
  };
}

function originProjectId(db: SqliteDatabase): string {
  const rows = db.prepare('SELECT id FROM project').all() as { id: string }[];
  const only = rows[0];
  if (rows.length !== 1 || only === undefined) throw new Error('project is missing');
  return only.id;
}

function findDelivery(db: SqliteDatabase, operationId: string): DeliveryRow | null {
  const rows = db
    .prepare(
      `SELECT origin_project_id, operation_id, event_seq, payload_hash, input_fingerprint, summary_json, status
       FROM diagnostic_deliveries WHERE operation_id = ?`,
    )
    .all(operationId) as DeliveryRow[];
  const row = rows[0];
  if (row === undefined) return null;
  if (rows.length !== 1) throw new Error('diagnostic delivery is invalid');
  return row;
}
