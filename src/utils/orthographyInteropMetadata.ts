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
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function parseOrthographyInteropMetadata(raw: unknown): OrthographyInteropMetadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = raw as Record<string, unknown>;
  const metadata: OrthographyInteropMetadata = {
    ...(normalizeInteropString(parsed.languageId) ? { languageId: normalizeInteropString(parsed.languageId) } : {}),
    ...(normalizeInteropString(parsed.orthographyId) ? { orthographyId: normalizeInteropString(parsed.orthographyId) } : {}),
    ...(normalizeInteropString(parsed.scriptTag) ? { scriptTag: normalizeInteropString(parsed.scriptTag) } : {}),
    ...(normalizeInteropString(parsed.regionTag) ? { regionTag: normalizeInteropString(parsed.regionTag) } : {}),
    ...(normalizeInteropString(parsed.variantTag) ? { variantTag: normalizeInteropString(parsed.variantTag) } : {}),
    ...(normalizeInteropString(parsed.transformId) ? { transformId: normalizeInteropString(parsed.transformId) } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}