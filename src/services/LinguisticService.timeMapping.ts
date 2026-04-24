export interface TextTimeMapping {
  offsetSec: number;
  scale: number;
  revision: number;
  updatedAt: string;
  sourceMediaId?: string;
}

export interface UpdateTextTimeMappingInput {
  textId: string;
  offsetSec?: number;
  scale?: number;
  sourceMediaId?: string;
}

export interface PreviewTextTimeMappingInput {
  startTime: number;
  endTime: number;
  offsetSec?: number;
  scale?: number;
}

export interface PreviewTextTimeMappingResult {
  documentStartTime: number;
  documentEndTime: number;
  realStartTime: number;
  realEndTime: number;
  offsetSec: number;
  scale: number;
}

export function normalizeTextTimeMapping(value: unknown): TextTimeMapping | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<TextTimeMapping>;
  const offsetSec = typeof candidate.offsetSec === 'number' && Number.isFinite(candidate.offsetSec)
    ? candidate.offsetSec
    : undefined;
  const scale = typeof candidate.scale === 'number' && Number.isFinite(candidate.scale)
    ? candidate.scale
    : undefined;
  if (offsetSec === undefined || scale === undefined) return undefined;
  return {
    offsetSec,
    scale,
    revision: typeof candidate.revision === 'number' && Number.isFinite(candidate.revision)
      ? Math.max(1, Math.trunc(candidate.revision))
      : 1,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim().length > 0
      ? candidate.updatedAt
      : new Date(0).toISOString(),
    ...(typeof candidate.sourceMediaId === 'string' && candidate.sourceMediaId.trim().length > 0
      ? { sourceMediaId: candidate.sourceMediaId.trim() }
      : {}),
  };
}

export function mergeTextTimeMappingHistory(
  currentMapping: TextTimeMapping | undefined,
  rawHistory: unknown,
): TextTimeMapping[] | undefined {
  const normalizedHistory = Array.isArray(rawHistory)
    ? rawHistory
      .map((item) => normalizeTextTimeMapping(item))
      .filter((item): item is TextTimeMapping => item !== undefined)
    : [];

  const merged = currentMapping ? [currentMapping, ...normalizedHistory] : normalizedHistory;
  const deduped: TextTimeMapping[] = [];
  const seen = new Set<string>();

  for (const item of merged) {
    const key = `${item.revision}:${item.offsetSec}:${item.scale}:${item.sourceMediaId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 8) break;
  }

  return deduped.length > 0 ? deduped : undefined;
}

export function previewTextTimeMapping(input: PreviewTextTimeMappingInput): PreviewTextTimeMappingResult {
  const { startTime, endTime } = input;
  const offsetSec = input.offsetSec ?? 0;
  const scale = input.scale ?? 1;

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new Error('startTime 与 endTime 必须是有限数字');
  }
  if (endTime < startTime) {
    throw new Error('endTime 不能小于 startTime');
  }
  if (!Number.isFinite(offsetSec)) {
    throw new Error('offsetSec 必须是有限数字');
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('scale 必须是大于 0 的有限数字');
  }

  const mappedStart = offsetSec + scale * startTime;
  const mappedEnd = offsetSec + scale * endTime;
  const realStartTime = Math.max(0, mappedStart);
  const realEndTime = Math.max(realStartTime, mappedEnd);

  return {
    documentStartTime: startTime,
    documentEndTime: endTime,
    realStartTime,
    realEndTime,
    offsetSec,
    scale,
  };
}

export function invertTextTimeMapping(
  realTime: number,
  mapping: Pick<TextTimeMapping, 'offsetSec' | 'scale'>,
): number {
  if (!Number.isFinite(realTime)) {
    throw new Error('realTime 必须是有限数字');
  }
  if (!Number.isFinite(mapping.offsetSec)) {
    throw new Error('offsetSec 必须是有限数字');
  }
  if (!Number.isFinite(mapping.scale) || mapping.scale <= 0) {
    throw new Error('scale 必须是大于 0 的有限数字');
  }
  return Math.max(0, (realTime - mapping.offsetSec) / mapping.scale);
}
