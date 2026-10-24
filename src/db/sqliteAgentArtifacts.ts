/**
 * Agent artifacts live in the project library (ADR-0081).
 * The artifact row commits first. The audit row then commits in userData.
 * A failed audit leaves the artifact. A failed read-back does not undo.
 */
import Database from 'better-sqlite3';
import { validateAgentArtifactDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AgentArtifactDoc, AuditLogDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

const COLUMNS =
  'id, schema_version, kind, uri, title, mime_type, body_json, agent_run_id, adoption_item_id, created_at';

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) throw new Error('artifact row is incomplete');
  return value as Record<string, unknown>;
}

function artifactFromRow(row: Record<string, unknown>): AgentArtifactDoc {
  const createdAt = row.created_at;
  if (typeof createdAt !== 'string' || createdAt.length === 0) {
    throw new Error('artifact row is incomplete');
  }
  const doc: Record<string, unknown> = {
    id: row.id,
    schemaVersion: row.schema_version,
    kind: row.kind,
    uri: row.uri,
    title: row.title,
    mimeType: row.mime_type,
    bodyJson: row.body_json,
    createdAt,
  };
  if (typeof row.agent_run_id === 'string') doc.agentRunId = row.agent_run_id;
  if (typeof row.adoption_item_id === 'string') doc.adoptionItemId = row.adoption_item_id;
  return doc as unknown as AgentArtifactDoc;
}

function readRow(project: SqliteDatabase, id: string): AgentArtifactDoc | undefined {
  const row = record(
    project.prepare(`SELECT ${COLUMNS} FROM agent_artifacts WHERE id = ?`).get(id),
  );
  return row === undefined ? undefined : artifactFromRow(row);
}

export async function readAgentArtifactInProject(
  project: SqliteDatabase,
  id: string,
): Promise<AgentArtifactDoc | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  return readRow(project, key);
}

export async function saveAgentArtifactInProject(
  project: SqliteDatabase,
  userData: SqliteDatabase,
  doc: AgentArtifactDoc,
  audit: AuditLogDocType,
): Promise<AgentArtifactDoc> {
  const id = doc.id.trim();
  if (id.length === 0 || audit.documentId.trim() !== id) {
    throw new StorageReadbackError('saveAgentArtifact');
  }
  const row: AgentArtifactDoc = { ...doc, id };
  validateAgentArtifactDoc(row);
  const auditRow: AuditLogDocType = { ...audit, documentId: id };
  const upsert = project.prepare(
    `INSERT INTO agent_artifacts (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       schema_version = excluded.schema_version,
       kind = excluded.kind,
       uri = excluded.uri,
       title = excluded.title,
       mime_type = excluded.mime_type,
       body_json = excluded.body_json,
       agent_run_id = excluded.agent_run_id,
       adoption_item_id = excluded.adoption_item_id,
       created_at = excluded.created_at`,
  );
  project.transaction(() => {
    upsert.run(
      id,
      row.schemaVersion,
      row.kind,
      row.uri,
      row.title,
      row.mimeType,
      row.bodyJson,
      row.agentRunId ?? null,
      row.adoptionItemId ?? null,
      row.createdAt,
    );
  })();
  const stored = readRow(project, id);
  if (stored === undefined || stored.uri !== row.uri || stored.createdAt !== row.createdAt) {
    throw new StorageReadbackError('saveAgentArtifact');
  }
  const json = JSON.stringify(auditRow);
  userData.transaction(() => {
    userData
      .prepare(
        `INSERT INTO audit_logs (id, timestamp, payload_json) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET timestamp = excluded.timestamp, payload_json = excluded.payload_json`,
      )
      .run(auditRow.id, auditRow.timestamp, json);
  })();
  const storedAudit = record(
    userData.prepare('SELECT payload_json FROM audit_logs WHERE id = ?').get(auditRow.id),
  );
  if (storedAudit === undefined || storedAudit.payload_json !== json) {
    throw new StorageReadbackError('saveAgentArtifact');
  }
  const payload = JSON.parse(String(storedAudit.payload_json)) as { documentId?: unknown };
  if (payload.documentId !== id) throw new StorageReadbackError('saveAgentArtifact');
  return stored;
}

export function agentArtifactMethods(project: () => SqliteDatabase, userData: SqliteDatabase) {
  return {
    async readAgentArtifact(id: string) {
      return readAgentArtifactInProject(project(), id);
    },
    async saveAgentArtifact(doc: AgentArtifactDoc, audit: AuditLogDocType) {
      return saveAgentArtifactInProject(project(), userData, doc, audit);
    },
  };
}
