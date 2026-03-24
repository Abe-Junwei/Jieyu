import type { StructuredErrorMeta } from '../utils/errorProtocol';

export interface ErrorAggregationEntry {
  category: StructuredErrorMeta['category'];
  action: string;
  recoverable: boolean;
  i18nKey?: string;
  count: number;
  lastSeenAt: string;
}

const buckets = new Map<string, ErrorAggregationEntry>();

function bucketKey(meta: StructuredErrorMeta): string {
  const i18n = meta.i18nKey ?? '';
  return `${meta.category}::${meta.action}::${String(meta.recoverable)}::${i18n}`;
}

export function recordStructuredError(meta: StructuredErrorMeta): void {
  const key = bucketKey(meta);
  const now = new Date().toISOString();
  const existing = buckets.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    return;
  }
  buckets.set(key, {
    category: meta.category,
    action: meta.action,
    recoverable: meta.recoverable,
    ...(meta.i18nKey !== undefined && { i18nKey: meta.i18nKey }),
    count: 1,
    lastSeenAt: now,
  });
}

export function getStructuredErrorAggregation(): ErrorAggregationEntry[] {
  return [...buckets.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.action.localeCompare(b.action);
  });
}

export function resetStructuredErrorAggregation(): void {
  buckets.clear();
}
