import Dexie, { type Table } from 'dexie';
import type { AcousticFeatureResult } from '../../utils/acousticOverlayTypes';

const ACOUSTIC_CACHE_DB_NAME = 'jieyu-acoustic-analysis';
const MAX_TOTAL_ENTRIES = 24;
const MAX_MEDIA_ENTRIES = 6;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export type AcousticCacheStatus = 'fresh' | 'stale';

interface AcousticAnalysisCacheRow {
  cacheKey: string;
  mediaKey: string;
  status: AcousticCacheStatus;
  result: AcousticFeatureResult;
  byteSize: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface AcousticAnalysisCacheEntrySummary {
  cacheKey: string;
  mediaKey: string;
  status: AcousticCacheStatus;
  byteSize: number;
  createdAt: number;
  lastAccessedAt: number;
}

class AcousticAnalysisDexie extends Dexie {
  entries!: Table<AcousticAnalysisCacheRow, string>;

  constructor() {
    super(ACOUSTIC_CACHE_DB_NAME);
    this.version(1).stores({
      entries: 'cacheKey, mediaKey, status, lastAccessedAt, [mediaKey+status]',
    });
  }
}

function measureResultByteSize(result: AcousticFeatureResult): number {
  return new TextEncoder().encode(JSON.stringify(result)).length;
}

function compareEvictionPriority(
  left: AcousticAnalysisCacheRow,
  right: AcousticAnalysisCacheRow,
  currentMediaKey?: string,
  protectedCacheKey?: string,
): number {
  if (left.cacheKey === protectedCacheKey && right.cacheKey !== protectedCacheKey) return 1;
  if (right.cacheKey === protectedCacheKey && left.cacheKey !== protectedCacheKey) return -1;
  if (left.status !== right.status) return left.status === 'stale' ? -1 : 1;
  const leftIsCurrentMedia = currentMediaKey !== undefined && left.mediaKey === currentMediaKey;
  const rightIsCurrentMedia = currentMediaKey !== undefined && right.mediaKey === currentMediaKey;
  if (leftIsCurrentMedia !== rightIsCurrentMedia) return leftIsCurrentMedia ? 1 : -1;
  return left.lastAccessedAt - right.lastAccessedAt;
}

export class AcousticAnalysisCacheDB {
  private db = new AcousticAnalysisDexie();

  async get(cacheKey: string, now: number): Promise<AcousticFeatureResult | null> {
    try {
      const row = await this.db.entries.get(cacheKey);
      if (!row) return null;
      await this.db.entries.update(cacheKey, { lastAccessedAt: now });
      return row.result;
    } catch {
      return null;
    }
  }

  async put(input: {
    cacheKey: string;
    mediaKey: string;
    result: AcousticFeatureResult;
    now: number;
  }): Promise<void> {
    const { cacheKey, mediaKey, result, now } = input;
    const byteSize = measureResultByteSize(result);

    try {
      await this.db.transaction('rw', this.db.entries, async () => {
        await this.db.entries.where('[mediaKey+status]').equals([mediaKey, 'fresh']).modify((row) => {
          if (row.cacheKey !== cacheKey) {
            row.status = 'stale';
          }
        });

        await this.db.entries.put({
          cacheKey,
          mediaKey,
          status: 'fresh',
          result,
          byteSize,
          createdAt: now,
          lastAccessedAt: now,
        });

        await this.pruneWithinTransaction(mediaKey, cacheKey);
      });
    } catch {
      // IndexedDB 不可用时静默降级，不阻断分析主路径。
    }
  }

  async listEntriesForMedia(mediaKey: string): Promise<AcousticAnalysisCacheEntrySummary[]> {
    try {
      const rows = await this.db.entries.where('mediaKey').equals(mediaKey).toArray();
      return rows
        .sort((left, right) => compareEvictionPriority(left, right))
        .map((row) => ({
          cacheKey: row.cacheKey,
          mediaKey: row.mediaKey,
          status: row.status,
          byteSize: row.byteSize,
          createdAt: row.createdAt,
          lastAccessedAt: row.lastAccessedAt,
        }));
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      await this.db.entries.clear();
    } catch {
      // ignore
    }
  }

  private async pruneWithinTransaction(currentMediaKey: string, protectedCacheKey: string): Promise<void> {
    const rows = await this.db.entries.toArray();
    const deleteKeys = new Set<string>();

    const mediaGroups = new Map<string, AcousticAnalysisCacheRow[]>();
    for (const row of rows) {
      const existing = mediaGroups.get(row.mediaKey);
      if (existing) {
        existing.push(row);
      } else {
        mediaGroups.set(row.mediaKey, [row]);
      }
    }

    for (const group of mediaGroups.values()) {
      let groupBytes = group.reduce((sum, row) => sum + row.byteSize, 0);
      const ordered = [...group].sort((left, right) => compareEvictionPriority(left, right, currentMediaKey, protectedCacheKey));
      let remainingCount = ordered.filter((row) => !deleteKeys.has(row.cacheKey)).length;
      while (remainingCount > MAX_MEDIA_ENTRIES || groupBytes > MAX_MEDIA_BYTES) {
        const candidate = ordered.find((row) => !deleteKeys.has(row.cacheKey) && row.cacheKey !== protectedCacheKey);
        if (!candidate) break;
        deleteKeys.add(candidate.cacheKey);
        remainingCount -= 1;
        groupBytes -= candidate.byteSize;
      }
    }

    let remainingRows = rows.filter((row) => !deleteKeys.has(row.cacheKey));
    let totalBytes = remainingRows.reduce((sum, row) => sum + row.byteSize, 0);
    const globalOrdered = [...remainingRows].sort((left, right) => compareEvictionPriority(left, right, currentMediaKey, protectedCacheKey));
    while (remainingRows.length > MAX_TOTAL_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
      const candidate = globalOrdered.find((row) => !deleteKeys.has(row.cacheKey) && row.cacheKey !== protectedCacheKey);
      if (!candidate) break;
      deleteKeys.add(candidate.cacheKey);
      totalBytes -= candidate.byteSize;
      remainingRows = remainingRows.filter((row) => row.cacheKey !== candidate.cacheKey);
    }

    if (deleteKeys.size > 0) {
      await this.db.entries.bulkDelete(Array.from(deleteKeys));
    }
  }
}

export const acousticAnalysisCacheDB = new AcousticAnalysisCacheDB();