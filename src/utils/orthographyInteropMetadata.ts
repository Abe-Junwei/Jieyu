import type { LayerDocType, OrthographyDocType } from '../db';

export interface OrthographyInteropMetadata {
  languageId?: string;
  orthographyId?: string;
  scriptTag?: string;
  regionTag?: string;
  variantTag?: string;
  transformId?: string;
}

function normalizeInteropString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildOrthographyInteropMetadata(
  layer?: LayerDocType,
  orthographies?: OrthographyDocType[],
): OrthographyInteropMetadata | undefined {
  if (!layer) return undefined;
  const orthography = layer.orthographyId
    ? orthographies?.find((item) => item.id === layer.orthographyId)
    : undefined;
  const metadata: OrthographyInteropMetadata = {
    ...(layer.languageId ? { languageId: layer.languageId } : {}),
    ...(layer.orthographyId ? { orthographyId: layer.orthographyId } : {}),
    ...(orthography?.scriptTag ? { scriptTag: orthography.scriptTag } : {}),
    ...(orthography?.regionTag ? { regionTag: orthography.regionTag } : {}),
    ...(orthography?.variantTag ? { variantTag: orthography.variantTag } : {}),
    ...(layer.transformId ? { transformId: layer.transformId } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function parseOrthographyInteropMetadata(raw: unknown): OrthographyInteropMetadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = raw as Record<string, unknown>;
  const languageId = normalizeInteropString(parsed.languageId);
  const orthographyId = normalizeInteropString(parsed.orthographyId);
  const scriptTag = normalizeInteropString(parsed.scriptTag);
  const regionTag = normalizeInteropString(parsed.regionTag);
  const variantTag = normalizeInteropString(parsed.variantTag);
  const transformId = normalizeInteropString(parsed.transformId);
  const metadata: OrthographyInteropMetadata = {
    ...(languageId ? { languageId } : {}),
    ...(orthographyId ? { orthographyId } : {}),
    ...(scriptTag ? { scriptTag } : {}),
    ...(regionTag ? { regionTag } : {}),
    ...(variantTag ? { variantTag } : {}),
    ...(transformId ? { transformId } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
