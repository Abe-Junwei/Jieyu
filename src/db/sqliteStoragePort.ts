/**
 * 存储接口的 SQLite 切片：本机 userData 里的回合和审计。
 * 一次写入是 better-sqlite3 的一次事务，提交后再读回（ADR-0048）。
 * 项目库和 `.jyd` 上的操作还没写。调用方传入文件路径，这里不安装成默认实现。
 */
import Database from 'better-sqlite3';
import { RecordingRemovalBlockedError, type StoragePort } from './storagePort';
import { StorageReadbackError } from './storageReadbackError';

type TurnRow = { conversationId: string; createdAt?: unknown; expiresAt?: unknown };

interface PayloadRow {
  payload_json: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_runtime_v2_turns (
  conversation_id TEXT PRIMARY KEY,
  created_at REAL NOT NULL,
  expires_at REAL NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
`;

function payload(json: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StorageReadbackError(label);
  }
  return value as Record<string, unknown>;
}

function notReady(method: string): () => Promise<never> {
  return () => Promise.reject(new Error(`sqlite storage port has not implemented ${method}`));
}

export function openSqliteStoragePort(file: string): { port: StoragePort; close: () => void } {
  const db = new Database(file);
  db.exec(SCHEMA);
  const writeTurn = db.prepare(
    `INSERT INTO ai_runtime_v2_turns (conversation_id, created_at, expires_at, payload_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       created_at = excluded.created_at,
       expires_at = excluded.expires_at,
       payload_json = excluded.payload_json`,
  );
  const readTurn = db.prepare(
    'SELECT payload_json FROM ai_runtime_v2_turns WHERE conversation_id = ?',
  );
  const deleteTurnSql = db.prepare('DELETE FROM ai_runtime_v2_turns WHERE conversation_id = ?');
  const deleteExpired = db.prepare('DELETE FROM ai_runtime_v2_turns WHERE expires_at < ?');
  const findExpired = db.prepare(
    'SELECT conversation_id FROM ai_runtime_v2_turns WHERE expires_at < ?',
  );
  const writeAudit = db.prepare(
    `INSERT INTO audit_logs (id, timestamp, payload_json) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET timestamp = excluded.timestamp, payload_json = excluded.payload_json`,
  );
  const readAudit = db.prepare('SELECT payload_json FROM audit_logs WHERE id = ?');

  const commitTurn = db.transaction(
    (row: TurnRow, json: string, createdAt: number, expiresAt: number) => {
      writeTurn.run(row.conversationId, createdAt, expiresAt, json);
    },
  );
  const commitAudit = db.transaction((id: string, timestamp: string, json: string) => {
    writeAudit.run(id, timestamp, json);
  });
  const commitSweep = db.transaction((now: number) => {
    deleteExpired.run(now);
  });
  const commitDelete = db.transaction((conversationId: string) => {
    deleteTurnSql.run(conversationId);
  });

  const implemented = {
    turns: {
      async getTurn<T>(conversationId: string): Promise<T | undefined> {
        const row = readTurn.get(conversationId) as PayloadRow | undefined;
        return row === undefined ? undefined : (payload(row.payload_json, 'getTurn') as T);
      },
      async putTurn<T extends TurnRow>(row: T): Promise<void> {
        const createdAt = row.createdAt;
        const expiresAt = row.expiresAt;
        if (typeof createdAt !== 'number' || typeof expiresAt !== 'number') {
          throw new Error('putTurn requires numeric createdAt and expiresAt');
        }
        const json = JSON.stringify(row);
        commitTurn(row, json, createdAt, expiresAt);
        const stored = readTurn.get(row.conversationId) as PayloadRow | undefined;
        if (stored === undefined || stored.payload_json !== json) {
          throw new StorageReadbackError('putTurn');
        }
      },
      async deleteTurn(conversationId: string): Promise<void> {
        commitDelete(conversationId);
        if (readTurn.get(conversationId) !== undefined) {
          throw new StorageReadbackError('deleteTurn');
        }
      },
      async sweepExpiredTurns(now: number): Promise<void> {
        commitSweep(now);
        if (findExpired.get(now) !== undefined) {
          throw new StorageReadbackError('sweepExpiredTurns');
        }
      },
    },
    async fingerprintTarget(): Promise<undefined> {
      return undefined;
    },
    audit: {
      async insertAuditLog(row: { id: string; timestamp: string }): Promise<void> {
        const json = JSON.stringify(row);
        commitAudit(row.id, row.timestamp, json);
        const stored = readAudit.get(row.id) as PayloadRow | undefined;
        if (stored === undefined || stored.payload_json !== json) {
          throw new StorageReadbackError('insertAuditLog');
        }
      },
      async getAuditLog(id: string) {
        const row = readAudit.get(id) as PayloadRow | undefined;
        return row === undefined ? undefined : payload(row.payload_json, 'getAuditLog');
      },
    },
    async removeEmptyRecording(mediaId: string): Promise<never> {
      throw new RecordingRemovalBlockedError(mediaId, 'missing');
    },
  };

  const port = new Proxy(implemented, {
    get(target, key, receiver) {
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
      if (typeof key !== 'string') return undefined;
      return notReady(key);
    },
  }) as unknown as StoragePort;

  return {
    port,
    close() {
      db.close();
    },
  };
}
