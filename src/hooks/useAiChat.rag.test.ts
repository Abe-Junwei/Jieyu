import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeRagCitationSnippet, resolveRagFusionScenarioInput } from './useAiChat.rag';

describe('useAiChat.rag scenario resolver', () => {
  it('defaults to qa scenario for regular user text', () => {
    const result = resolveRagFusionScenarioInput('请解释这句话的含义');

    expect(result.scenario).toBe('qa');
    expect(result.queryText).toBe('请解释这句话的含义');
  });

  it('resolves review scenario from template heading', () => {
    const result = resolveRagFusionScenarioInput('【审校模板】请帮我检查这段转写的一致性');

    expect(result.scenario).toBe('review');
    expect(result.queryText).toBe('请帮我检查这段转写的一致性');
  });

  it('resolves terminology scenario from explicit token', () => {
    const result = resolveRagFusionScenarioInput('[RAG_SCENARIO:terminology] 这个术语在语料中如何使用？');

    expect(result.scenario).toBe('terminology');
    expect(result.queryText).toBe('这个术语在语料中如何使用？');
  });

  it('normalizes rag citation snippets for plain-text reuse', () => {
    expect(normalizeRagCitationSnippet('\u2067مرحبا\u2069\n  بالعالم')).toBe('مرحبا بالعالم');
  });
});

// ── enrichContextWithRag 集成测试 | Integration tests ─────────────────────

// 延迟导入：需要在 mock 设置后 | Lazy import: must come after mocks
vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: {
      user_notes: {
        findByIndex: vi.fn(async () => [
          { toJSON: () => ({ id: 'n1', content: { und: '笔记内容 note content for test' } }) },
        ]),
      },
    },
  })),
}));

vi.mock('../ai/embeddings/pdfTextUtils', () => ({
  extractPdfSnippet: vi.fn(() => ''),
}));

vi.mock('../utils/citationJumpUtils', () => ({
  splitPdfCitationRef: vi.fn((refId: string) => {
    const idx = refId.indexOf('#');
    return idx >= 0
      ? { baseRef: refId.slice(0, idx), hashSuffix: refId.slice(idx) }
      : { baseRef: refId, hashSuffix: '' };
  }),
}));

vi.mock('../observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../services/LayerSegmentationTextService', () => ({
  listUnitTextsByUnit: vi.fn(async () => [
    { id: 'st1', unitId: 'u1', text: '测试语段文本 sample unit text', lang: 'cmn' },
  ]),
}));

import { addMetricObserver } from '../observability/metrics';
import type { AiPromptContext } from '../ai/chat/chatDomain.types';
import { buildLocalUnitIdSetForRagCitationCheck, enrichContextWithRag } from './useAiChat.rag';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';

function mockSearchService(options?: {
  matches?: Array<{ sourceType: string; sourceId: string; score: number; model: string }>;
  matchesOnSecondCall?: Array<{ sourceType: string; sourceId: string; score: number; model: string }>;
}): EmbeddingSearchService {
  const defaultMatches = options?.matches ?? [];
  let callCount = 0;
  return {
    searchMultiSourceHybrid: vi.fn(async () => {
      callCount += 1;
      if (callCount >= 2 && options?.matchesOnSecondCall) {
        return { query: 'expanded', matches: options.matchesOnSecondCall };
      }
      return { query: 'test', matches: defaultMatches };
    }),
  } as unknown as EmbeddingSearchService;
}

describe('enrichContextWithRag — Self-RAG + CRAG pipeline', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Self-RAG: skip ──────────────────────────────────────────────────────

  it('闲聊 → reflectionVerdict=skip，不调用搜索 | greeting → skip', async () => {
    const svc = mockSearchService();
    const result = await enrichContextWithRag({
      embeddingSearchService: svc,
      userText: '你好',
      contextBlock: '',
      ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('skip');
    expect(result.citations).toEqual([]);
    expect(svc.searchMultiSourceHybrid).not.toHaveBeenCalled();
  });

  it('空输入 → skip | empty → skip', async () => {
    const svc = mockSearchService();
    const result = await enrichContextWithRag({
      embeddingSearchService: svc, userText: '  ', contextBlock: 'existing', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('skip');
    expect(result.contextBlock).toBe('existing');
  });

  // ── Self-RAG: force ─────────────────────────────────────────────────────

  it('force → topK=8 + 跳过 CRAG | force → topK=8, bypass CRAG', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'unit', sourceId: 'u1', score: 0.3, model: 'e5' }],
    });
    const result = await enrichContextWithRag({
      embeddingSearchService: svc, userText: '帮我查找上次录的语段', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('force');
    expect(result.cragVerdict).toBeUndefined();
    const mock = svc.searchMultiSourceHybrid as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const call = mock.mock.calls[0]!;
    expect(call[2]?.topK).toBe(8);
  });

  // ── retrieve + CRAG: correct ────────────────────────────────────────────

  it('retrieve + 高分 → cragVerdict=correct | high score → correct', async () => {
    const svc = mockSearchService({
      matches: [
        { sourceType: 'unit', sourceId: 'u1', score: 0.82, model: 'e5' },
        { sourceType: 'unit', sourceId: 'u2', score: 0.55, model: 'e5' },
      ],
    });
    const result = await enrichContextWithRag({
      embeddingSearchService: svc, userText: '这个语言的语音系统怎么描述？', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('retrieve');
    expect(result.cragVerdict).toBe('correct');
  });

  // ── retrieve + CRAG: incorrect ──────────────────────────────────────────

  it('retrieve + 低分 → cragVerdict=incorrect，不注入 | low score → incorrect', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'unit', sourceId: 'u1', score: 0.15, model: 'e5' }],
    });
    const result = await enrichContextWithRag({
      embeddingSearchService: svc, userText: '解释元音和谐', contextBlock: 'base', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('retrieve');
    expect(result.cragVerdict).toBe('incorrect');
    expect(result.citations).toEqual([]);
    expect(result.contextBlock).toBe('base');
  });

  // ── retrieve + CRAG: ambiguous ──────────────────────────────────────────

  it('retrieve + 中等分 → ambiguous + queryExpansion 重搜 | mid score → ambiguous', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'unit', sourceId: 'u1', score: 0.45, model: 'e5' }],
      matchesOnSecondCall: [{ sourceType: 'note', sourceId: 'n1', score: 0.60, model: 'e5' }],
    });
    const result = await enrichContextWithRag({
      embeddingSearchService: svc, userText: '田野调查音频样本', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('retrieve');
    expect(result.cragVerdict).toBe('ambiguous');
    expect(svc.searchMultiSourceHybrid).toHaveBeenCalledTimes(2);
  });

  // ── null service → passthrough ──────────────────────────────────────────

  it('null service → 直接返回 | null → passthrough', async () => {
    const result = await enrichContextWithRag({
      embeddingSearchService: null, userText: '什么是 IPA', contextBlock: 'pre', ragContextTimeoutMs: 5000,
    });
    expect(result.contextBlock).toBe('pre');
    expect(result.reflectionVerdict).toBeUndefined();
  });

  // ── force + 零匹配 → minScore=0.05 ─────────────────────────────────────

  it('force + 零首次匹配 → fallback minScore=0.05 | force + no initial → 0.05', async () => {
    const svc = mockSearchService({ matches: [] });
    await enrichContextWithRag({
      embeddingSearchService: svc, userText: '搜索一下笔记里的内容', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    const calls = (svc.searchMultiSourceHybrid as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1]?.[2]?.minScore).toBe(0.05);
  });

  it('attaches readModelEpochAtRetrieval and readModelIndexHit when promptContext has index', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'unit', sourceId: 'u1', score: 0.82, model: 'e5' }],
    });
    const promptContext: AiPromptContext = {
      shortTerm: {
        timelineReadModelEpoch: 99,
        unitIndexComplete: true,
        localUnitIndex: [
          { id: 'u1', kind: 'unit', mediaId: 'm', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello' },
        ],
      },
      longTerm: {},
    };
    const result = await enrichContextWithRag({
      embeddingSearchService: svc,
      userText: '这个语言的语音系统怎么描述？',
      contextBlock: 'ctx',
      ragContextTimeoutMs: 5000,
      promptContext,
    });
    expect(result.citations.length).toBe(1);
    expect(result.citations[0]).toMatchObject({
      type: 'unit',
      refId: 'u1',
      readModelEpochAtRetrieval: 99,
      readModelIndexHit: true,
    });
    expect(result.contextBlock).toContain('[RELEVANT_CONTEXT]');
  });

  it('sets readModelIndexHit false and emits ai.rag_citation_read_model_miss when unit not in index', async () => {
    const events: Array<{ id: string }> = [];
    const dispose = addMetricObserver((e) => events.push({ id: e.id }));
    try {
      const svc = mockSearchService({
        matches: [{ sourceType: 'unit', sourceId: 'ghost-u', score: 0.82, model: 'e5' }],
      });
      const result = await enrichContextWithRag({
        embeddingSearchService: svc,
        userText: '这个语言的语音系统怎么描述？',
        contextBlock: '',
        ragContextTimeoutMs: 5000,
        promptContext: {
          shortTerm: {
            timelineReadModelEpoch: 1,
            unitIndexComplete: true,
            localUnitIndex: [
              { id: 'u1', kind: 'unit', mediaId: 'm', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'x' },
            ],
          },
          longTerm: {},
        },
      });
      expect(result.citations[0]?.readModelIndexHit).toBe(false);
      expect(result.citations[0]?.readModelEpochAtRetrieval).toBe(1);
      expect(events.some((e) => e.id === 'ai.rag_citation_read_model_miss')).toBe(true);
    } finally {
      dispose();
    }
  });

  it('attaches epoch but omits readModelIndexHit when localUnitIndex is unavailable', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'unit', sourceId: 'u1', score: 0.82, model: 'e5' }],
    });
    const result = await enrichContextWithRag({
      embeddingSearchService: svc,
      userText: '这个语言的语音系统怎么描述？',
      contextBlock: '',
      ragContextTimeoutMs: 5000,
      promptContext: { shortTerm: { timelineReadModelEpoch: 7 }, longTerm: {} },
    });
    expect(result.citations[0]?.readModelEpochAtRetrieval).toBe(7);
    expect(result.citations[0]?.readModelIndexHit).toBeUndefined();
  });
});

describe('buildLocalUnitIdSetForRagCitationCheck', () => {
  it('returns null when unitIndexComplete is false', () => {
    expect(buildLocalUnitIdSetForRagCitationCheck({
      shortTerm: { unitIndexComplete: false, localUnitIndex: [{ id: 'a', kind: 'unit', mediaId: 'm', layerId: 'l', startTime: 0, endTime: 1, text: '' }] },
      longTerm: {},
    })).toBeNull();
  });

  it('returns null when localUnitIndex is missing', () => {
    expect(buildLocalUnitIdSetForRagCitationCheck({ shortTerm: { timelineReadModelEpoch: 1 }, longTerm: {} })).toBeNull();
  });

  it('returns id set when index is complete', () => {
    const set = buildLocalUnitIdSetForRagCitationCheck({
      shortTerm: {
        unitIndexComplete: true,
        localUnitIndex: [
          { id: 'a', kind: 'unit', mediaId: 'm', layerId: 'l', startTime: 0, endTime: 1, text: '' },
          { id: 'b', kind: 'segment', mediaId: 'm', layerId: 'l', startTime: 1, endTime: 2, text: '' },
        ],
      },
      longTerm: {},
    });
    expect(set?.has('a')).toBe(true);
    expect(set?.has('b')).toBe(true);
  });
});