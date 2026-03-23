/**
 * GlobalContextService — 跨页面状态中枢（单例）
 *
 * 提供三个核心功能：
 * 1. 跨页面共享语料库上下文（segments / translations / glosses / PDFs）
 * 2. RAG 搜索（复用 EmbeddingSearchService）
 * 3. 全局用户行为状态（供 VoiceAgentService 和报告系统使用）
 *
 * 所有 Page 通过 setCorpusContext() / setBehaviorProfile() 注册数据，
 * 其他服务通过 getCorpusContext() / getBehaviorProfile() 读取，
 * 变化时通过 onCorpusChange() / onProfileChange() 订阅。
 *
 * @see 解语语音智能体架构设计方案 v2.0 §P0
 */

import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import type { ActionId } from './IntentRouter';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SegmentSummary {
  id: string;
  text: string;
  translation: string | null;
  glossTiers: Record<string, string> | null;
  audioTimeRange: [number, number] | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentSummary {
  id: string;
  name: string;
  textSnippet: string;
  pageCount: number;
  addedAt: number;
}

export interface ProjectMeta {
  name: string;
  createdAt: number;
  lastEditedAt: number;
  totalDuration: number | null; // seconds
}

export interface CorpusContext {
  segments: SegmentSummary[];
  documents: DocumentSummary[];
  corpusLang: string;
  primaryLanguageName: string;
  projectMeta: ProjectMeta;
}

export interface UserPreferences {
  preferredMode: 'command' | 'dictation' | 'analysis';
  safeModeDefault: boolean;
  wakeWordEnabled: boolean;
  preferredEngine: 'web-speech' | 'whisper-local' | 'commercial';
  preferredLang: string | null;
  confirmationThreshold: 'always' | 'destructive' | 'never';
}

export interface FatigueState {
  score: number; // 0-1, computed综合疲劳指数
  speakingRateTrend: 'accelerating' | 'stable' | 'decelerating';
  pauseFrequencyTrend: 'increasing' | 'stable' | 'decreasing';
  lastBreakAt: number;
}

export interface UserBehaviorProfile {
  actionFrequencies: Partial<Record<ActionId, number>>;
  actionDurations: Partial<Record<ActionId, number>>; // ms, EMA smoothed
  fatigue: FatigueState;
  preferences: UserPreferences;
  taskDurations: Partial<Record<string, number>>; // ms
  usageTimeDistribution: number[]; // 24-hour buckets, normalized 0-1
  totalSessions: number;
  lastSessionAt: number;
}

export interface CorpusSearchResult {
  segmentId: string;
  text: string;
  translation: string | null;
  score: number;
  source: 'transcription' | 'translation' | 'gloss' | 'document';
}

// ── Default factories ─────────────────────────────────────────────────────────

/** 同步区域检测：仅用于首次默认值 | Sync region hint for initial defaults only */
function isCnLocale(): boolean {
  if (typeof navigator === 'undefined') return false;
  const lang = navigator.language;
  return lang === 'zh-CN' || lang === 'zh';
}

function createDefaultUserBehaviorProfile(): UserBehaviorProfile {
  return {
    actionFrequencies: {},
    actionDurations: {},
    fatigue: {
      score: 0,
      speakingRateTrend: 'stable',
      pauseFrequencyTrend: 'stable',
      lastBreakAt: Date.now(),
    },
    preferences: {
      preferredMode: 'command',
      safeModeDefault: false,
      wakeWordEnabled: false,
      preferredEngine: isCnLocale() ? 'commercial' : 'web-speech',
      preferredLang: null,
      confirmationThreshold: 'destructive',
    },
    taskDurations: {},
    usageTimeDistribution: new Array(24).fill(0),
    totalSessions: 0,
    lastSessionAt: Date.now(),
  };
}

// ── GlobalContextService ───────────────────────────────────────────────────────

class GlobalContextService {
  private static _instance: GlobalContextService | null = null;

  static getInstance(): GlobalContextService {
    if (!GlobalContextService._instance) {
      GlobalContextService._instance = new GlobalContextService();
    }
    return GlobalContextService._instance;
  }

  // Prevent direct construction
  private constructor() {}

  // ── Corpus Context ────────────────────────────────────────────────────────

  private _corpusContext: CorpusContext | null = null;
  private _corpusListeners = new Set<(c: CorpusContext) => void>();

  getCorpusContext(): CorpusContext | null {
    return this._corpusContext;
  }

  setCorpusContext(ctx: CorpusContext): void {
    this._corpusContext = ctx;
    this._corpusListeners.forEach((l) => l(ctx));
  }

  onCorpusChange(callback: (c: CorpusContext) => void): () => void {
    this._corpusListeners.add(callback);
    return () => { this._corpusListeners.delete(callback); };
  }

  // ── RAG Search ───────────────────────────────────────────────────────────

  private _embeddingSearchService: EmbeddingSearchService | null = null;

  setEmbeddingSearchService(service: EmbeddingSearchService): void {
    this._embeddingSearchService = service;
  }

  /**
   * Search across corpus (segments + documents) for relevant context.
   * Returns top-K results ranked by embedding similarity.
   */
  async searchCorpus(query: string, topK = 5): Promise<CorpusSearchResult[]> {
    if (!this._embeddingSearchService) return [];

    try {
      const result = await this._embeddingSearchService.searchSimilarUtterances(query, { topK });
      // searchSimilarUtterances returns { query, matches[] } where matches contain sourceId (segment ID) and sourceType
      // We need to look up the actual text from corpus segments
      const corpus = this._corpusContext;
      if (!corpus) return [];

      return result.matches
        .slice(0, topK)
        .map((m: { sourceId: string; sourceType: string; score: number }) => {
          const segment = corpus.segments.find((s) => s.id === m.sourceId);
          return {
            segmentId: m.sourceId,
            text: segment?.text ?? '',
            translation: segment?.translation ?? null,
            score: m.score,
            source: (m.sourceType === 'utterance' ? 'transcription' : m.sourceType) as CorpusSearchResult['source'],
          };
        });
    } catch (err) {
      console.warn('[GlobalContextService] searchCorpus failed, returning empty result:', err);
      return [];
    }
  }

  // ── User Behavior ─────────────────────────────────────────────────────────

  private _behaviorProfile: UserBehaviorProfile = createDefaultUserBehaviorProfile();
  private _behaviorListeners = new Set<(p: UserBehaviorProfile) => void>();

  getBehaviorProfile(): UserBehaviorProfile {
    return this._behaviorProfile;
  }

  setBehaviorProfile(profile: UserBehaviorProfile): void {
    this._behaviorProfile = profile;
    this._behaviorListeners.forEach((l) => l(profile));
  }

  onProfileChange(callback: (p: UserBehaviorProfile) => void): () => void {
    this._behaviorListeners.add(callback);
    return () => { this._behaviorListeners.delete(callback); };
  }

  /**
   * Record a single action execution with its duration.
   * Uses exponential moving average (EMA) to smooth duration estimates.
   *
   * @param actionId - The action that was executed
   * @param durationMs - How long the action took (for navigation actions)
   * @param sessionId - Which session this belongs to
   */
  recordAction(actionId: ActionId, durationMs: number, sessionId: string): void {
    const profile = this._behaviorProfile;

    // Update frequency
    profile.actionFrequencies[actionId] = (profile.actionFrequencies[actionId] ?? 0) + 1;

    // Update duration (EMA, alpha = 0.3 — recent values weighted more)
    const alpha = 0.3;
    const prev = profile.actionDurations[actionId] ?? durationMs;
    profile.actionDurations[actionId] = prev * (1 - alpha) + durationMs * alpha;

    // Update usage time distribution
    const hour = new Date().getHours();
    profile.usageTimeDistribution[hour] = (profile.usageTimeDistribution[hour] ?? 0) + 1;

    // Normalize usage distribution to 0-1
    const maxUsage = Math.max(...profile.usageTimeDistribution, 1);
    profile.usageTimeDistribution = profile.usageTimeDistribution.map((v) => v / maxUsage);

    this.setBehaviorProfile(profile);
  }

  /**
   * Record a task completion with its duration.
   */
  recordTaskCompletion(taskType: string, durationMs: number): void {
    const profile = this._behaviorProfile;
    const alpha = 0.3;
    const prev = profile.taskDurations[taskType] ?? durationMs;
    profile.taskDurations[taskType] = prev * (1 - alpha) + durationMs * alpha;
    this.setBehaviorProfile(profile);
  }

  /**
   * Update a single preference field.
   */
  updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
    this._behaviorProfile.preferences[key] = value;
    this.setBehaviorProfile(this._behaviorProfile);
  }

  /**
   * Update fatigue state.
   */
  updateFatigue(updates: Partial<FatigueState>): void {
    this._behaviorProfile.fatigue = { ...this._behaviorProfile.fatigue, ...updates };
    this.setBehaviorProfile(this._behaviorProfile);
  }

  /**
   * Increment session count.
   */
  markSessionStart(): void {
    this._behaviorProfile.totalSessions += 1;
    this._behaviorProfile.lastSessionAt = Date.now();
    this.setBehaviorProfile(this._behaviorProfile);
  }

  /**
   * Get a derived preferences summary for LLM context.
   * Includes only serializable, non-sensitive data.
   */
  getPreferencesSummary(): {
    preferredMode: string;
    typicalActionDurations: Record<string, number>;
    mostUsedActions: Array<{ actionId: string; count: number }>;
    fatigueScore: number;
    confirmationPreference: string;
  } {
    const profile = this._behaviorProfile;

    const mostUsed = Object.entries(profile.actionFrequencies)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(0, 5)
      .map(([actionId, count]) => ({ actionId, count: count ?? 0 }));

    return {
      preferredMode: profile.preferences.preferredMode,
      typicalActionDurations: profile.actionDurations as Record<string, number>,
      mostUsedActions: mostUsed,
      fatigueScore: profile.fatigue.score,
      confirmationPreference: profile.preferences.confirmationThreshold,
    };
  }

  /** Reset to defaults (mainly for testing) */
  reset(): void {
    this._corpusContext = null;
    this._behaviorProfile = createDefaultUserBehaviorProfile();
  }

  /**
   * Dispose all retained references and listeners.
   * 释放全部持有引用与监听器。
   */
  dispose(): void {
    this._corpusListeners.clear();
    this._behaviorListeners.clear();
    this._embeddingSearchService = null;
    this._corpusContext = null;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const globalContext = GlobalContextService.getInstance();

// ── React hook (optional, for components that prefer hook syntax) ──────────────

import { useState, useEffect, useCallback } from 'react';

/**
 * Lightweight React hook to subscribe to GlobalContext changes.
 * Use this in page components that need to react to context changes.
 */
export function useGlobalContext() {
  const [corpus, setCorpus] = useState<CorpusContext | null>(globalContext.getCorpusContext());
  const [profile, setProfile] = useState<UserBehaviorProfile>(globalContext.getBehaviorProfile());

  useEffect(() => {
    return globalContext.onCorpusChange(setCorpus);
  }, []);

  useEffect(() => {
    return globalContext.onProfileChange(setProfile);
  }, []);

  const searchCorpus = useCallback(
    (query: string, topK = 5) => globalContext.searchCorpus(query, topK),
    [],
  );

  return {
    corpus,
    profile,
    searchCorpus,
    setCorpusContext: (ctx: CorpusContext) => globalContext.setCorpusContext(ctx),
    recordAction: (actionId: ActionId, durationMs: number, sessionId: string) =>
      globalContext.recordAction(actionId, durationMs, sessionId),
    updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) =>
      globalContext.updatePreference(key, value),
    markSessionStart: () => globalContext.markSessionStart(),
    getPreferencesSummary: () => globalContext.getPreferencesSummary(),
  };
}
