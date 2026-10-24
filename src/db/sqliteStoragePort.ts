/**
 * 存储接口的 SQLite 切片：本机 userData 里的回合和审计，项目文件夹里的说话人分配、正则拆分和轨道行。
 * 一次写入是 better-sqlite3 的一次事务，提交后再读回（ADR-0048）。
 * 说话人分配改两个文件，各提交一次（ADR-0071）。正则拆分和轨道行各写在一份 `.jyd` 里（ADR-0072、ADR-0073）。
 * 语段编号、锚点、词和另一项目的层只读 `.jyd`。层的项目编号是可空的 `text_id`（ADR-0082）。
 * 来源记录写在项目库里（ADR-0074）。录音行也写在项目库里，字节仍是普通文件（ADR-0075）。
 * 另一项目的录音用这一行已有的 text_id 辨认。
 * 去掉一条空录音先改文稿，再改项目库（ADR-0076）。
 * 文稿改挂录音只改一份 `.jyd`，已有的是替换（ADR-0077）。
 * 语段关系和父子链接只写在同一份文稿里（ADR-0078）。
 * 会话和消息写在项目库里（ADR-0080）。产物见 ADR-0081。
 * 桌面壳只在开关打开时经 IPC 安装（ADR-0079）。默认不安装。
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { agentArtifactMethods } from './sqliteAgentArtifacts';
import { aiConversationMethods } from './sqliteAiConversations';
import { anchorCountMethods } from './sqliteAnchors';
import { auditListMethods } from './sqliteAuditLogs';
import { layerForeignMethods } from './sqliteForeignLayers';
import { layerUnitIdMethods } from './sqliteLayerUnitIds';
import { replaceManuscriptAudioInProject } from './sqliteManuscriptAudio';
import {
  listForeignOwnedMediaInProject,
  listMediaByTextInProject,
  listMediaIdsByTextInProject,
  saveMediaItemInProject,
} from './sqliteMediaItems';
import { commitRegexSplitInProject } from './sqliteRegexSplit';
import { removeEmptyRecordingInProject } from './sqliteRemoveEmptyRecording';
import {
  linkSourceRecordMediaInProject,
  listSourceRecordsInProject,
  registerImportedSourceInProject,
  renameSourceRecordInProject,
} from './sqliteSourceRecords';
import { assignSpeakerInProject, PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { listTrackEntitiesInProject, putTrackEntityInProject } from './sqliteTrackEntity';
import { putUnitRelationInProject, setUnitParentInProject } from './sqliteUnitLinks';
import { tokenCountMethods } from './sqliteUnitTokens';
import {
  RecordingRemovalBlockedError,
  type ManuscriptRelationWrite,
  type MixedSpeakerSelectionWrite,
  type RegexSplitCommit,
  type StoragePort,
} from './storagePort';
import type { SourceRecordRegistration } from './storagePortSourceRecords';
import { StorageReadbackError } from './storageReadbackError';
import type { MediaItemDocType, TrackEntityDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

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

function openProject(projectDir: string): SqliteDatabase {
  const project = new Database(path.join(projectDir, 'project.sqlite'));
  project.exec('PRAGMA journal_mode = DELETE');
  const row: unknown = project.prepare('PRAGMA application_id').get();
  const id =
    typeof row === 'object' && row !== null
      ? (row as { application_id?: unknown }).application_id
      : undefined;
  if (id !== PROJECT_APPLICATION_ID) {
    project.close();
    throw new Error('project.sqlite application_id is not a Jieyu project library');
  }
  return project;
}

export function openSqliteStoragePort(
  file: string,
  projectDir?: string,
): { port: StoragePort; close: () => void } {
  const db = new Database(file);
  let project: SqliteDatabase | undefined;
  try {
    db.exec(SCHEMA);
    if (projectDir !== undefined) project = openProject(projectDir);
  } catch (error) {
    db.close();
    throw error;
  }
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

  function requireProject(): SqliteDatabase {
    if (project === undefined) {
      throw new Error('sqlite storage port has not opened a project folder');
    }
    return project;
  }

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
    async removeEmptyRecording(mediaId: string) {
      if (mediaId.trim().length === 0) {
        throw new RecordingRemovalBlockedError(mediaId, 'missing');
      }
      if (project === undefined || projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      return removeEmptyRecordingInProject(project, projectDir, mediaId);
    },
    async replaceManuscriptAudio(manuscriptId: string, audioId: string | null) {
      if (project === undefined || projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      replaceManuscriptAudioInProject(project, projectDir, manuscriptId, audioId);
    },
    async putUnitRelation(relation: ManuscriptRelationWrite) {
      if (projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      putUnitRelationInProject(projectDir, relation);
    },
    async setUnitParent(unitId: string, parentUnitId: string | null) {
      if (projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      setUnitParentInProject(projectDir, unitId, parentUnitId);
    },
    async assignSpeakerToMixedSelection(write: MixedSpeakerSelectionWrite) {
      if (project === undefined || projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      return assignSpeakerInProject(project, projectDir, write);
    },
    async commitRegexSplit(write: RegexSplitCommit) {
      if (projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      return commitRegexSplitInProject(projectDir, write);
    },
    async putTrackEntity(doc: TrackEntityDocType) {
      if (projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      putTrackEntityInProject(projectDir, doc);
    },
    async listTrackEntities(textId: string) {
      if (projectDir === undefined) {
        throw new Error('sqlite storage port has not opened a project folder');
      }
      return listTrackEntitiesInProject(projectDir, textId);
    },
    async listSourceRecords(textId: string) {
      return listSourceRecordsInProject(requireProject(), textId);
    },
    async registerImportedSource(input: SourceRecordRegistration) {
      return registerImportedSourceInProject(requireProject(), input);
    },
    async renameSourceRecord(textId: string, recordId: string, displayName: string) {
      return renameSourceRecordInProject(requireProject(), textId, recordId, displayName);
    },
    async linkSourceRecordMedia(textId: string, recordId: string, mediaId: string | null) {
      return linkSourceRecordMediaInProject(requireProject(), textId, recordId, mediaId);
    },
    async listMediaByText(textId: string) {
      return listMediaByTextInProject(requireProject(), textId);
    },
    async listMediaIdsByText(textId: string) {
      return listMediaIdsByTextInProject(requireProject(), textId);
    },
    async listForeignOwnedMedia(mediaIds: Iterable<string>, textId: string) {
      return listForeignOwnedMediaInProject(requireProject(), mediaIds, textId);
    },
    async saveMediaItem(data: MediaItemDocType) {
      return saveMediaItemInProject(requireProject(), data);
    },
    ...layerUnitIdMethods(projectDir),
    ...layerForeignMethods(projectDir),
    ...anchorCountMethods(projectDir),
    ...tokenCountMethods(projectDir),
    ...auditListMethods(db),
    ...aiConversationMethods(requireProject),
    ...agentArtifactMethods(requireProject, db),
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
      project?.close();
    },
  };
}
