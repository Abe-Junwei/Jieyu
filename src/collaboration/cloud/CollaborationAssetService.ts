/**
 * 项目资产托管服务 | Project asset hosting service
 *
 * 负责资产元数据记录与 Storage 文件的注册、列表、签名URL、删除。
 * Manages asset metadata records alongside Storage upload/signed-url/remove.
 */
import { getSupabaseBrowserClient } from './collaborationSupabaseFacade';
import {
  uploadProjectAsset,
  createSignedProjectAssetUrl,
  removeProjectAsset,
  type CollaborationStorageBucket,
} from '../../integrations/supabase/storage';
import type { CollaborationAssetRecord } from './syncTypes';

// ── 输入类型 | Input types ──

export interface RegisterAssetInput {
  projectId: string;
  assetType: CollaborationAssetRecord['assetType'];
  fileName: string;
  data: Blob | File | ArrayBuffer | Uint8Array;
  mimeType?: string;
  checksum?: string;
  uploadedBy: string;
}

export interface ListAssetsInput {
  projectId: string;
  assetType?: CollaborationAssetRecord['assetType'];
  limit?: number;
  offset?: number;
}

type ProjectAssetRow = {
  id: string;
  project_id: string;
  asset_type: CollaborationAssetRecord['assetType'];
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  checksum: string | null;
  uploaded_by: string;
  created_at: string;
};

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

// ── Bucket 路由 | Bucket routing ──

function resolveBucket(assetType: CollaborationAssetRecord['assetType']): CollaborationStorageBucket {
  switch (assetType) {
    case 'audio': return 'project-audio';
    case 'export': return 'project-exports';
    case 'attachment': return 'project-attachments';
  }
}

function computeDataSize(data: Blob | File | ArrayBuffer | Uint8Array): number {
  if (data instanceof Blob) return data.size;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return data.byteLength;
}

// ── 服务 | Service ──

export class CollaborationAssetService {
  /**
   * 注册资产：上传文件到 Storage + 插入元数据到 project_assets
   * Register asset: upload file to Storage + insert metadata into project_assets
   */
  async register(input: RegisterAssetInput): Promise<CollaborationAssetRecord> {
    const bucket = resolveBucket(input.assetType);
    const assetId = `${input.assetType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const sizeBytes = computeDataSize(input.data);

    // 1. 上传文件 | Upload file
    const { path } = await uploadProjectAsset({
      bucket,
      projectId: input.projectId,
      assetId,
      fileName: input.fileName,
      data: input.data,
      ...(input.mimeType !== undefined && { contentType: input.mimeType }),
      upsert: false,
    });

    // 2. 插入元数据 | Insert metadata
    const client = getSupabaseBrowserClient();
    const row = {
      project_id: input.projectId,
      asset_type: input.assetType,
      storage_bucket: bucket,
      storage_path: path,
      mime_type: input.mimeType ?? null,
      size_bytes: sizeBytes,
      checksum: input.checksum ?? null,
      uploaded_by: input.uploadedBy,
    };

    const { data, error } = await client
      .from('project_assets')
      .insert(row)
      .select()
      .single();

    if (error) {
      // 元数据失败时回滚已上传对象，降低孤儿文件概率。
      // Roll back uploaded object when metadata insertion fails.
      try {
        await removeProjectAsset(bucket, path);
      } catch {
        // noop - 保持原始错误，补偿失败交由巡检处理 | Keep original error and handle compensation failure via audit
      }
      throw error;
    }

    return mapRowToRecord(data);
  }

  /**
   * 列表查询 | List assets for a project
   */
  async list(input: ListAssetsInput): Promise<CollaborationAssetRecord[]> {
    const client = getSupabaseBrowserClient();
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    let query = client
      .from('project_assets')
      .select('*')
      .eq('project_id', input.projectId)
      .order('created_at', { ascending: false });

    if (input.assetType) {
      query = query.eq('asset_type', input.assetType);
    }
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRowToRecord);
  }

  /**
   * 获取签名下载 URL | Get a signed download URL for an asset
   */
  async getSignedUrl(
    asset: Pick<CollaborationAssetRecord, 'storageBucket' | 'storagePath'>,
    expiresInSeconds = 30 * 60,
  ): Promise<string> {
    return createSignedProjectAssetUrl(
      asset.storageBucket as CollaborationStorageBucket,
      asset.storagePath,
      expiresInSeconds,
    );
  }

  /**
   * 删除资产：删除 Storage 文件 + 删除元数据
   * Remove asset: delete Storage file + remove metadata row
   */
  async remove(assetId: string): Promise<void> {
    const client = getSupabaseBrowserClient();

    // 1. 查找元数据 | Look up metadata
    const { data: row, error: fetchError } = await client
      .from('project_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (fetchError) throw fetchError;
    const resolvedRow = row as unknown as ProjectAssetRow;

    // 2. 删除元数据行 | Delete metadata row
    const { error: deleteError } = await client
      .from('project_assets')
      .delete()
      .eq('id', assetId);

    if (deleteError) throw deleteError;

    try {
      // 3. 删除 Storage 文件 | Remove from Storage
      await removeProjectAsset(
        resolvedRow.storage_bucket as CollaborationStorageBucket,
        resolvedRow.storage_path,
      );
    } catch (storageError) {
      // Storage 删除失败时尽量补回元数据，避免“记录消失但对象仍在”的排障盲区。
      // Recreate metadata on storage-delete failure to preserve traceability.
      try {
        await client.from('project_assets').insert({
          id: resolvedRow.id,
          project_id: resolvedRow.project_id,
          asset_type: resolvedRow.asset_type,
          storage_bucket: resolvedRow.storage_bucket,
          storage_path: resolvedRow.storage_path,
          mime_type: resolvedRow.mime_type,
          size_bytes: resolvedRow.size_bytes,
          checksum: resolvedRow.checksum,
          uploaded_by: resolvedRow.uploaded_by,
          created_at: resolvedRow.created_at,
        });
      } catch {
        // noop - 保持原始 storage 错误 | Keep original storage error
      }
      throw storageError;
    }
  }
}

// ── 行映射 | Row mapper ──

function mapRowToRecord(row: Record<string, unknown>): CollaborationAssetRecord {
  const mimeType = row.mime_type as string | null;
  const checksum = row.checksum as string | null;
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    assetType: row.asset_type as CollaborationAssetRecord['assetType'],
    storageBucket: row.storage_bucket as string,
    storagePath: row.storage_path as string,
    ...(mimeType !== null && { mimeType }),
    sizeBytes: row.size_bytes as number,
    ...(checksum !== null && { checksum }),
    uploadedBy: row.uploaded_by as string,
    createdAt: row.created_at as string,
  };
}
