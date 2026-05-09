/**
 * argNormalizers — Local context tool argument normalizers
 * Extracted from localContextToolExecutors.ts
 */

export function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function tokenizeLocalSearchQuery(query: string): string[] {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return [];
  const cjkChars = lowered.match(/[\u4e00-\u9fff]/g) ?? [];
  const latinWords = lowered.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  return [...new Set([...cjkChars, ...latinWords])];
}

export function normalizeLimit(value: unknown, fallback = 5): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(20, Math.max(1, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(20, Math.max(1, Math.floor(parsed)));
    }
  }
  return fallback;
}

export const LIST_UNITS_DEFAULT_OFFSET_MAX = 500;
export const LIST_UNITS_SNAPSHOT_OFFSET_MAX = 10_000_000;

export function normalizeOffset(
  value: unknown,
  fallback = 0,
  maxOffset = LIST_UNITS_DEFAULT_OFFSET_MAX,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(maxOffset, Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(maxOffset, Math.max(0, Math.floor(parsed)));
    }
  }
  return fallback;
}

export function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

export function normalizeLayerTypeFilter(
  value: unknown,
): 'transcription' | 'translation' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transcription' || normalized === 'translation') return normalized;
  return undefined;
}
