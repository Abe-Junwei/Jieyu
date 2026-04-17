import {
  uploadProjectAsset,
  removeProjectAsset,
  type CollaborationStorageBucket,
} from '../../integrations/supabase/storage';
import { getSupabaseBrowserClient } from '../../integrations/supabase/client';
import type { CollaborationProjectSnapshotRecord } from './syncTypes';

export interface UploadSnapshotInput {
  projectId: string;
  version: number;
  payloadJson: string;
  bucket?: CollaborationStorageBucket;
}

export interface ListSnapshotsInput {
  projectId: string;
  limit?: number;
  offset?: number;
}

export interface RegisterSnapshotInput {
  projectId: string;
  version: number;
  schemaVersion: number;
  createdBy: string;
  changeCursor: number;
  note?: string;
  storage: SnapshotStorageMetadata;
}

export interface CreateSnapshotVersionInput {
  projectId: string;
  version: number;
  payloadJson: string;
  schemaVersion: number;
  createdBy: string;
  changeCursor: number;
  note?: string;
  bucket?: CollaborationStorageBucket;
}

export interface SnapshotStorageMetadata {
  snapshotStorageBucket: CollaborationStorageBucket;
  snapshotStoragePath: string;
  checksum: string;
  sizeBytes: number;
}

const DEFAULT_SNAPSHOT_BUCKET: CollaborationStorageBucket = 'project-exports';
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function calculateSnapshotChecksum(payloadJson: string): string {
  return hashString(payloadJson);
}

function buildSnapshotFileName(version: number): string {
  return `snapshot-v${version}-${Date.now()}.json`;
}

export class CollaborationSnapshotService {
  async uploadSnapshot(input: UploadSnapshotInput): Promise<SnapshotStorageMetadata> {
    const bucket = input.bucket ?? DEFAULT_SNAPSHOT_BUCKET;
    const fileName = buildSnapshotFileName(input.version);
    const data = new Blob([input.payloadJson], { type: 'application/json' });

    const { path } = await uploadProjectAsset({
      bucket,
      projectId: input.projectId,
      assetId: `snapshot-v${input.version}`,
      fileName,
      data,
      contentType: 'application/json',
      upsert: false,
    });

    return {
      snapshotStorageBucket: bucket,
      snapshotStoragePath: path,
      checksum: calculateSnapshotChecksum(input.payloadJson),
      sizeBytes: new TextEncoder().encode(input.payloadJson).byteLength,
    };
  }

  /**
   * 一步创建快照版本：上传正文 + 注册元数据。
   * Oneshot snapshot creation: upload body + register metadata.
   */
  async createSnapshotVersion(input: CreateSnapshotVersionInput): Promise<CollaborationProjectSnapshotRecord> {
    const storage = await this.uploadSnapshot({
      projectId: input.projectId,
      version: input.version,
      payloadJson: input.payloadJson,
      ...(input.bucket !== undefined && { bucket: input.bucket }),
    });

    try {
      return await this.registerSnapshot({
        projectId: input.projectId,
        version: input.version,
        schemaVersion: input.schemaVersion,
        createdBy: input.createdBy,
        changeCursor: input.changeCursor,
        ...(input.note !== undefined && { note: input.note }),
        storage,
      });
    } catch (error) {
      // 元数据注册失败时回滚上传文件，避免孤儿对象。
      // Roll back uploaded blob if metadata registration fails.
      try {
        await removeProjectAsset(storage.snapshotStorageBucket, storage.snapshotStoragePath);
      } catch {
        // noop - 保持原始异常，补偿失败交由后续巡检处理 | Keep original error, handle compensation failure later
      }
      throw error;
    }
  }

  async downloadSnapshotText(bucket: CollaborationStorageBucket, path: string): Promise<string> {
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error) throw error;
    return await data.text();
  }

  /**
   * 注册快照元数据到 project_snapshots 表
   * Register snapshot metadata into project_snapshots table
   */
  async registerSnapshot(input: RegisterSnapshotInput): Promise<CollaborationProjectSnapshotRecord> {
    const client = getSupabaseBrowserClient();
    const row = {
      project_id: input.projectId,
      version: input.version,
      schema_version: input.schemaVersion,
      created_by: input.createdBy,
      snapshot_storage_bucket: input.storage.snapshotStorageBucket,
      snapshot_storage_path: input.storage.snapshotStoragePath,
      checksum: input.storage.checksum,
      size_bytes: input.storage.sizeBytes,
      change_cursor: input.changeCursor,
      note: input.note ?? null,
    };

    const { data, error } = await client
      .from('project_snapshots')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapSnapshotRow(data);
  }

  /**
   * 快照历史列表（按版本倒序） | List snapshots for a project, newest first
   */
  async listSnapshots(input: ListSnapshotsInput): Promise<CollaborationProjectSnapshotRecord[]> {
    const client = getSupabaseBrowserClient();
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    let query = client
      .from('project_snapshots')
      .select('*')
      .eq('project_id', input.projectId)
      .order('version', { ascending: false });

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapSnapshotRow);
  }

  /**
   * 下载指定快照并返回 JSON 文本，供本地恢复使用
   * Download a specific snapshot and return JSON text for local restoration
   */
  async downloadSnapshotById(snapshotId: string): Promise<{ record: CollaborationProjectSnapshotRecord; payloadJson: string }> {
    const client = getSupabaseBrowserClient();
    const { data: row, error } = await client
      .from('project_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (error) throw error;

    const record = mapSnapshotRow(row);
    const payloadJson = await this.downloadSnapshotText(
      record.snapshotStorageBucket as CollaborationStorageBucket,
      record.snapshotStoragePath,
    );

    const resolvedChecksum = calculateSnapshotChecksum(payloadJson);
    if (resolvedChecksum !== record.checksum) {
      throw new Error(`Snapshot checksum mismatch for ${snapshotId}`);
    }

    return { record, payloadJson };
  }
}

// ── 行映射 | Row mapper ──

function mapSnapshotRow(row: Record<string, unknown>): CollaborationProjectSnapshotRecord {
  const note = row.note as string | null;
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    version: row.version as number,
    schemaVersion: row.schema_version as number,
    createdBy: row.created_by as string,
    snapshotStorageBucket: row.snapshot_storage_bucket as string,
    snapshotStoragePath: row.snapshot_storage_path as string,
    checksum: row.checksum as string,
    sizeBytes: row.size_bytes as number,
    changeCursor: row.change_cursor as number,
    ...(note !== null && { note }),
    createdAt: row.created_at as string,
  };
}
