/**
 * ADR-0048：存储接口。一次方法调用是一次业务操作。
 * 调用方经 `storagePort()` 取当前实现；浏览器构建是下面的 Dexie 实现，桌面壳启动时用
 * `installStoragePort` 换成经 IPC 的 SQLite 实现（#275），两者都要通过 `storagePortContract.ts`。
 */
import type {
  AnchorDocType,
  AuditLogDocType,
  AiRuntimeV2TurnDoc,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from './types';
import { db, getDb } from './engine';
import { withTransaction } from './withTransaction';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';

export class StorageReadbackError extends Error {
  readonly code = 'STORAGE_READBACK';

  constructor(operation: string) {
    super(`storage read-back failed after ${operation}`);
    this.name = 'StorageReadbackError';
  }
}

type TurnRow = { conversationId: string; createdAt?: unknown; expiresAt?: unknown };

export interface AiRuntimeTurnOps {
  getTurn<T>(conversationId: string): Promise<T | undefined>;
  putTurn<T extends TurnRow>(row: T): Promise<void>;
  deleteTurn(conversationId: string): Promise<void>;
  sweepExpiredTurns(now: number): Promise<void>;
}

export interface AuditLogOps {
  insertAuditLog(row: AuditLogDocType): Promise<void>;
  getAuditLog(id: string): Promise<AuditLogDocType | undefined>;
}

/** 正则拆分已经算好的行。调用方不传表名。 */
export interface RegexSplitCommit {
  anchors: AnchorDocType[];
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
}

/** 调用方不传表名，也不接收事务回调。 */
export interface StoragePort {
  turns: AiRuntimeTurnOps;
  fingerprintTarget(id: string): Promise<string | undefined>;
  audit: AuditLogOps;
  commitRegexSplit(write: RegexSplitCommit): Promise<void>;
}

function textIdsOf(write: RegexSplitCommit): string[] {
  const ids = new Set<string>();
  for (const row of [...write.units, ...write.contents]) {
    const textId = row.textId?.trim() ?? '';
    if (textId.length > 0) ids.add(textId);
  }
  return [...ids];
}

async function commitRegexSplit(write: RegexSplitCommit): Promise<void> {
  const textIds = textIdsOf(write);
  if (textIds.length > 1) {
    throw new CatalogOwnershipMismatchError(
      'layer_units',
      'commitRegexSplit',
      textIds[0]!,
      textIds[1]!,
    );
  }
  const database = await getDb();
  await withTransaction(
    database,
    'rw',
    [database.dexie.anchors, database.dexie.layer_units, database.dexie.layer_unit_contents],
    async () => {
      if (write.anchors.length > 0) await database.dexie.anchors.bulkPut(write.anchors);
      if (write.units.length > 0) await database.dexie.layer_units.bulkPut(write.units);
      if (write.contents.length > 0)
        await database.dexie.layer_unit_contents.bulkPut(write.contents);
    },
    { label: 'commitRegexSplit' },
  );
  for (const anchor of write.anchors) {
    const stored = await database.dexie.anchors.get(anchor.id);
    if (!stored || stored.time !== anchor.time) throw new StorageReadbackError('commitRegexSplit');
  }
  for (const unit of write.units) {
    const stored = await database.dexie.layer_units.get(unit.id);
    if (
      !stored ||
      stored.updatedAt !== unit.updatedAt ||
      stored.startTime !== unit.startTime ||
      stored.endTime !== unit.endTime
    ) {
      throw new StorageReadbackError('commitRegexSplit');
    }
  }
  for (const content of write.contents) {
    const stored = await database.dexie.layer_unit_contents.get(content.id);
    if (!stored || stored.updatedAt !== content.updatedAt || stored.text !== content.text) {
      throw new StorageReadbackError('commitRegexSplit');
    }
  }
}

function stamp(kind: string, row: { updatedAt?: unknown }): string {
  return `${kind}:${String(row.updatedAt ?? JSON.stringify(row))}`;
}

export const dexieStoragePort: StoragePort = {
  turns: {
    async getTurn<T>(conversationId: string) {
      return (await db.ai_runtime_v2_turns.get(conversationId)) as T | undefined;
    },
    async putTurn(row) {
      await db.ai_runtime_v2_turns.put(row as unknown as AiRuntimeV2TurnDoc);
      const stored = await db.ai_runtime_v2_turns.get(row.conversationId);
      if (
        !stored ||
        stored.conversationId !== row.conversationId ||
        stored.createdAt !== row.createdAt ||
        stored.expiresAt !== row.expiresAt
      ) {
        throw new StorageReadbackError('putTurn');
      }
    },
    async deleteTurn(conversationId) {
      await db.ai_runtime_v2_turns.delete(conversationId);
      if (await db.ai_runtime_v2_turns.get(conversationId)) {
        throw new StorageReadbackError('deleteTurn');
      }
    },
    async sweepExpiredTurns(now) {
      await db.ai_runtime_v2_turns.where('expiresAt').below(now).delete();
      if ((await db.ai_runtime_v2_turns.where('expiresAt').below(now).count()) !== 0) {
        throw new StorageReadbackError('sweepExpiredTurns');
      }
    },
  },

  /**
   * 目标指纹。查找顺序和字符串形状与原先按主键扫描的结果一致，已保存的审批指纹仍能比对。
   * 种类写死在这里：句段、层定义、句段内容、项目、词例。
   */
  async fingerprintTarget(id) {
    const unit = await db.layer_units.get(id);
    if (unit) {
      const contents = await db.layer_unit_contents.where('unitId').equals(id).toArray();
      const tail = contents
        .map((content) => `${String(content.id)}@${String(content.updatedAt)}`)
        .sort()
        .join(',');
      return `${stamp('layer_units', unit)}|${tail}`;
    }
    const tier = await db.tier_definitions.get(id);
    if (tier) return stamp('tier_definitions', tier);
    const content = await db.layer_unit_contents.get(id);
    if (content) return stamp('layer_unit_contents', content);
    const text = await db.texts.get(id);
    if (text) return stamp('texts', text);
    const token = await db.unit_tokens.get(id);
    if (token) return stamp('unit_tokens', token);
    return undefined;
  },

  audit: {
    async insertAuditLog(row) {
      await db.audit_logs.put(row);
      const stored = await db.audit_logs.get(row.id);
      if (!stored || stored.id !== row.id || stored.timestamp !== row.timestamp) {
        throw new StorageReadbackError('insertAuditLog');
      }
    },
    getAuditLog(id) {
      return db.audit_logs.get(id);
    },
  },

  commitRegexSplit,
};

let current: StoragePort = dexieStoragePort;

export function storagePort(): StoragePort {
  return current;
}

export function installStoragePort(port: StoragePort): void {
  current = port;
}
