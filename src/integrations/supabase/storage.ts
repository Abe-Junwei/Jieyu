import { getSupabaseBrowserClient } from './client';

export const COLLABORATION_STORAGE_BUCKETS = [
  'project-audio',
  'project-exports',
  'project-attachments',
] as const;

export type CollaborationStorageBucket = (typeof COLLABORATION_STORAGE_BUCKETS)[number];

export interface UploadProjectAssetInput {
  bucket: CollaborationStorageBucket;
  projectId: string;
  assetId: string;
  fileName: string;
  data: Blob | File | ArrayBuffer | Uint8Array;
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  // 阻止路径穿越 | Prevent path traversal via .. segments
  if (trimmed.includes('..')) {
    throw new Error(`Path segment must not contain "..": ${trimmed}`);
  }
  return trimmed;
}

export function buildProjectAssetPath(projectId: string, assetId: string, fileName: string): string {
  const safeProjectId = sanitizePathSegment(projectId);
  const safeAssetId = sanitizePathSegment(assetId);
  const safeFileName = sanitizePathSegment(fileName);
  return `${safeProjectId}/${safeAssetId}/${safeFileName}`;
}

export async function uploadProjectAsset(input: UploadProjectAssetInput): Promise<{ path: string }> {
  const client = getSupabaseBrowserClient();
  const path = buildProjectAssetPath(input.projectId, input.assetId, input.fileName);

  const { error } = await client.storage
    .from(input.bucket)
    .upload(path, input.data, {
      ...(input.contentType ? { contentType: input.contentType } : {}),
      ...(input.cacheControl ? { cacheControl: input.cacheControl } : {}),
      ...(input.upsert !== undefined ? { upsert: input.upsert } : {}),
    });

  if (error) throw error;
  return { path };
}

export async function createSignedProjectAssetUrl(
  bucket: CollaborationStorageBucket,
  path: string,
  expiresInSeconds = 30 * 60,
): Promise<string> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

export async function removeProjectAsset(
  bucket: CollaborationStorageBucket,
  path: string,
): Promise<void> {
  const client = getSupabaseBrowserClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw error;
}
