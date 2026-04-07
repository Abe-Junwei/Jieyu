import { describe, expect, it, vi, beforeEach } from 'vitest';

type UseAiChatRagModule = typeof import('./useAiChat.rag');

async function loadUseAiChatRagModule(): Promise<UseAiChatRagModule> {
  vi.resetModules();
  return import('./useAiChat.rag');
}

async function runEnrichContextWithRag(
  params: Parameters<UseAiChatRagModule['enrichContextWithRag']>[0],
) {
  const { enrichContextWithRag } = await loadUseAiChatRagModule();
  return enrichContextWithRag(params);
}

describe('useAiChat.rag scenario resolver', () => {
  it('defaults to qa scenario for regular user text', async () => {
    const { resolveRagFusionScenarioInput } = await loadUseAiChatRagModule();
    const result = resolveRagFusionScenarioInput('请解释这句话的含义');

    expect(result.scenario).toBe('qa');
    expect(result.queryText).toBe('请解释这句话的含义');
  });

  it('resolves review scenario from template heading', async () => {
    const { resolveRagFusionScenarioInput } = await loadUseAiChatRagModule();
    const result = resolveRagFusionScenarioInput('【审校模板】请帮我检查这段转写的一致性');

    expect(result.scenario).toBe('review');
    expect(result.queryText).toBe('请帮我检查这段转写的一致性');
  });

  it('resolves terminology scenario from explicit token', async () => {
    const { resolveRagFusionScenarioInput } = await loadUseAiChatRagModule();
    const result = resolveRagFusionScenarioInput('[RAG_SCENARIO:terminology] 这个术语在语料中如何使用？');

    expect(result.scenario).toBe('terminology');
    expect(result.queryText).toBe('这个术语在语料中如何使用？');
  });

  it('normalizes rag citation snippets for plain-text reuse', async () => {
    const { normalizeRagCitationSnippet } = await loadUseAiChatRagModule();
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
  listUtteranceTextsByUtterance: vi.fn(async () => [
    { id: 'st1', utteranceId: 'u1', text: '测试语段文本 sample utterance text', lang: 'cmn' },
  ]),
}));

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
    const result = await runEnrichContextWithRag({
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
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '  ', contextBlock: 'existing', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('skip');
    expect(result.contextBlock).toBe('existing');
  });

  // ── Self-RAG: force ─────────────────────────────────────────────────────

  it('force → topK=8 + 跳过 CRAG | force → topK=8, bypass CRAG', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'utterance', sourceId: 'u1', score: 0.3, model: 'e5' }],
    });
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '帮我查找上次录的语段', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('force');
    expect(result.cragVerdict).toBeUndefined();
    const calls = (svc.searchMultiSourceHybrid as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const call = calls[0];
    if (!call) {
      throw new Error('expected searchMultiSourceHybrid to be called');
    }
    expect(call[2]?.topK).toBe(8);
  });

  // ── retrieve + CRAG: correct ────────────────────────────────────────────

  it('retrieve + 高分 → cragVerdict=correct | high score → correct', async () => {
    const svc = mockSearchService({
      matches: [
        { sourceType: 'utterance', sourceId: 'u1', score: 0.82, model: 'e5' },
        { sourceType: 'utterance', sourceId: 'u2', score: 0.55, model: 'e5' },
      ],
    });
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '这个语言的语音系统怎么描述？', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('retrieve');
    expect(result.cragVerdict).toBe('correct');
  });

  // ── retrieve + CRAG: incorrect ──────────────────────────────────────────

  it('retrieve + 低分 → cragVerdict=incorrect，不注入 | low score → incorrect', async () => {
    const svc = mockSearchService({
      matches: [{ sourceType: 'utterance', sourceId: 'u1', score: 0.15, model: 'e5' }],
    });
    const result = await runEnrichContextWithRag({
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
      matches: [{ sourceType: 'utterance', sourceId: 'u1', score: 0.45, model: 'e5' }],
      matchesOnSecondCall: [{ sourceType: 'note', sourceId: 'n1', score: 0.60, model: 'e5' }],
    });
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '田野调查音频样本', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('retrieve');
    expect(result.cragVerdict).toBe('ambiguous');
    expect(svc.searchMultiSourceHybrid).toHaveBeenCalledTimes(2);
  });

  // ── null service → passthrough ──────────────────────────────────────────

  it('null service → 直接返回 | null → passthrough', async () => {
    const result = await runEnrichContextWithRag({
      embeddingSearchService: null, userText: '什么是 IPA', contextBlock: 'pre', ragContextTimeoutMs: 5000,
    });
    expect(result.contextBlock).toBe('pre');
    expect(result.reflectionVerdict).toBeUndefined();
  });

  // ── force + 零匹配 → minScore=0.05 ─────────────────────────────────────

  it('force + 零首次匹配 → fallback minScore=0.05 | force + no initial → 0.05', async () => {
    const svc = mockSearchService({ matches: [] });
    await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '搜索一下笔记里的内容', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    const calls = (svc.searchMultiSourceHybrid as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1]?.[2]?.minScore).toBe(0.05);
  });

  // ── ambiguous + re-search 失败 → 保留原始匹配 | ambiguous + re-search fails → keep originals ──

  it('ambiguous + re-search 抛出 → 使用原始匹配 | ambiguous + re-search throws → uses originals', async () => {
    let callCount = 0;
    const svc = {
      searchMultiSourceHybrid: vi.fn(async () => {
        callCount += 1;
        if (callCount >= 2) throw new Error('network error');
        return { query: 'test', matches: [{ sourceType: 'utterance', sourceId: 'u1', score: 0.45, model: 'e5' }] };
      }),
    } as unknown as EmbeddingSearchService;
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '田野调查音频样本', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.cragVerdict).toBe('ambiguous');
    // 即使重搜失败，原始匹配仍注入上下文 | Originals still injected even when re-search fails
    expect(result.contextBlock).toContain('RELEVANT_CONTEXT');
  });

  // ── retrieve + CRAG 后零匹配 → 返回空 | post-CRAG zero matches → empty ──

  it('retrieve + CRAG correct 但 snippet 为空 → citations 为空 | correct but empty snippet → no citations', async () => {
    // PDF 类型 + extractPdfSnippet mock 默认返回 '' → normalizedSnippet 为空 → 被过滤
    // PDF sourceType + extractPdfSnippet mock returns '' → filtered out
    const svc = mockSearchService({
      matches: [{ sourceType: 'pdf', sourceId: 'pdf_empty', score: 0.82, model: 'e5' }],
    });
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '这个语言的调值系统如何描述', contextBlock: 'base', ragContextTimeoutMs: 5000,
    });
    expect(result.cragVerdict).toBe('correct');
    // PDF snippet 为空 → dedupedSources 为空 → 不注入 | Empty snippet → no injection
    expect(result.citations).toEqual([]);
    expect(result.contextBlock).toBe('base');
  });

  // ── force + fallback 也为空 → 返回空 | force + fallback also empty → empty ──

  it('force + fallback 也为空 → 无 cragVerdict | force + fallback empty → no verdict', async () => {
    const svc = {
      searchMultiSourceHybrid: vi.fn(async () => ({ query: 'test', matches: [] })),
    } as unknown as EmbeddingSearchService;
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '搜索文档中的音位', contextBlock: 'ctx', ragContextTimeoutMs: 5000,
    });
    expect(result.reflectionVerdict).toBe('force');
    expect(result.cragVerdict).toBeUndefined();
    expect(result.citations).toEqual([]);
    // 上下文保持不变 | Context unchanged
    expect(result.contextBlock).toBe('ctx');
  });

  // ── DB 查找部分失败 → 只保留成功结果 | partial DB failures → keep successful lookups ──

  it('DB 部分查找失败 → 保留成功的引用 | partial DB failure → keeps successful citations', async () => {
    const svc = mockSearchService({
      matches: [
        { sourceType: 'utterance', sourceId: 'u_ok', score: 0.82, model: 'e5' },
        { sourceType: 'pdf', sourceId: 'pdf_empty', score: 0.40, model: 'e5' },
      ],
    });
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '元音和谐的原理是什么', contextBlock: '', ragContextTimeoutMs: 5000,
    });
    expect(result.cragVerdict).toBe('correct');
    // utterance 有文本，pdf snippet 为空 → 只保留 utterance | utterance has text, pdf empty → only utterance kept
    expect(result.citations.length).toBe(1);
    expect(result.citations[0]?.type).toBe('utterance');
    expect(result.contextBlock).toContain('RELEVANT_CONTEXT');
  });

  // ── 编程错误(TypeError) → 不吞异常日志 | programming error → logged, returns gracefully ──

  it('搜索服务抛 TypeError → 返回空但不崩溃 | TypeError → empty result, no crash', async () => {
    const svc = {
      searchMultiSourceHybrid: vi.fn(async () => { throw new TypeError('Cannot read property of null'); }),
    } as unknown as EmbeddingSearchService;
    const result = await runEnrichContextWithRag({
      embeddingSearchService: svc, userText: '解释一下', contextBlock: 'safe', ragContextTimeoutMs: 5000,
    });
    expect(result.contextBlock).toBe('safe');
    expect(result.citations).toEqual([]);
    expect(result.reflectionVerdict).toBe('retrieve');
  });
});