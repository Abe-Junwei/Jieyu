/**
 * VadCacheService — VAD 结果持久化缓存
 * Persistent cache for VAD (Voice Activity Detection) results.
 *
 * 策略 | Strategy:
 *   - 以 mediaId 为键，VAD 结果存入 localStorage（JSON 序列化）
 *   - 内存 Map 作为一级缓存避免反复 JSON.parse
 *   - 带版本号和过期机制，版本变更或过期自动失效
 *   - 最多缓存 MAX_ENTRIES 条，LRU 淘汰
 *
 * 不使用 Dexie 表的原因: VAD 是可重新生成的派生数据，不值得 schema 迁移。
 * localStorage 对这类小体量缓存（通常 <100 条 × <5 KB/条）足够。
 */

import type { SpeechSegment } from './WhisperXVadService';

// ── Configuration ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jieyu:vad-cache';
const CACHE_VERSION = 1;
const MAX_ENTRIES = 200;
/** 缓存有效期（毫秒）：7 天 | Cache TTL: 7 days */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface VadCacheEntry {
  /** 缓存来源引擎 | VAD engine that produced the segments */
  engine: 'silero' | 'energy';
  /** 语音段列表 | Detected speech segments */
  segments: SpeechSegment[];
  /** 音频时长（秒）| Audio duration in seconds */
  durationSec: number;
  /** 缓存时间戳 | Timestamp when cached */
  cachedAt: number;
}

interface StoragePayload {
  version: number;
  entries: Record<string, VadCacheEntry>;
  /** LRU 访问顺序（最近在末尾）| LRU access order (most recent at end) */
  accessOrder: string[];
}

// ── Service ──────────────────────────────────────────────────────────────────

export class VadCacheService {
  private memoryCache = new Map<string, VadCacheEntry>();
  private accessOrder: string[] = [];
  private loaded = false;

  /**
   * 获取缓存的 VAD 结果（未命中返回 null）
   * Get cached VAD result for a media item (returns null on miss).
   */
  get(mediaId: string): VadCacheEntry | null {
    this.ensureLoaded();
    const entry = this.memoryCache.get(mediaId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.memoryCache.delete(mediaId);
      this.accessOrder = this.accessOrder.filter((id) => id !== mediaId);
      return null;
    }
    // LRU touch
    this.accessOrder = this.accessOrder.filter((id) => id !== mediaId);
    this.accessOrder.push(mediaId);
    return entry;
  }

  /**
   * 存入 VAD 缓存
   * Store a VAD result in cache.
   */
  set(mediaId: string, entry: VadCacheEntry): void {
    this.ensureLoaded();
    this.memoryCache.set(mediaId, entry);
    this.accessOrder = this.accessOrder.filter((id) => id !== mediaId);
    this.accessOrder.push(mediaId);
    this.evictIfNeeded();
    this.persist();
  }

  /**
   * 使特定媒体的缓存失效
   * Invalidate cache for a specific media item.
   */
  invalidate(mediaId: string): void {
    this.ensureLoaded();
    this.memoryCache.delete(mediaId);
    this.accessOrder = this.accessOrder.filter((id) => id !== mediaId);
    this.persist();
  }

  /**
   * 清空全部缓存
   * Clear all cached VAD results.
   */
  clear(): void {
    this.memoryCache.clear();
    this.accessOrder = [];
    this.loaded = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage 不可用时静默失败
    }
  }

  /** 返回当前缓存条目数（用于诊断）| Return current cache size for diagnostics */
  get size(): number {
    this.ensureLoaded();
    return this.memoryCache.size;
  }

  // ── Internal ──

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload: StoragePayload = JSON.parse(raw);
      if (payload.version !== CACHE_VERSION) return;
      const now = Date.now();
      for (const [id, entry] of Object.entries(payload.entries)) {
        if (now - entry.cachedAt <= TTL_MS) {
          this.memoryCache.set(id, entry);
        }
      }
      this.accessOrder = (payload.accessOrder ?? []).filter((id) => this.memoryCache.has(id));
    } catch {
      // 损坏的缓存数据直接丢弃
    }
  }

  private evictIfNeeded(): void {
    while (this.memoryCache.size > MAX_ENTRIES && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.memoryCache.delete(oldest);
    }
  }

  private persist(): void {
    try {
      const entries: Record<string, VadCacheEntry> = {};
      for (const [id, entry] of this.memoryCache) {
        entries[id] = entry;
      }
      const payload: StoragePayload = {
        version: CACHE_VERSION,
        entries,
        accessOrder: this.accessOrder,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage 写入失败时静默降级（不影响功能）
    }
  }
}

/** 全局单例 | Global singleton */
export const vadCache = new VadCacheService();
