import type { LayerDocType, OrthographyDocType } from '../db';

export interface OrthographyInteropMetadata {
  languageId?: string;
  orthographyId?: string;
  scriptTag?: string;
  regionTag?: string;
  variantTag?: string;
  bridgeId?: string;
  timelineMode?: 'document' | 'media';
  logicalDurationSec?: number;
  timebaseLabel?: string;
}

function normalizeInteropString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveInteropBridgeId(raw: { bridgeId?: unknown }): string | undefined {
  return normalizeInteropString(raw.bridgeId);
}

export function buildOrthographyInteropMetadata(
  layer?: LayerDocType,
  orthographies?: OrthographyDocType[],
): OrthographyInteropMetadata | undefined {
  if (layer === undefined) return undefined;
  const orthography =
    layer.orthographyId !== undefined && layer.orthographyId.length > 0
      ? orthographies?.find((item) => item.id === layer.orthographyId)
      : undefined;
  const bridgeId = resolveInteropBridgeId(layer);
  const metadata: OrthographyInteropMetadata = {
    ...(layer.languageId !== undefined && layer.languageId.length > 0
      ? { languageId: layer.languageId }
      : {}),
    ...(layer.orthographyId !== undefined && layer.orthographyId.length > 0
      ? { orthographyId: layer.orthographyId }
      : {}),
    ...(orthography?.scriptTag !== undefined && orthography.scriptTag.length > 0
      ? { scriptTag: orthography.scriptTag }
      : {}),
    ...(orthography?.regionTag !== undefined && orthography.regionTag.length > 0
      ? { regionTag: orthography.regionTag }
      : {}),
    ...(orthography?.variantTag !== undefined && orthography.variantTag.length > 0
      ? { variantTag: orthography.variantTag }
      : {}),
    ...(bridgeId !== undefined && bridgeId.length > 0 ? { bridgeId } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function parseOrthographyInteropMetadata(
  raw: unknown,
): OrthographyInteropMetadata | undefined {
  if (raw === null || raw === undefined || typeof raw !== 'object') return undefined;
  const parsed = raw as Record<string, unknown>;
  const languageId = normalizeInteropString(parsed.languageId);
  const orthographyId = normalizeInteropString(parsed.orthographyId);
  const scriptTag = normalizeInteropString(parsed.scriptTag);
  const regionTag = normalizeInteropString(parsed.regionTag);
  const variantTag = normalizeInteropString(parsed.variantTag);
  const resolvedBridgeId = resolveInteropBridgeId(parsed);
  const timelineMode =
    parsed.timelineMode === 'document' || parsed.timelineMode === 'media'
      ? parsed.timelineMode
      : undefined;
  const logicalDurationSec =
    typeof parsed.logicalDurationSec === 'number' && Number.isFinite(parsed.logicalDurationSec)
      ? parsed.logicalDurationSec
      : undefined;
  const timebaseLabel = normalizeInteropString(parsed.timebaseLabel);
  const metadata: OrthographyInteropMetadata = {
    ...(languageId !== undefined && languageId.length > 0 ? { languageId } : {}),
    ...(orthographyId !== undefined && orthographyId.length > 0 ? { orthographyId } : {}),
    ...(scriptTag !== undefined && scriptTag.length > 0 ? { scriptTag } : {}),
    ...(regionTag !== undefined && regionTag.length > 0 ? { regionTag } : {}),
    ...(variantTag !== undefined && variantTag.length > 0 ? { variantTag } : {}),
    ...(resolvedBridgeId !== undefined && resolvedBridgeId.length > 0
      ? { bridgeId: resolvedBridgeId }
      : {}),
    ...(timelineMode !== undefined ? { timelineMode } : {}),
    ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
    ...(timebaseLabel !== undefined && timebaseLabel.length > 0 ? { timebaseLabel } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
