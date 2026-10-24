import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';
import type { AgentArtifactDoc, AuditLogDocType } from './types';

const NOW = '2026-10-24T01:00:00.000Z';
const LATER = '2026-10-24T02:00:00.000Z';
const roots: string[] = [];

function tempProject(): { root: string; folder: string; userData: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-artifacts-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  const db = new Database(join(folder, 'project.sqlite'));
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${PROJECT_APPLICATION_ID}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(`
    CREATE TABLE agent_artifacts (
      id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      kind TEXT NOT NULL,
      uri TEXT NOT NULL,
      title TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      body_json TEXT NOT NULL,
      agent_run_id TEXT,
      adoption_item_id TEXT,
      created_at TEXT
    );
  `);
  db.close();
  return { root, folder, userData: join(root, 'user-data.sqlite') };
}

function artifact(id: string, createdAt: string): AgentArtifactDoc {
  return {
    id,
    schemaVersion: 0,
    kind: 'workflow_output',
    uri: 'memory://report',
    title: 'Report',
    mimeType: 'application/json',
    bodyJson: '{"keep":true}',
    createdAt,
  };
}

function audit(id: string, documentId: string, createdAt: string): AuditLogDocType {
  return {
    id,
    collection: 'agent_artifacts',
    documentId,
    action: 'create',
    field: 'agent_artifact',
    newValue: 'memory://report',
    source: 'system',
    timestamp: createdAt,
    metadataJson: '{"kind":"workflow_output","uri":"memory://report"}',
  };
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite agent artifacts', () => {
  it('reads the created time after the files are closed and opened again', async () => {
    const { folder, userData } = tempProject();
    const first = openSqliteStoragePort(userData, folder);
    await first.port.saveAgentArtifact(artifact(' art ', NOW), audit('aud-1', 'art', NOW));
    await first.port.saveAgentArtifact(artifact('art', LATER), audit('aud-1', 'art', LATER));
    first.close();
    const again = openSqliteStoragePort(userData, folder);
    await expect(again.port.readAgentArtifact('art')).resolves.toMatchObject({
      id: 'art',
      uri: 'memory://report',
      createdAt: LATER,
      bodyJson: '{"keep":true}',
    });
    await expect(again.port.readAgentArtifact(' ')).resolves.toBeUndefined();
    await expect(again.port.audit.getAuditLog('aud-1')).resolves.toMatchObject({
      documentId: 'art',
      timestamp: LATER,
    });
    again.close();
  });

  it('refuses a migrated row whose created time is empty and leaves the row', async () => {
    const { folder, userData } = tempProject();
    const db = new Database(join(folder, 'project.sqlite'));
    db.prepare(
      `INSERT INTO agent_artifacts
        (id, schema_version, kind, uri, title, mime_type, body_json, created_at)
       VALUES ('old', 0, 'workflow_output', 'memory://old', 'Old', 'application/json', '{}', NULL)`,
    ).run();
    db.close();
    const opened = openSqliteStoragePort(userData, folder);
    await expect(opened.port.readAgentArtifact('old')).rejects.toThrow(
      'artifact row is incomplete',
    );
    opened.close();
    const check = new Database(join(folder, 'project.sqlite'));
    const row = check
      .prepare('SELECT id, created_at FROM agent_artifacts WHERE id = ?')
      .get('old') as {
      id: string;
      created_at: string | null;
    };
    check.close();
    expect(row).toEqual({ id: 'old', created_at: null });
  });

  it('leaves the artifact when the audit commit fails', async () => {
    const { folder, userData } = tempProject();
    const opened = openSqliteStoragePort(userData, folder);
    const side = new Database(userData);
    side.exec(`
      CREATE TRIGGER audit_fail BEFORE INSERT ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'audit blocked');
      END;
    `);
    side.close();
    await expect(
      opened.port.saveAgentArtifact(artifact('art-new', NOW), audit('aud-new', 'art-new', NOW)),
    ).rejects.toThrow('audit blocked');
    await expect(opened.port.readAgentArtifact('art-new')).resolves.toMatchObject({
      id: 'art-new',
      createdAt: NOW,
    });
    await expect(opened.port.audit.getAuditLog('aud-new')).resolves.toBeUndefined();
    opened.close();
  });

  it('rejects when no project folder is open', async () => {
    const { userData } = tempProject();
    const opened = openSqliteStoragePort(userData);
    await expect(opened.port.readAgentArtifact('art')).rejects.toThrow(
      'sqlite storage port has not opened a project folder',
    );
    await expect(
      opened.port.saveAgentArtifact(artifact('art', NOW), audit('aud', 'art', NOW)),
    ).rejects.toThrow('sqlite storage port has not opened a project folder');
    opened.close();
  });
});
