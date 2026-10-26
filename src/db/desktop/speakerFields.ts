import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  diagnosticStoreFile,
  payloadHash,
  receiveDiagnostic,
  type DiagnosticReceipt,
} from './diagnosticDelivery';
import {
  getSpeaker,
  notesOf,
  type Speaker,
  type SpeakerAccess,
  type SpeakerConsent,
  type SpeakerFieldRevisions,
  type SpeakerRole,
} from './speakers';

type SqliteDatabase = InstanceType<typeof Database>;

export interface SpeakerReading extends Speaker {
  delivery: 'unchanged' | 'pending' | 'confirmed';
}

interface FieldPatch<T> {
  expectedRevision: number;
  value: T;
}

export interface SpeakerPatch {
  operationId: string;
  id: string;
  name?: FieldPatch<string>;
  pseudonym?: FieldPatch<string | null>;
  gender?: FieldPatch<string | null>;
  birthYear?: FieldPatch<number | null>;
  languageIds?: FieldPatch<string[] | null>;
  dialect?: FieldPatch<string | null>;
  accent?: FieldPatch<string | null>;
  role?: FieldPatch<SpeakerRole | null>;
  consentStatus?: FieldPatch<SpeakerConsent | null>;
  accessRights?: FieldPatch<SpeakerAccess | null>;
  address?: FieldPatch<string | null>;
  notes?: FieldPatch<Record<string, string> | null>;
}

interface DeliveryRow {
  origin_project_id: string;
  operation_id: string;
  event_seq: number;
  payload_hash: string;
  input_fingerprint: string;
  summary_json: string;
  status: 'pending' | 'confirmed';
}

export function patchSpeaker(db: SqliteDatabase, input: SpeakerPatch): SpeakerReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishDelivery(
    db,
    applied.reading,
    applied.receipt,
    applied.reading.delivery === 'confirmed' ? 'confirmed' : 'pending',
  );
}

export function redeliverSpeaker(db: SqliteDatabase, operationId: string): SpeakerReading {
  const row = requireDelivery(db, operationId);
  const summary = JSON.parse(row.summary_json) as { speakerId?: unknown };
  if (typeof summary.speakerId !== 'string') throw new Error('diagnostic delivery is invalid');
  const speaker = getSpeaker(db, summary.speakerId);
  if (speaker === null) throw new Error('speaker is missing');
  return finishDelivery(
    db,
    { ...speaker, delivery: row.status },
    {
      originProjectId: row.origin_project_id,
      operationId: row.operation_id,
      eventSeq: row.event_seq,
      payloadHash: row.payload_hash,
    },
    row.status,
  );
}

function finishDelivery(
  db: SqliteDatabase,
  reading: SpeakerReading,
  receipt: DiagnosticReceipt,
  current: 'pending' | 'confirmed' = 'pending',
): SpeakerReading {
  const file = diagnosticStoreFile();
  if (file === null)
    return { ...reading, delivery: current === 'confirmed' ? 'confirmed' : 'pending' };
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

function applyPatch(
  db: SqliteDatabase,
  input: SpeakerPatch,
): { reading: SpeakerReading; receipt: DiagnosticReceipt | null } {
  const fingerprint = inputFingerprint(input);
  const existing = findDelivery(db, input.operationId);
  if (existing !== null) {
    if (existing.input_fingerprint !== fingerprint) throw new Error('diagnostic delivery conflict');
    const summary = JSON.parse(existing.summary_json) as { speakerId?: unknown };
    if (typeof summary.speakerId !== 'string') throw new Error('diagnostic delivery is invalid');
    const speaker = getSpeaker(db, summary.speakerId);
    if (speaker === null) throw new Error('speaker is missing');
    return {
      reading: { ...speaker, delivery: existing.status },
      receipt: {
        originProjectId: existing.origin_project_id,
        operationId: existing.operation_id,
        eventSeq: existing.event_seq,
        payloadHash: existing.payload_hash,
      },
    };
  }
  const current = getSpeaker(db, input.id);
  if (current === null) throw new Error('speaker is missing');
  const name = take(input.name, current.revisions.name, current.name, 'name');
  const pseudonym = take(
    input.pseudonym,
    current.revisions.pseudonym,
    current.pseudonym,
    'pseudonym',
  );
  const gender = take(input.gender, current.revisions.gender, current.gender, 'gender');
  const birthYear = take(
    input.birthYear,
    current.revisions.birthYear,
    current.birthYear,
    'birthYear',
  );
  const languageIds = take(
    input.languageIds,
    current.revisions.languageIds,
    current.languageIds,
    'languageIds',
  );
  const dialect = take(input.dialect, current.revisions.dialect, current.dialect, 'dialect');
  const accent = take(input.accent, current.revisions.accent, current.accent, 'accent');
  const role = take(input.role, current.revisions.role, current.role, 'role');
  const consentStatus = take(
    input.consentStatus,
    current.revisions.consentStatus,
    current.consentStatus,
    'consentStatus',
  );
  const accessRights = take(
    input.accessRights,
    current.revisions.accessRights,
    current.accessRights,
    'accessRights',
  );
  const address = take(input.address, current.revisions.address, current.address, 'address');
  const notes = take(cleanNotesPatch(input.notes), current.revisions.notes, current.notes, 'notes');
  const revisions: SpeakerFieldRevisions = {
    name: name.revision,
    pseudonym: pseudonym.revision,
    gender: gender.revision,
    birthYear: birthYear.revision,
    languageIds: languageIds.revision,
    dialect: dialect.revision,
    accent: accent.revision,
    role: role.revision,
    consentStatus: consentStatus.revision,
    accessRights: accessRights.revision,
    address: address.revision,
    notes: notes.revision,
  };
  const changed = (
    [
      ['name', name.changed],
      ['pseudonym', pseudonym.changed],
      ['gender', gender.changed],
      ['birthYear', birthYear.changed],
      ['languageIds', languageIds.changed],
      ['dialect', dialect.changed],
      ['accent', accent.changed],
      ['role', role.changed],
      ['consentStatus', consentStatus.changed],
      ['accessRights', accessRights.changed],
      ['address', address.changed],
      ['notes', notes.changed],
    ] as const
  )
    .filter((entry) => entry[1])
    .map((entry) => entry[0]);
  if (changed.length === 0)
    return { reading: { ...current, delivery: 'unchanged' }, receipt: null };
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE speakers
     SET name = ?, pseudonym = ?, gender = ?, birth_year = ?, language_ids_json = ?,
         dialect = ?, accent = ?, role = ?, consent_status = ?, access_rights = ?,
         address = ?, notes_json = ?, field_revisions_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    name.value,
    pseudonym.value,
    gender.value,
    birthYear.value,
    languageIds.value === null ? null : JSON.stringify(languageIds.value),
    dialect.value,
    accent.value,
    role.value,
    consentStatus.value,
    accessRights.value,
    address.value,
    notes.value === null ? null : JSON.stringify(notes.value),
    JSON.stringify(revisions),
    updatedAt,
    current.id,
  );
  const summary = { speakerId: current.id, fields: changed, revisions };
  const hash = payloadHash(summary);
  const origin = originProjectId(db);
  db.prepare(
    `INSERT INTO diagnostic_deliveries (
       origin_project_id, operation_id, event_seq, payload_hash, input_fingerprint, summary_json, status
     ) VALUES (?, ?, 0, ?, ?, ?, 'pending')`,
  ).run(origin, input.operationId, hash, fingerprint, JSON.stringify(summary));
  const stored = getSpeaker(db, current.id);
  if (stored === null) throw new Error('speaker readback failed');
  return {
    reading: { ...stored, delivery: 'pending' },
    receipt: {
      originProjectId: origin,
      operationId: input.operationId,
      eventSeq: 0,
      payloadHash: hash,
    },
  };
}

function take<T>(
  patch: FieldPatch<T> | undefined,
  revision: number,
  value: T,
  name: string,
): { value: T; revision: number; changed: boolean } {
  if (patch === undefined) return { value, revision, changed: false };
  if (patch.expectedRevision !== revision) throw new Error(`speaker field conflict: ${name}`);
  if (same(patch.value, value)) return { value, revision, changed: false };
  return { value: patch.value, revision: revision + 1, changed: true };
}

function cleanNotesPatch(
  patch: FieldPatch<Record<string, string> | null> | undefined,
): FieldPatch<Record<string, string> | null> | undefined {
  if (patch === undefined || patch.value === null) return patch;
  const notes = notesOf(JSON.stringify(patch.value));
  const keys = Object.keys(notes ?? {}).sort();
  if (keys.length === 0) throw new Error('speaker notes are invalid');
  const ordered: Record<string, string> = {};
  for (const key of keys) {
    const text = notes?.[key];
    if (text === undefined || text.length === 0) throw new Error('speaker notes are invalid');
    ordered[key] = text;
  }
  return { expectedRevision: patch.expectedRevision, value: ordered };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function originProjectId(db: SqliteDatabase): string {
  const rows = db.prepare('SELECT id FROM project').all() as { id: string }[];
  const only = rows[0];
  if (rows.length !== 1 || only === undefined) throw new Error('project is missing');
  return only.id;
}

function requireDelivery(db: SqliteDatabase, operationId: string): DeliveryRow {
  const row = findDelivery(db, operationId);
  if (row === null) throw new Error('diagnostic delivery is missing');
  return row;
}

function findDelivery(db: SqliteDatabase, operationId: string): DeliveryRow | null {
  const rows = db
    .prepare('SELECT * FROM diagnostic_deliveries WHERE operation_id = ?')
    .all(operationId) as DeliveryRow[];
  const row = rows[0];
  if (row === undefined) return null;
  if (rows.length !== 1) throw new Error('diagnostic delivery is invalid');
  return row;
}

function inputFingerprint(input: SpeakerPatch): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
