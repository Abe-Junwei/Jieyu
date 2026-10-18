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
  SpeakerDocType,
  TextDocType,
  TrackEntityDocType,
} from './types';
import {
  listForeignOwnedLayers,
  listForeignOwnedMedia,
  listForeignOwnedUnits,
  readProject,
  type ForeignOwnedRow,
} from './storagePortProjectReads';
import { db, getDb } from './engine';
import { withTransaction } from './withTransaction';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { isMediaItemPlaceholderRow, mediaRowHasPlayableBytes } from '../utils/mediaItemState';
import { newId } from '../utils/transcriptionFormatters';
import {
  attachSpeakerToProject,
  readProjectSpeakerIds,
} from '../services/speakerProjectMembership';

export class RecordingRemovalBlockedError extends Error {
  readonly code = 'RECORDING_REMOVAL_BLOCKED' as const;

  constructor(
    readonly mediaId: string,
    readonly reason: 'missing' | 'has-bytes' | 'has-units' | 'has-anchors' | 'not-acoustic',
  ) {
    super(`removeEmptyRecording: ${mediaId} blocked (${reason})`);
    this.name = 'RecordingRemovalBlockedError';
  }
}

export function recordingRemovalBlockReason(
  error: unknown,
): RecordingRemovalBlockedError['reason'] | undefined {
  if (error instanceof RecordingRemovalBlockedError) return error.reason;
  if (error instanceof Error && error.cause instanceof RecordingRemovalBlockedError) {
    return error.cause.reason;
  }
  return undefined;
}

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
  /** 这些句段（须在 `units` 里）已有的分词段，在同一事务里改成句段的新起止时间。 */
  resizeSegmentsOf?: string[];
}

export interface MixedSpeakerSelectionWrite {
  textId: string;
  segmentIds: readonly string[];
  unitIds: readonly string[];
  speakerId?: string;
  createSpeaker?: { name: string; textId: string };
}

export interface MixedSpeakerSelectionResult {
  segments: number;
  units: number;
  speaker?: SpeakerDocType;
  created?: boolean;
}

/** 调用方不传表名，也不接收事务回调。 */
export interface StoragePort {
  turns: AiRuntimeTurnOps;
  fingerprintTarget(id: string): Promise<string | undefined>;
  audit: AuditLogOps;
  commitRegexSplit(write: RegexSplitCommit): Promise<{ resizedSegmentIds: string[] }>;
  assignSpeakerToMixedSelection(
    write: MixedSpeakerSelectionWrite,
  ): Promise<MixedSpeakerSelectionResult>;
  /**
   * 移除一条没有可播放字节的录音。
   * 同事务解开指向它的来源文稿，文稿本身留下；句段和锚点留在项目里，改挂到未绑定录音。
   * 同名的其他录音不动。
   */
  removeEmptyRecording(mediaId: string): Promise<{ unboundSourceIds: string[] }>;
  readProject(textId: string): Promise<TextDocType | undefined>;
  listForeignOwnedUnits(unitIds: Iterable<string>, textId: string): Promise<ForeignOwnedRow[]>;
  listForeignOwnedLayers(layerIds: Iterable<string>, textId: string): Promise<ForeignOwnedRow[]>;
  listForeignOwnedMedia(mediaIds: Iterable<string>, textId: string): Promise<ForeignOwnedRow[]>;
  listTrackEntities(textId: string): Promise<TrackEntityDocType[]>;
  putTrackEntity(doc: TrackEntityDocType): Promise<void>;
  readLayerUnit(unitId: string): Promise<LayerUnitDocType | undefined>;
  countAnnotationDocuments(textId: string): Promise<number>;
}

function textIdsOf(write: RegexSplitCommit): string[] {
  const ids = new Set<string>();
  for (const row of [...write.units, ...write.contents]) {
    const textId = row.textId?.trim() ?? '';
    if (textId.length > 0) ids.add(textId);
  }
  return [...ids];
}

async function commitRegexSplit(write: RegexSplitCommit): Promise<{ resizedSegmentIds: string[] }> {
  const textIds = textIdsOf(write);
  if (textIds.length > 1) {
    throw new CatalogOwnershipMismatchError(
      'layer_units',
      'commitRegexSplit',
      textIds[0]!,
      textIds[1]!,
    );
  }
  const projectId = textIds[0];
  const owners = new Map(
    (write.resizeSegmentsOf ?? []).flatMap((id) => {
      const unit = write.units.find((row) => row.id === id);
      return unit ? [[id, unit] as const] : [];
    }),
  );
  const database = await getDb();
  let resized: LayerUnitDocType[] = [];
  try {
    resized = await withTransaction(
      database,
      'rw',
      [database.dexie.anchors, database.dexie.layer_units, database.dexie.layer_unit_contents],
      async () => {
        if (projectId !== undefined) {
          const [storedUnits, storedContents] = await Promise.all([
            database.dexie.layer_units.bulkGet(write.units.map((row) => row.id)),
            database.dexie.layer_unit_contents.bulkGet(write.contents.map((row) => row.id)),
          ]);
          for (const row of [...storedUnits, ...storedContents]) {
            const owner = row?.textId?.trim() ?? '';
            if (row && owner.length > 0 && owner !== projectId) {
              throw new CatalogOwnershipMismatchError('layer_units', row.id, owner, projectId);
            }
          }
        }
        const segments =
          owners.size === 0
            ? []
            : (
                await database.dexie.layer_units
                  .where('parentUnitId')
                  .anyOf([...owners.keys()])
                  .toArray()
              ).flatMap((row) => {
                const owner =
                  row.parentUnitId === undefined ? undefined : owners.get(row.parentUnitId);
                if (row.unitType !== 'segment' || !owner) return [];
                return [
                  {
                    ...row,
                    startTime: owner.startTime,
                    endTime: owner.endTime,
                    updatedAt: owner.updatedAt,
                  },
                ];
              });
        if (segments.length > 0) await database.dexie.layer_units.bulkPut(segments);
        if (write.anchors.length > 0) await database.dexie.anchors.bulkPut(write.anchors);
        if (write.units.length > 0) await database.dexie.layer_units.bulkPut(write.units);
        if (write.contents.length > 0)
          await database.dexie.layer_unit_contents.bulkPut(write.contents);
        return segments;
      },
      { label: 'commitRegexSplit' },
    );
  } catch (error) {
    throw error instanceof Error && error.cause instanceof CatalogOwnershipMismatchError
      ? error.cause
      : error;
  }
  for (const anchor of write.anchors) {
    const stored = await database.dexie.anchors.get(anchor.id);
    if (!stored || stored.time !== anchor.time) throw new StorageReadbackError('commitRegexSplit');
  }
  for (const unit of [...resized, ...write.units]) {
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
  return { resizedSegmentIds: resized.map((row) => row.id) };
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

  assignSpeakerToMixedSelection,

  removeEmptyRecording,

  readProject,
  listForeignOwnedUnits,
  listForeignOwnedLayers,
  listForeignOwnedMedia,

  listTrackEntities,
  putTrackEntity,
  readLayerUnit,
  countAnnotationDocuments,
};

async function assignSpeakerToMixedSelection(
  write: MixedSpeakerSelectionWrite,
): Promise<MixedSpeakerSelectionResult> {
  const projectId = write.textId.trim();
  if (projectId === '') throw new Error('mixed speaker selection requires a project');
  const requestedSpeakerId = write.speakerId?.trim() ?? '';
  const segmentIds = [...new Set(write.segmentIds.map((id) => id.trim()).filter(Boolean))];
  const unitIds = [...new Set(write.unitIds.map((id) => id.trim()).filter(Boolean))];
  const touched = [...segmentIds, ...unitIds];
  if (segmentIds.some((id) => unitIds.includes(id))) {
    throw new Error('mixed speaker selection overlaps');
  }
  if (requestedSpeakerId !== '' && write.createSpeaker !== undefined) {
    throw new Error('choose an existing speaker or create one');
  }
  if (touched.length === 0) return { segments: 0, units: 0 };
  const database = await getDb();
  let result: MixedSpeakerSelectionResult;
  try {
    result = await withTransaction(
      database,
      'rw',
      [database.dexie.speakers, database.dexie.layer_units, database.dexie.texts],
      async (): Promise<MixedSpeakerSelectionResult> => {
        const rows = await database.dexie.layer_units.bulkGet(touched);
        if (!(await database.dexie.texts.get(projectId)))
          throw new Error(`项目不存在: ${projectId}`);
        if (
          rows.some(
            (row, index) =>
              !row || row.unitType !== (index < segmentIds.length ? 'segment' : 'unit'),
          )
        ) {
          throw new Error('mixed speaker selection changed before writing');
        }
        let speaker =
          requestedSpeakerId !== ''
            ? await database.dexie.speakers.get(requestedSpeakerId)
            : undefined;
        let created = false;
        if (write.createSpeaker) {
          const name = write.createSpeaker.name.trim();
          const textId = write.createSpeaker.textId.trim();
          if (name === '' || textId === '')
            throw new Error('speaker name and project are required');
          if (!(await database.dexie.texts.get(textId))) throw new Error(`项目不存在: ${textId}`);
          const candidates = await database.dexie.speakers.where('textId').equals(textId).toArray();
          speaker = candidates.find(
            (row) =>
              row.name.trim().toLocaleLowerCase('zh-Hans-CN') ===
              name.toLocaleLowerCase('zh-Hans-CN'),
          );
          if (!speaker) {
            const now = new Date().toISOString();
            speaker = { id: newId('speaker'), name, textId, createdAt: now, updatedAt: now };
            await database.dexie.speakers.add(speaker);
            created = true;
          }
        }
        if (requestedSpeakerId !== '' && !speaker) {
          throw new Error(`说话人不存在: ${requestedSpeakerId}`);
        }
        if (speaker && speaker.textId !== projectId) {
          throw new CatalogOwnershipMismatchError(
            'speakers',
            speaker.id,
            speaker.textId,
            projectId,
          );
        }
        for (const row of rows) {
          if (row!.textId.trim() !== projectId) {
            throw new CatalogOwnershipMismatchError('layer_units', row!.id, row!.textId, projectId);
          }
        }
        const now = new Date().toISOString();
        await database.dexie.layer_units.bulkPut(
          rows.map((row) => {
            const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row!;
            return {
              ...rest,
              ...(speaker
                ? {
                    speakerId: speaker.id,
                    ...(row!.unitType === 'unit' ? { speaker: speaker.name } : {}),
                  }
                : {}),
              updatedAt: now,
            };
          }),
        );
        if (speaker) await attachSpeakerToProject(speaker.id, speaker.textId, database);
        return {
          segments: segmentIds.length,
          units: unitIds.length,
          ...(speaker ? { speaker } : {}),
          ...(created ? { created: true } : {}),
        };
      },
      { label: 'speakers.assignMixedSelection' },
    );
  } catch (error) {
    throw error instanceof Error && error.cause instanceof CatalogOwnershipMismatchError
      ? error.cause
      : error;
  }
  const stored = await database.dexie.layer_units.bulkGet(touched);
  if (
    stored.some(
      (row, index) =>
        !row ||
        row.speakerId !== result.speaker?.id ||
        (index >= segmentIds.length &&
          result.speaker !== undefined &&
          row.speaker !== result.speaker.name),
    )
  ) {
    throw new StorageReadbackError('assignSpeakerToMixedSelection');
  }
  if (result.speaker && !(await database.dexie.speakers.get(result.speaker.id))) {
    throw new StorageReadbackError('assignSpeakerToMixedSelection');
  }
  if (result.speaker) {
    const project = await database.dexie.texts.get(result.speaker.textId);
    if (!project || readProjectSpeakerIds(project.metadata)?.includes(result.speaker.id) !== true) {
      throw new StorageReadbackError('assignSpeakerToMixedSelection');
    }
  }
  return result;
}

async function removeEmptyRecording(mediaId: string): Promise<{ unboundSourceIds: string[] }> {
  const id = mediaId.trim();
  if (id.length === 0) throw new RecordingRemovalBlockedError(mediaId, 'missing');
  const database = await getDb();
  let unboundSourceIds: string[] = [];
  await withTransaction(
    database,
    'rw',
    [
      database.dexie.media_items,
      database.dexie.layer_units,
      database.dexie.anchors,
      database.dexie.source_records,
      database.dexie.segment_meta,
      database.dexie.segment_quality_snapshots,
      database.dexie.translation_status_snapshots,
      database.dexie.track_entities,
      database.dexie.scope_stats_snapshots,
    ],
    async () => {
      const row = await database.dexie.media_items.get(id);
      if (!row) throw new RecordingRemovalBlockedError(id, 'missing');
      if (isMediaItemPlaceholderRow(row)) {
        throw new RecordingRemovalBlockedError(id, 'not-acoustic');
      }
      if (mediaRowHasPlayableBytes(row)) {
        throw new RecordingRemovalBlockedError(id, 'has-bytes');
      }
      const sources = await database.dexie.source_records.where('mediaId').equals(id).toArray();
      unboundSourceIds = sources.map((source) => source.id);
      const now = new Date().toISOString();
      const units = await database.dexie.layer_units.where('mediaId').equals(id).toArray();
      for (const unit of units) {
        await database.dexie.layer_units.put({
          ...unit,
          mediaId: '__unknown_media__',
          updatedAt: now,
        });
      }
      const anchors = await database.dexie.anchors.where('mediaId').equals(id).toArray();
      for (const anchor of anchors) {
        await database.dexie.anchors.put({ ...anchor, mediaId: '__unknown_media__' });
      }
      for (const source of sources) {
        const { mediaId: _linked, ...kept } = source;
        await database.dexie.source_records.put({ ...kept, updatedAt: now });
      }
      await database.dexie.segment_meta.where('mediaId').equals(id).delete();
      await database.dexie.segment_quality_snapshots.where('mediaId').equals(id).delete();
      await database.dexie.translation_status_snapshots.where('mediaId').equals(id).delete();
      await database.dexie.track_entities.where('mediaId').equals(id).delete();
      await database.dexie.scope_stats_snapshots.where('mediaId').equals(id).delete();
      await database.dexie.media_items.delete(id);
    },
    { label: 'storage.removeEmptyRecording' },
  );
  if (await database.dexie.media_items.get(id)) {
    throw new StorageReadbackError('removeEmptyRecording');
  }
  for (const sourceId of unboundSourceIds) {
    const source = await database.dexie.source_records.get(sourceId);
    if (!source || source.mediaId === id) throw new StorageReadbackError('removeEmptyRecording');
  }
  return { unboundSourceIds };
}

async function readLayerUnit(unitId: string): Promise<LayerUnitDocType | undefined> {
  const id = unitId.trim();
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.layer_units.get(id);
}

async function countAnnotationDocuments(textId: string): Promise<number> {
  const id = textId.trim();
  if (id.length === 0) return 0;
  const database = await getDb();
  return database.dexie.annotation_documents.where('textId').equals(id).count();
}

async function listTrackEntities(textId: string): Promise<TrackEntityDocType[]> {
  const id = textId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.track_entities.where('textId').equals(id).toArray();
}

async function putTrackEntity(doc: TrackEntityDocType): Promise<void> {
  const database = await getDb();
  const existing = await database.dexie.track_entities.get(doc.id);
  if (existing && existing.textId !== doc.textId) {
    throw new CatalogOwnershipMismatchError('track_entities', doc.id, existing.textId, doc.textId);
  }
  await database.dexie.track_entities.put(doc);
  const stored = await database.dexie.track_entities.get(doc.id);
  const sameLocks = JSON.stringify(stored?.laneLockMap) === JSON.stringify(doc.laneLockMap);
  if (
    !stored ||
    stored.textId !== doc.textId ||
    stored.mediaId !== doc.mediaId ||
    stored.mode !== doc.mode ||
    stored.updatedAt !== doc.updatedAt ||
    !sameLocks
  ) {
    throw new StorageReadbackError('putTrackEntity');
  }
}

let current: StoragePort = dexieStoragePort;

export function storagePort(): StoragePort {
  return current;
}

export function installStoragePort(port: StoragePort): void {
  current = port;
}
