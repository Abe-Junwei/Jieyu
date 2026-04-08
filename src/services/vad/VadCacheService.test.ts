import { describe, expect, it, beforeEach, vi } from 'vitest';
import { VadCacheService } from './VadCacheService';

// 使用独立实例避免污染全局单例 | Use isolated instances to avoid polluting the global singleton
function makeService(): VadCacheService {
  return new VadCacheService();
}

// stub localStorage
function withLocalStorage(fn: () => void) {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
  };
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: original, writable: true, configurable: true });
  }
}

describe('VadCacheService', () => {
  beforeEach(() => {
    // 清除可能残留的 localStorage key
    try { localStorage.removeItem('jieyu:vad-cache'); } catch { /* ignore */ }
  });

  it('returns null for unknown mediaId', () => {
    const svc = makeService();
    expect(svc.get('unknown-id')).toBeNull();
  });

  it('stores and retrieves VAD entry', () => {
    const svc = makeService();
    const entry = {
      engine: 'silero' as const,
      segments: [{ start: 1, end: 2 }, { start: 3.5, end: 5 }],
      durationSec: 10,
      cachedAt: Date.now(),
    };
    svc.set('media-1', entry);
    const result = svc.get('media-1');
    expect(result).not.toBeNull();
    expect(result!.segments).toEqual(entry.segments);
    expect(result!.engine).toBe('silero');
  });

  it('invalidate removes a cached entry', () => {
    const svc = makeService();
    svc.set('media-2', {
      engine: 'energy',
      segments: [{ start: 0, end: 1 }],
      durationSec: 5,
      cachedAt: Date.now(),
    });
    expect(svc.get('media-2')).not.toBeNull();
    svc.invalidate('media-2');
    expect(svc.get('media-2')).toBeNull();
  });

  it('clear removes all entries', () => {
    const svc = makeService();
    svc.set('a', { engine: 'silero', segments: [], durationSec: 1, cachedAt: Date.now() });
    svc.set('b', { engine: 'energy', segments: [], durationSec: 2, cachedAt: Date.now() });
    expect(svc.size).toBe(2);
    svc.clear();
    expect(svc.size).toBe(0);
  });

  it('evicts oldest entry when exceeding max size', () => {
    const svc = makeService();
    // 写入 201 条（MAX_ENTRIES=200），第一条应被淘汰
    for (let i = 0; i <= 200; i++) {
      svc.set(`media-${i}`, {
        engine: 'silero',
        segments: [],
        durationSec: 1,
        cachedAt: Date.now(),
      });
    }
    expect(svc.size).toBe(200);
    expect(svc.get('media-0')).toBeNull();
    expect(svc.get('media-200')).not.toBeNull();
  });

  it('expired entries are not returned', () => {
    const svc = makeService();
    svc.set('old', {
      engine: 'silero',
      segments: [{ start: 0, end: 1 }],
      durationSec: 5,
      // 8 天前（超过 7 天 TTL）
      cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    expect(svc.get('old')).toBeNull();
  });

  it('persists to and loads from localStorage', () => {
    withLocalStorage(() => {
      const svc1 = new VadCacheService();
      svc1.set('persist-test', {
        engine: 'energy',
        segments: [{ start: 2, end: 3 }],
        durationSec: 10,
        cachedAt: Date.now(),
      });

      // 模拟新实例从 localStorage 恢复
      const svc2 = new VadCacheService();
      const result = svc2.get('persist-test');
      expect(result).not.toBeNull();
      expect(result!.segments).toEqual([{ start: 2, end: 3 }]);
    });
  });

  it('reports correct size', () => {
    const svc = makeService();
    expect(svc.size).toBe(0);
    svc.set('x', { engine: 'silero', segments: [], durationSec: 1, cachedAt: Date.now() });
    expect(svc.size).toBe(1);
  });

  it('notifies subscribers when entries change', () => {
    const svc = makeService();
    const listener = vi.fn();
    const unsubscribe = svc.subscribe(listener);

    svc.set('media-sub', { engine: 'silero', segments: [], durationSec: 1, cachedAt: Date.now() });
    svc.invalidate('media-sub');

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    svc.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
