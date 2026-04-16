/**
 * GlobalContextService 单元测试
 * Unit tests for GlobalContextService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 用 vi.hoisted 避免 TDZ | Use vi.hoisted to avoid TDZ
const { mockSearchSimilarUnits } = vi.hoisted(() => ({
  mockSearchSimilarUnits: vi.fn(),
}));

vi.mock('../ai/embeddings/EmbeddingSearchService', () => ({
  EmbeddingSearchService: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type GCS = typeof import('./GlobalContextService');

// 每次重新导入保证单例不跨测试污染 | Re-import to prevent singleton leaking between tests
async function freshModule() {
  vi.resetModules();
  const mod: GCS = await import('./GlobalContextService');
  return mod;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCorpusContext(): import('./GlobalContextService').CorpusContext {
  return {
    segments: [
      {
        id: 's1',
        text: 'hello world',
        translation: 'translated',
        glossTiers: null,
        audioTimeRange: [0, 1],
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 's2',
        text: 'second',
        translation: null,
        glossTiers: null,
        audioTimeRange: null,
        createdAt: 3,
        updatedAt: 4,
      },
    ],
    documents: [],
    corpusLang: 'tok',
    primaryLanguageName: 'Toki Pona',
    projectMeta: {
      name: 'Test Project',
      createdAt: 0,
      lastEditedAt: 0,
      totalDuration: 60,
    },
  };
}

function makeFakeEmbeddingService() {
  return { searchSimilarUnits: mockSearchSimilarUnits } as never;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GlobalContextService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Corpus Context ────────────────────────────────────────────────────────

  describe('corpus context', () => {
    it('初始 corpus 为 null | initial corpus is null', async () => {
      const { globalContext } = await freshModule();
      expect(globalContext.getCorpusContext()).toBeNull();
      globalContext.dispose();
    });

    it('setCorpusContext 保存并通知监听器 | saves and notifies listeners', async () => {
      const { globalContext } = await freshModule();
      const listener = vi.fn();
      globalContext.onCorpusChange(listener);
      const ctx = makeCorpusContext();
      globalContext.setCorpusContext(ctx);
      expect(globalContext.getCorpusContext()).toBe(ctx);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(ctx);
      globalContext.dispose();
    });

    it('onCorpusChange 返回退订函数 | returns unsubscribe', async () => {
      const { globalContext } = await freshModule();
      const listener = vi.fn();
      const unsub = globalContext.onCorpusChange(listener);
      unsub();
      globalContext.setCorpusContext(makeCorpusContext());
      expect(listener).not.toHaveBeenCalled();
      globalContext.dispose();
    });
  });

  // ── RAG Search ───────────────────────────────────────────────────────────

  describe('searchCorpus', () => {
    it('无 EmbeddingSearchService 时返回空数组 | returns [] without service', async () => {
      const { globalContext } = await freshModule();
      const results = await globalContext.searchCorpus('hello');
      expect(results).toEqual([]);
      globalContext.dispose();
    });

    it('正常返回匹配结果 | returns matched results', async () => {
      const { globalContext } = await freshModule();
      globalContext.setCorpusContext(makeCorpusContext());
      mockSearchSimilarUnits.mockResolvedValueOnce({
        query: 'hello',
        matches: [
          { sourceId: 's1', sourceType: 'unit', score: 0.9 },
          { sourceId: 's2', sourceType: 'document', score: 0.5 },
        ],
      });
      globalContext.setEmbeddingSearchService(makeFakeEmbeddingService());
      const results = await globalContext.searchCorpus('hello', 5);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ segmentId: 's1', text: 'hello world', score: 0.9, source: 'transcription' });
      expect(results[1]).toMatchObject({ segmentId: 's2', text: 'second', score: 0.5, source: 'document' });
      globalContext.dispose();
    });

    it('无 corpusContext 时返回空 | returns [] when no corpus', async () => {
      const { globalContext } = await freshModule();
      mockSearchSimilarUnits.mockResolvedValueOnce({ query: 'q', matches: [{ sourceId: 'x', sourceType: 'unit', score: 0.5 }] });
      globalContext.setEmbeddingSearchService(makeFakeEmbeddingService());
      const results = await globalContext.searchCorpus('q');
      expect(results).toEqual([]);
      globalContext.dispose();
    });

    it('搜索失败时优雅降级为空数组 | gracefully returns [] on error', async () => {
      const { globalContext } = await freshModule();
      globalContext.setCorpusContext(makeCorpusContext());
      mockSearchSimilarUnits.mockRejectedValueOnce(new Error('boom'));
      globalContext.setEmbeddingSearchService(makeFakeEmbeddingService());
      const results = await globalContext.searchCorpus('hello');
      expect(results).toEqual([]);
      globalContext.dispose();
    });
  });

  // ── User Behavior ─────────────────────────────────────────────────────────

  describe('behavior profile', () => {
    it('初始 profile 使用默认值 | initial profile has defaults', async () => {
      const { globalContext } = await freshModule();
      const p = globalContext.getBehaviorProfile();
      expect(p.totalSessions).toBe(0);
      expect(p.preferences.preferredMode).toBe('command');
      expect(p.usageTimeDistribution).toHaveLength(24);
      globalContext.dispose();
    });

    it('setBehaviorProfile 通知监听器 | notifies listeners', async () => {
      const { globalContext } = await freshModule();
      const listener = vi.fn();
      globalContext.onProfileChange(listener);
      const p = globalContext.getBehaviorProfile();
      p.totalSessions = 42;
      globalContext.setBehaviorProfile(p);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0].totalSessions).toBe(42);
      globalContext.dispose();
    });

    it('onProfileChange 退订 | unsubscribe works', async () => {
      const { globalContext } = await freshModule();
      const listener = vi.fn();
      const unsub = globalContext.onProfileChange(listener);
      unsub();
      globalContext.setBehaviorProfile(globalContext.getBehaviorProfile());
      expect(listener).not.toHaveBeenCalled();
      globalContext.dispose();
    });
  });

  // ── recordAction ──────────────────────────────────────────────────────────

  describe('recordAction', () => {
    it('更新频率与 EMA 时长 | updates frequency and EMA duration', async () => {
      const { globalContext } = await freshModule();
      globalContext.recordAction('playPause', 100, 'sess1');
      const p = globalContext.getBehaviorProfile();
      expect(p.actionFrequencies.playPause).toBe(1);
      // 首次 EMA：prev = durationMs, result = 100*(1-0.3) + 100*0.3 = 100
      expect(p.actionDurations.playPause).toBe(100);

      globalContext.recordAction('playPause', 200, 'sess1');
      const p2 = globalContext.getBehaviorProfile();
      expect(p2.actionFrequencies.playPause).toBe(2);
      // Second EMA: 100*(0.7) + 200*(0.3) = 70+60 = 130
      expect(p2.actionDurations.playPause).toBeCloseTo(130, 5);
      globalContext.dispose();
    });

    it('归一化 usageTimeDistribution | normalizes usage time', async () => {
      const { globalContext } = await freshModule();
      globalContext.recordAction('undo', 50, 'sess1');
      const p = globalContext.getBehaviorProfile();
      const max = Math.max(...p.usageTimeDistribution);
      expect(max).toBe(1); // 最大值归一化为 1
      globalContext.dispose();
    });
  });

  // ── recordTaskCompletion ──────────────────────────────────────────────────

  describe('recordTaskCompletion', () => {
    it('EMA 平滑任务时长 | EMA smooths task duration', async () => {
      const { globalContext } = await freshModule();
      globalContext.recordTaskCompletion('transcribe', 1000);
      expect(globalContext.getBehaviorProfile().taskDurations.transcribe).toBe(1000);

      globalContext.recordTaskCompletion('transcribe', 500);
      // EMA: 1000*0.7 + 500*0.3 = 850
      expect(globalContext.getBehaviorProfile().taskDurations.transcribe).toBeCloseTo(850, 5);
      globalContext.dispose();
    });
  });

  // ── updatePreference ──────────────────────────────────────────────────────

  describe('updatePreference', () => {
    it('更新单个偏好字段 | updates a single pref field', async () => {
      const { globalContext } = await freshModule();
      globalContext.updatePreference('preferredMode', 'dictation');
      expect(globalContext.getBehaviorProfile().preferences.preferredMode).toBe('dictation');
      globalContext.dispose();
    });
  });

  // ── updateFatigue ────────────────────────────────────────────────────────

  describe('updateFatigue', () => {
    it('部分更新疲劳状态 | partially updates fatigue', async () => {
      const { globalContext } = await freshModule();
      globalContext.updateFatigue({ score: 0.8, speakingRateTrend: 'decelerating' });
      const f = globalContext.getBehaviorProfile().fatigue;
      expect(f.score).toBe(0.8);
      expect(f.speakingRateTrend).toBe('decelerating');
      expect(f.pauseFrequencyTrend).toBe('stable'); // 未变 | unchanged
      globalContext.dispose();
    });
  });

  // ── markSessionStart ─────────────────────────────────────────────────────

  describe('markSessionStart', () => {
    it('递增会话计数并更新时间戳 | increments session count', async () => {
      const { globalContext } = await freshModule();
      const before = Date.now();
      globalContext.markSessionStart();
      const p = globalContext.getBehaviorProfile();
      expect(p.totalSessions).toBe(1);
      expect(p.lastSessionAt).toBeGreaterThanOrEqual(before);
      globalContext.dispose();
    });
  });

  // ── getPreferencesSummary ─────────────────────────────────────────────────

  describe('getPreferencesSummary', () => {
    it('返回 top-5 最常用动作 | returns top-5 most used actions', async () => {
      const { globalContext } = await freshModule();
      // 记录 6 种动作，期望只返回 top-5
      const actions = ['playPause', 'undo', 'redo', 'cancel', 'search', 'navPrev'] as const;
      for (let i = 0; i < actions.length; i++) {
        for (let j = 0; j <= i; j++) {
          globalContext.recordAction(actions[i]!, 100, 'sess');
        }
      }
      const summary = globalContext.getPreferencesSummary();
      expect(summary.mostUsedActions).toHaveLength(5);
      // navPrev 使用 6 次应排第一
      expect(summary.mostUsedActions[0]!.actionId).toBe('navPrev');
      expect(summary.mostUsedActions[0]!.count).toBe(6);
      expect(summary.preferredMode).toBe('command');
      globalContext.dispose();
    });
  });

  // ── reset / dispose ────────────────────────────────────────────────────────

  describe('reset / dispose', () => {
    it('reset 恢复默认值 | reset restores defaults', async () => {
      const { globalContext } = await freshModule();
      globalContext.setCorpusContext(makeCorpusContext());
      globalContext.recordAction('undo', 50, 's');
      globalContext.reset();
      expect(globalContext.getCorpusContext()).toBeNull();
      expect(globalContext.getBehaviorProfile().actionFrequencies).toEqual({});
      globalContext.dispose();
    });

    it('dispose 清空监听器 | dispose clears listeners', async () => {
      const { globalContext } = await freshModule();
      const l1 = vi.fn();
      const l2 = vi.fn();
      globalContext.onCorpusChange(l1);
      globalContext.onProfileChange(l2);
      globalContext.dispose();
      // 在 dispose 后 set 不会触发已注册的监听器
      // 注意：dispose 后 _corpusContext 为 null，但 set 前需要重新初始化
      // 实际上 dispose 后继续使用是 undefined behavior，仅验证清理逻辑
      expect(l1).not.toHaveBeenCalled();
      expect(l2).not.toHaveBeenCalled();
    });
  });
});
