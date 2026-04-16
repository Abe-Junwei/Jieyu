/**
 * ProjectMemoryStore — 跨会话项目记忆持久化
 *
 * 在多次会话中积累项目相关知识，无需每次重新输入。
 * 存储内容：
 *  - 已确认的术语表（用户认可过的 gloss 条目）
 *  - 说话人声音特征摘要（用于个性化 STT）
 *  - 领域特定词汇（语言学/主题相关）
 *  - 常见短语/固定表达（用于 RAG 增强）
 *  - 段落结构模式（重复性结构、惯用语序）
 *
 * 数据存储在 IndexedDB（独立于 userBehaviorDB），按项目隔离。
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段4
 */

import MiniSearch from 'minisearch';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TermEntry {
  term: string;
  gloss: string;
  lang: string; // ISO 639-3
  confirmedAt: number;
  useCount: number;
  lastUsedAt: number;
}

export interface PhrasePattern {
  pattern: string;
  translation: string;
  context: string; // e.g. "greeting", "farewell", "question"
  occurrences: number;
  lastSeenAt: number;
}

export interface SpeakerProfile {
  speakerId: string;
  /** Typical speaking rate (words per minute estimate) */
  speakingRateWpm: number | null;
  /** Preferred language BCP-47 */
  preferredLang: string | null;
  /** Average unit duration in seconds */
  avgUnitDurationSec: number | null;
  /** Acoustic characteristics (SNR estimate) */
  avgSnrDb: number | null;
  lastSeenAt: number;
  sessionCount: number;
}

export interface DomainVocabulary {
  domain: string; // e.g. "medical", "legal", "agricultural"
  terms: string[];
  addedAt: number;
  source: 'auto-detected' | 'user-added' | 'document';
}

export interface ProjectMemory {
  projectId: string;
  /** Confirmed term glossary */
  terms: TermEntry[];
  /** Common phrase patterns */
  phrasePatterns: PhrasePattern[];
  /** Speaker profiles */
  speakers: SpeakerProfile[];
  /** Domain-specific vocabulary */
  domainVocabulary: DomainVocabulary[];
  /** Last updated timestamp */
  updatedAt: number;
}

export interface RAGContextMatch {
  /** One of 'term' | 'phrase' | 'domain' */
  kind: 'term' | 'phrase' | 'domain';
  /** The matched text (term, phrase, or domain name) */
  text: string;
  /** Relevance score 0–1 */
  score: number;
  /** For terms: the confirmed gloss; for phrases: the translation; for domains: null */
  annotation: string | null;
}

export interface GetRagContextVectorOptions {
  /** Maximum number of results to return (default 10) */
  topK?: number;
  /** Minimum score threshold 0–1 (default 0.2) */
  minScore?: number;
}

// ── Default ────────────────────────────────────────────────────────────────────

function createEmptyMemory(projectId: string): ProjectMemory {
  return {
    projectId,
    terms: [],
    phrasePatterns: [],
    speakers: [],
    domainVocabulary: [],
    updatedAt: Date.now(),
  };
}

// ── In-memory store ────────────────────────────────────────────────────────────

class ProjectMemoryStore {
  private static _instance: ProjectMemoryStore | null = null;

  static getInstance(): ProjectMemoryStore {
    if (!ProjectMemoryStore._instance) {
      ProjectMemoryStore._instance = new ProjectMemoryStore();
    }
    return ProjectMemoryStore._instance;
  }

  // ── State ────────────────────────────────────────────────────────────────

  private _currentProjectId: string | null = null;
  private _memory: ProjectMemory | null = null;
  private _listeners = new Set<(m: ProjectMemory) => void>();
  // 缓存 IndexedDB 连接避免频繁 open() | Cache IndexedDB connection to avoid repeated open()
  private _dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {}

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Load memory for a project.
   * If not found in storage, returns empty memory for that project.
   */
  async loadProject(projectId: string): Promise<ProjectMemory> {
    this._currentProjectId = projectId;

    try {
      const stored = await this._loadFromDB(projectId);
      this._memory = stored ?? createEmptyMemory(projectId);
    } catch (err) {
      console.warn('[ProjectMemoryStore] loadProject fallback to empty memory:', err);
      this._memory = createEmptyMemory(projectId);
    }

    this._notifyListeners();
    return this._memory;
  }

  /** Get current memory (null if not loaded) */
  getMemory(): ProjectMemory | null {
    return this._memory;
  }

  /** Get the currently loaded project ID */
  get currentProjectId(): string | null {
    return this._currentProjectId;
  }

  /** Subscribe to memory changes */
  onMemoryChange(callback: (m: ProjectMemory) => void): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  /**
   * Dispose cached resources and listeners.
   * Useful for app teardown, HMR, and tests.
   */
  dispose(): void {
    this._listeners.clear();
    this._memory = null;
    this._currentProjectId = null;
    const dbPromise = this._dbPromise;
    this._dbPromise = null;
    void dbPromise?.then((db) => {
      try {
        db.close();
      } catch (err) {
        console.debug('[ProjectMemoryStore] db.close() failed during dispose:', err);
        // 忽略关闭失败，后续按需懒加载重建 | Ignore close failures and reopen lazily on next use.
      }
    }).catch(() => {
      // 忽略打开失败，后续访问时再重试 | Ignore failed open attempts and retry on later access.
    });
  }

  // ── Term management ───────────────────────────────────────────────────────

  /**
   * Add or confirm a term.
   * If term already exists, updates use count.
   */
  async confirmTerm(term: string, gloss: string, lang: string): Promise<void> {
    if (!this._memory) return;

    const existing = this._memory.terms.find(
      (t) => t.term === term && t.lang === lang,
    );

    if (existing) {
      existing.gloss = gloss;
      existing.useCount += 1;
      existing.lastUsedAt = Date.now();
      existing.confirmedAt = Date.now();
    } else {
      this._memory.terms.push({
        term,
        gloss,
        lang,
        confirmedAt: Date.now(),
        useCount: 1,
        lastUsedAt: Date.now(),
      });
    }

    this._memory.updatedAt = Date.now();
    await this._persist();
    this._notifyListeners();
  }

  /**
   * Search confirmed terms for a given language.
   * Returns terms where query is a substring (case-insensitive).
   */
  searchTerms(query: string, lang: string, limit = 10): TermEntry[] {
    if (!this._memory) return [];
    const q = query.toLowerCase();
    return this._memory.terms
      .filter((t) => t.lang === lang && t.term.toLowerCase().includes(q))
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  // ── Phrase pattern management ────────────────────────────────────────────

  /**
   * Record a phrase pattern occurrence.
   * If pattern already exists, increment count.
   */
  async recordPhrase(pattern: string, translation: string, context: string): Promise<void> {
    if (!this._memory) return;

    const existing = this._memory.phrasePatterns.find((p) => p.pattern === pattern);
    if (existing) {
      existing.occurrences += 1;
      existing.lastSeenAt = Date.now();
    } else {
      this._memory.phrasePatterns.push({
        pattern,
        translation,
        context,
        occurrences: 1,
        lastSeenAt: Date.now(),
      });
    }

    // Keep top 200 patterns by recency
    if (this._memory.phrasePatterns.length > 200) {
      this._memory.phrasePatterns.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      this._memory.phrasePatterns = this._memory.phrasePatterns.slice(0, 200);
    }

    this._memory.updatedAt = Date.now();
    await this._persist();
    this._notifyListeners();
  }

  /**
   * Get top phrase patterns by occurrence count.
   */
  getTopPhrases(limit = 20): PhrasePattern[] {
    if (!this._memory) return [];
    return [...this._memory.phrasePatterns]
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);
  }

  // ── Speaker management ────────────────────────────────────────────────────

  /**
   * Update or create a speaker profile.
   */
  async updateSpeakerProfile(speakerId: string, data: Partial<SpeakerProfile>): Promise<void> {
    if (!this._memory) return;

    const existing = this._memory.speakers.find((s) => s.speakerId === speakerId);
    if (existing) {
      Object.assign(existing, data, {
        lastSeenAt: Date.now(),
        sessionCount: existing.sessionCount + 1,
      });
    } else {
      this._memory.speakers.push({
        speakerId,
        speakingRateWpm: data.speakingRateWpm ?? null,
        preferredLang: data.preferredLang ?? null,
        avgUnitDurationSec: data.avgUnitDurationSec ?? null,
        avgSnrDb: data.avgSnrDb ?? null,
        lastSeenAt: Date.now(),
        sessionCount: 1,
      });
    }

    this._memory.updatedAt = Date.now();
    await this._persist();
    this._notifyListeners();
  }

  /**
   * Get speaker profile by ID.
   */
  getSpeakerProfile(speakerId: string): SpeakerProfile | null {
    return this._memory?.speakers.find((s) => s.speakerId === speakerId) ?? null;
  }

  // ── Domain vocabulary ─────────────────────────────────────────────────────

  /**
   * Add domain vocabulary.
   */
  async addDomainVocabulary(domain: string, terms: string[], source: DomainVocabulary['source'] = 'auto-detected'): Promise<void> {
    if (!this._memory) return;

    const existing = this._memory.domainVocabulary.find((d) => d.domain === domain);
    if (existing) {
      // Merge terms
      const newTerms = terms.filter((t) => !existing.terms.includes(t));
      existing.terms.push(...newTerms);
      existing.addedAt = Date.now();
    } else {
      this._memory.domainVocabulary.push({ domain, terms, addedAt: Date.now(), source });
    }

    this._memory.updatedAt = Date.now();
    await this._persist();
    this._notifyListeners();
  }

  /**
   * Get domain vocabulary for a domain.
   */
  getDomainVocabulary(domain: string): DomainVocabulary | null {
    return this._memory?.domainVocabulary.find((d) => d.domain === domain) ?? null;
  }

  // ── RAG context for LLM ──────────────────────────────────────────────────

  /**
   * Get a formatted context block for inclusion in LLM prompts.
   * Returns empty string if no memory is loaded.
   */
  getRagContextBlock(): string {
    if (!this._memory) return '';

    const lines: string[] = [];

    if (this._memory.terms.length > 0) {
      lines.push('【已确认术语】');
      for (const t of this._memory.terms.slice(0, 30)) {
        lines.push(`  ${t.term} → ${t.gloss} (${t.lang})`);
      }
    }

    if (this._memory.phrasePatterns.length > 0) {
      lines.push('\n【常见表达模式】');
      for (const p of this._memory.phrasePatterns.slice(0, 20)) {
        lines.push(`  "${p.pattern}" → ${p.translation} [${p.context}]`);
      }
    }

    if (this._memory.domainVocabulary.length > 0) {
      lines.push('\n【领域词汇】');
      for (const d of this._memory.domainVocabulary) {
        lines.push(`  [${d.domain}] ${d.terms.slice(0, 10).join(', ')}…`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Search project memory using full-text retrieval and return scored matches.
   * Uses MiniSearch internally with the same CJK+latin tokenizer as EmbeddingSearchService.
   *
   * Falls back to empty array when no memory is loaded or no entries exist.
   */
  getRagContextVector(
    query: string,
    options?: GetRagContextVectorOptions,
  ): RAGContextMatch[] {
    const topK = Math.max(1, Math.floor(options?.topK ?? 10));
    const minScore = Math.max(0, Math.min(1, options?.minScore ?? 0.2));

    if (!this._memory || !query.trim()) return [];

    // Build index from all memory entries
    const docs: Array<{ id: string; kind: 'term' | 'phrase' | 'domain'; text: string; annotation: string | null }> = [];

    for (const t of this._memory.terms) {
      docs.push({ id: `term::${t.term}`, kind: 'term', text: `${t.term} ${t.gloss}`, annotation: t.gloss });
    }
    for (const p of this._memory.phrasePatterns) {
      docs.push({ id: `phrase::${p.pattern}`, kind: 'phrase', text: `${p.pattern} ${p.translation}`, annotation: p.translation });
    }
    for (const d of this._memory.domainVocabulary) {
      docs.push({ id: `domain::${d.domain}`, kind: 'domain', text: `${d.domain} ${d.terms.join(' ')}`, annotation: null });
    }

    if (docs.length === 0) return [];

    const miniSearch = new MiniSearch({
      fields: ['text'],
      storeFields: ['id'],
      idField: 'id',
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { text: 2 },
      },
      tokenize: (text) => {
        const lowered = text.toLowerCase();
        const cjkChars = lowered.match(/[\u4e00-\u9fff]/g) ?? [];
        const latinWords = lowered.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 2);
        return [...new Set([...cjkChars, ...latinWords])];
      },
      processTerm: (term) => term.trim(),
    });

    miniSearch.addAll(docs);
    const results = miniSearch.search(query.trim());

    if (results.length === 0) return [];

    const maxScore = Math.max(...results.map((r) => r.score));
    if (!Number.isFinite(maxScore) || maxScore <= 0) return [];

    const out: RAGContextMatch[] = [];
    for (const result of results) {
      const score = result.score / maxScore;
      if (score < minScore) continue;
      const doc = docs.find((d) => d.id === result.id);
      if (!doc) continue;
      out.push({ kind: doc.kind, text: doc.text.split(' ')[0] ?? doc.text, score, annotation: doc.annotation });
      if (out.length >= topK) break;
    }

    return out;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _notifyListeners(): void {
    if (!this._memory) return;
    this._listeners.forEach((cb) => cb({ ...this._memory! }));
  }

  private async _persist(): Promise<void> {
    if (!this._memory) return;
    try {
      await this._saveToDB(this._memory);
    } catch (err) {
      console.warn('[ProjectMemoryStore] persist failed, staying in-memory only:', err);
      // IndexedDB unavailable — in-memory only
    }
  }

  private _getDb(): Promise<IDBDatabase> {
    if (!this._dbPromise) {
      this._dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('jieyu-project-memory', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('projectMemory')) {
            db.createObjectStore('projectMemory', { keyPath: 'projectId' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onclose = () => {
            this._dbPromise = null;
          };
          db.onversionchange = () => {
            this._dbPromise = null;
            db.close();
          };
          resolve(db);
        };
        request.onerror = () => {
          this._dbPromise = null;
          reject(request.error);
        };
      });
    }
    return this._dbPromise;
  }

  private async _withDb<T>(runner: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await this._getDb();
    try {
      return await runner(db);
    } catch (error) {
      // 仅对可恢复的 IndexedDB 状态错误做一次重试 | Retry once only for recoverable IndexedDB state errors
      const retryable = error instanceof DOMException
        && ['InvalidStateError', 'AbortError', 'UnknownError'].includes(error.name);
      if (!retryable) throw error;
      this._dbPromise = null;
      const retryDb = await this._getDb();
      return await runner(retryDb);
    }
  }

  private async _loadFromDB(projectId: string): Promise<ProjectMemory | null> {
    try {
      return await this._withDb(async (db) => new Promise((resolve) => {
        const tx = db.transaction('projectMemory', 'readonly');
        const store = tx.objectStore('projectMemory');
        const getReq = store.get(projectId);
        getReq.onsuccess = () => resolve(getReq.result ?? null);
        getReq.onerror = () => resolve(null);
      }));
    } catch (err) {
      console.warn('[ProjectMemoryStore] load from IndexedDB failed:', err);
      return null;
    }
  }

  private async _saveToDB(memory: ProjectMemory): Promise<void> {
    await this._withDb(async (db) => new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projectMemory', 'readwrite');
      const store = tx.objectStore('projectMemory');
      store.put(memory);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }
}

export { ProjectMemoryStore };


// ── Singleton export ──────────────────────────────────────────────────────────

export const projectMemoryStore = ProjectMemoryStore.getInstance();
