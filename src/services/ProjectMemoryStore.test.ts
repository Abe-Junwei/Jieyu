/**
 * ProjectMemoryStore 单元测试
 * Unit tests for ProjectMemoryStore
 *
 * IndexedDB 操作 mock 为成功/失败两条路径，聚焦 in-memory 逻辑。
 * IndexedDB ops are mocked for success/failure paths; focus on in-memory logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── fake-indexeddb shim ───────────────────────────────────────────────────────
// 提供一个极简的 IDB stub，仅覆盖 ProjectMemoryStore 用到的 API 子集
// Minimal IDB stub covering only the API subset used by ProjectMemoryStore

function createFakeIdb(options?: {
  hasObjectStore?: boolean;
  failWrites?: boolean;
}) {
  const store = new Map<string, unknown>();

  const fakeObjectStore = (mode: string) => ({
    put(value: { projectId: string }) {
      store.set(value.projectId, structuredClone(value));
    },
    get(key: string) {
      const req = { result: store.get(key) ?? null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  });

  const fakeDb = {
    transaction(_name: string, mode = 'readonly') {
      const objStore = fakeObjectStore(mode);
      return {
        objectStore: () => objStore,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null as DOMException | null,
        _objStore: objStore,
      };
    },
    createObjectStore: vi.fn(),
    close: vi.fn(),
    onclose: null as (() => void) | null,
    onversionchange: null as (() => void) | null,
    objectStoreNames: { contains: () => options?.hasObjectStore ?? true },
  };

  // Wrapping transaction to fire oncomplete
  const origTransaction = fakeDb.transaction.bind(fakeDb);
  fakeDb.transaction = ((name: string, mode = 'readonly') => {
    const tx = origTransaction(name, mode);
    // For write transactions, fire oncomplete async
    if (mode === 'readwrite') {
      const origPut = tx._objStore.put;
      tx._objStore.put = (value: { projectId: string }) => {
        origPut(value);
        queueMicrotask(() => {
          if (options?.failWrites) {
            tx.error = new DOMException('write failed', 'AbortError');
            tx.onerror?.();
            return;
          }
          tx.oncomplete?.();
        });
      };
    }
    return tx;
  }) as typeof fakeDb.transaction;

  const fakeRequest = {
    result: fakeDb,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null,
  };

  // 延迟触发 onsuccess | Trigger onsuccess async
  queueMicrotask(() => {
    fakeRequest.onupgradeneeded?.();
    fakeRequest.onsuccess?.();
  });

  return { store, fakeDb, fakeRequest };
}

// ── Module-level setup ───────────────────────────────────────────────────────

let fakeIdb: ReturnType<typeof createFakeIdb>;
let indexedDbOpenImpl: () => {
  result?: unknown;
  error?: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
};

function createOpenErrorRequest(error: DOMException | Error) {
  const fakeRequest = {
    result: undefined,
    error,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null,
  };
  queueMicrotask(() => {
    fakeRequest.onerror?.();
  });
  return fakeRequest;
}

vi.stubGlobal('indexedDB', {
  open: () => {
    return indexedDbOpenImpl();
  },
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type PMS = typeof import('./ProjectMemoryStore');

async function freshModule() {
  vi.resetModules();
  const mod: PMS = await import('./ProjectMemoryStore');
  return mod;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectMemoryStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    indexedDbOpenImpl = () => {
      fakeIdb = createFakeIdb();
      return fakeIdb.fakeRequest;
    };
    fakeIdb?.store.clear();
  });

  // ── loadProject ──────────────────────────────────────────────────────────

  describe('loadProject', () => {
    it('加载不存在的项目返回空记忆 | returns empty memory for unknown project', async () => {
      const { projectMemoryStore: store } = await freshModule();
      const mem = await store.loadProject('proj-1');
      expect(mem.projectId).toBe('proj-1');
      expect(mem.terms).toEqual([]);
      expect(mem.phrasePatterns).toEqual([]);
      expect(mem.speakers).toEqual([]);
      expect(store.currentProjectId).toBe('proj-1');
      store.dispose();
    });

    it('通知监听器 | notifies listeners on load', async () => {
      const { projectMemoryStore: store } = await freshModule();
      const listener = vi.fn();
      store.onMemoryChange(listener);
      await store.loadProject('proj-x');
      expect(listener).toHaveBeenCalledOnce();
      store.dispose();
    });

    it('对象仓库缺失时创建 schema | creates object store on upgrade when missing', async () => {
      indexedDbOpenImpl = () => {
        fakeIdb = createFakeIdb({ hasObjectStore: false });
        return fakeIdb.fakeRequest;
      };

      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('proj-schema');

      expect(fakeIdb.fakeDb.createObjectStore).toHaveBeenCalledWith('projectMemory', { keyPath: 'projectId' });
      store.dispose();
    });

    it('open 失败时回退为空记忆 | falls back to empty memory when IndexedDB open fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      indexedDbOpenImpl = () => createOpenErrorRequest(new DOMException('open failed', 'InvalidStateError'));

      const { projectMemoryStore: store } = await freshModule();
      const memory = await store.loadProject('proj-open-fail');

      expect(memory.projectId).toBe('proj-open-fail');
      expect(memory.terms).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      store.dispose();
    });
  });

  // ── Term management ────────────────────────────────────────────────────

  describe('confirmTerm', () => {
    it('添加新术语 | adds a new term', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('toki', 'language', 'tok');
      const mem = store.getMemory()!;
      expect(mem.terms).toHaveLength(1);
      expect(mem.terms[0]).toMatchObject({ term: 'toki', gloss: 'language', lang: 'tok', useCount: 1 });
      store.dispose();
    });

    it('确认已存在术语时递增 useCount | increments useCount for existing term', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('toki', 'language', 'tok');
      await store.confirmTerm('toki', 'speech', 'tok');
      const mem = store.getMemory()!;
      expect(mem.terms).toHaveLength(1);
      expect(mem.terms[0]!.useCount).toBe(2);
      expect(mem.terms[0]!.gloss).toBe('speech'); // 最新值 | latest value
      store.dispose();
    });

    it('不同语言的同名术语分别存储 | same term in different langs stored separately', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('hello', 'greet', 'eng');
      await store.confirmTerm('hello', 'bonjour', 'fra');
      expect(store.getMemory()!.terms).toHaveLength(2);
      store.dispose();
    });

    it('未加载 memory 时静默忽略 | silently ignores when no memory', async () => {
      const { projectMemoryStore: store } = await freshModule();
      // 不调用 loadProject
      await expect(store.confirmTerm('x', 'y', 'z')).resolves.toBeUndefined();
      store.dispose();
    });

    it('可恢复状态错误时重试一次 | retries once on recoverable IndexedDB state errors', async () => {
      let firstOpen = true;
      indexedDbOpenImpl = () => {
        fakeIdb = createFakeIdb();
        if (firstOpen) {
          firstOpen = false;
          const originalTransaction = fakeIdb.fakeDb.transaction.bind(fakeIdb.fakeDb);
          fakeIdb.fakeDb.transaction = ((name: string, mode = 'readonly') => {
            if (mode === 'readwrite') {
              throw new DOMException('retryable state error', 'InvalidStateError');
            }
            return originalTransaction(name, mode);
          }) as typeof fakeIdb.fakeDb.transaction;
        }
        return fakeIdb.fakeRequest;
      };

      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p-retry');
      await store.confirmTerm('toki', 'language', 'tok');

      expect(store.getMemory()!.terms).toHaveLength(1);
      expect(store.getMemory()!.terms[0]!.term).toBe('toki');
      store.dispose();
    });

    it('持久化失败时保留内存更新 | keeps in-memory update when persistence fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      indexedDbOpenImpl = () => {
        fakeIdb = createFakeIdb({ failWrites: true });
        return fakeIdb.fakeRequest;
      };

      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p-persist-fail');
      await store.confirmTerm('toki', 'language', 'tok');

      expect(store.getMemory()!.terms).toHaveLength(1);
      expect(store.getMemory()!.terms[0]!.gloss).toBe('language');
      expect(warnSpy).toHaveBeenCalledWith('[ProjectMemoryStore] persist failed, staying in-memory only:', expect.any(DOMException));
      store.dispose();
    });
  });

  // ── searchTerms ────────────────────────────────────────────────────────

  describe('searchTerms', () => {
    it('按子串大小写不敏感搜索 | case-insensitive substring search', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('Toki', 'language', 'tok');
      await store.confirmTerm('pona', 'good', 'tok');
      const results = store.searchTerms('tok', 'tok');
      expect(results).toHaveLength(1);
      expect(results[0]!.term).toBe('Toki');
      store.dispose();
    });

    it('按 useCount 降序，受 limit 限制 | sorted by useCount desc, respects limit', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('a', 'x', 'en');
      await store.confirmTerm('ab', 'y', 'en');
      await store.confirmTerm('ab', 'y', 'en'); // useCount=2
      const results = store.searchTerms('a', 'en', 1);
      expect(results).toHaveLength(1);
      expect(results[0]!.term).toBe('ab'); // 更高频优先
      store.dispose();
    });
  });

  // ── Phrase patterns ──────────────────────────────────────────────────────

  describe('recordPhrase', () => {
    it('记录新短语 | records a new phrase', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.recordPhrase('mi moku', 'I eat', 'greeting');
      expect(store.getMemory()!.phrasePatterns).toHaveLength(1);
      expect(store.getMemory()!.phrasePatterns[0]!.occurrences).toBe(1);
      store.dispose();
    });

    it('重复短语递增计数 | increments occurrence count', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.recordPhrase('mi moku', 'I eat', 'greeting');
      await store.recordPhrase('mi moku', 'I eat', 'greeting');
      expect(store.getMemory()!.phrasePatterns[0]!.occurrences).toBe(2);
      store.dispose();
    });

    it('短语超过 200 条时截断 | trims to 200 entries', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      for (let i = 0; i < 210; i++) {
        await store.recordPhrase(`p${i}`, `t${i}`, 'ctx');
      }
      expect(store.getMemory()!.phrasePatterns.length).toBeLessThanOrEqual(200);
      store.dispose();
    });
  });

  describe('getTopPhrases', () => {
    it('按出现次数排序 | sorted by occurrences', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.recordPhrase('a', 'ta', 'ctx');
      await store.recordPhrase('b', 'tb', 'ctx');
      await store.recordPhrase('b', 'tb', 'ctx');
      const top = store.getTopPhrases(1);
      expect(top[0]!.pattern).toBe('b');
      store.dispose();
    });
  });

  // ── Speaker ───────────────────────────────────────────────────────────────

  describe('updateSpeakerProfile', () => {
    it('创建说话人 | creates speaker', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.updateSpeakerProfile('spk1', { speakingRateWpm: 120 });
      const s = store.getSpeakerProfile('spk1');
      expect(s).not.toBeNull();
      expect(s!.speakingRateWpm).toBe(120);
      expect(s!.sessionCount).toBe(1);
      store.dispose();
    });

    it('更新已有说话人递增 sessionCount | increments sessionCount', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.updateSpeakerProfile('spk1', { speakingRateWpm: 100 });
      await store.updateSpeakerProfile('spk1', { speakingRateWpm: 150 });
      const s = store.getSpeakerProfile('spk1');
      expect(s!.sessionCount).toBe(2);
      expect(s!.speakingRateWpm).toBe(150);
      store.dispose();
    });
  });

  // ── Domain vocabulary ─────────────────────────────────────────────────────

  describe('addDomainVocabulary', () => {
    it('添加新领域词汇 | adds new domain', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.addDomainVocabulary('medical', ['symptom', 'diagnosis']);
      const d = store.getDomainVocabulary('medical');
      expect(d).not.toBeNull();
      expect(d!.terms).toEqual(['symptom', 'diagnosis']);
      store.dispose();
    });

    it('合并现有领域词汇（去重）| merges and deduplicates', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.addDomainVocabulary('medical', ['symptom']);
      await store.addDomainVocabulary('medical', ['symptom', 'treatment']);
      const d = store.getDomainVocabulary('medical')!;
      expect(d.terms).toEqual(['symptom', 'treatment']);
      store.dispose();
    });
  });

  // ── RAG context block ─────────────────────────────────────────────────────

  describe('getRagContextBlock', () => {
    it('无 memory 时返回空字符串 | returns empty string without memory', async () => {
      const { projectMemoryStore: store } = await freshModule();
      expect(store.getRagContextBlock()).toBe('');
      store.dispose();
    });

    it('包含术语、短语、领域词汇 | includes terms, phrases, domain vocab', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('toki', 'language', 'tok');
      await store.recordPhrase('mi moku', 'I eat', 'greeting');
      await store.addDomainVocabulary('linguistics', ['phoneme']);
      const block = store.getRagContextBlock();
      expect(block).toContain('toki');
      expect(block).toContain('mi moku');
      expect(block).toContain('linguistics');
      store.dispose();
    });
  });

  // ── getRagContextVector ───────────────────────────────────────────────────

  describe('getRagContextVector', () => {
    it('无 memory / 空 query 时返回空 | returns [] when no memory or empty query', async () => {
      const { projectMemoryStore: store } = await freshModule();
      expect(store.getRagContextVector('hello')).toEqual([]);
      await store.loadProject('p1');
      expect(store.getRagContextVector('')).toEqual([]);
      store.dispose();
    });

    it('使用 fuzzy 搜索匹配术语和短语 | fuzzy matches terms and phrases', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      await store.confirmTerm('phoneme', 'minimal sound unit', 'eng');
      await store.recordPhrase('morpheme boundary', 'word boundary', 'morphology');
      const results = store.getRagContextVector('phoneme', { topK: 5, minScore: 0.0 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.kind).toBe('term');
      store.dispose();
    });

    it('topK 限制返回数量 | topK limits results', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      for (let i = 0; i < 15; i++) {
        await store.confirmTerm(`word${i}`, `gloss${i}`, 'en');
      }
      const results = store.getRagContextVector('word', { topK: 3, minScore: 0 });
      expect(results.length).toBeLessThanOrEqual(3);
      store.dispose();
    });
  });

  // ── dispose / listener ────────────────────────────────────────────────────

  describe('dispose', () => {
    it('清理后 getMemory 返回 null | returns null after dispose', async () => {
      const { projectMemoryStore: store } = await freshModule();
      await store.loadProject('p1');
      store.dispose();
      expect(store.getMemory()).toBeNull();
      expect(store.currentProjectId).toBeNull();
    });

    it('退订监听器 | unsubscribe works', async () => {
      const { projectMemoryStore: store } = await freshModule();
      const listener = vi.fn();
      const unsub = store.onMemoryChange(listener);
      unsub();
      await store.loadProject('p1');
      expect(listener).not.toHaveBeenCalled();
      store.dispose();
    });
  });
});
