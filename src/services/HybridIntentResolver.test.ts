import { describe, expect, it, vi, beforeEach } from 'vitest';
import { shouldTriggerHybridResolution, HybridIntentResolver, hybridScopeToLocalUnitScope } from './HybridIntentResolver';
import type { HybridResolverInput } from './HybridIntentResolver';

// ── Mock 依赖 | Mock dependencies ─────────────────────────────────────────

vi.mock('../observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../observability/metrics', () => ({
  isKnownMetricId: vi.fn(() => true),
  recordMetric: vi.fn(),
  createMetricTags: vi.fn((_mod: string, extra: Record<string, unknown>) => extra),
}));

// ── 门控测试 | Gate tests ─────────────────────────────────────────────────

describe('shouldTriggerHybridResolution', () => {
  it('触发：规则未命中 | triggers when rule did not match', () => {
    expect(shouldTriggerHybridResolution(0, false, false, '帮我查一下')).toBe(true);
  });

  it('触发：模糊命中但置信度低 | triggers on low-confidence fuzzy', () => {
    expect(shouldTriggerHybridResolution(0.4, true, true, '删掉')).toBe(true);
  });

  it('触发：模糊命中 + 范围歧义词 | triggers on fuzzy + scope ambiguity', () => {
    expect(shouldTriggerHybridResolution(0.8, true, true, '删除当前这个')).toBe(true);
  });

  it('不触发：精确命中高置信度 | skips on high-confidence exact match', () => {
    expect(shouldTriggerHybridResolution(0.9, true, false, '播放')).toBe(false);
  });

  it('不触发：模糊命中高置信度无歧义 | skips on high-confidence fuzzy without ambiguity', () => {
    expect(shouldTriggerHybridResolution(0.7, true, true, '撤销操作')).toBe(false);
  });
});

// ── 缓存与解析测试 | Cache & parsing tests ──────────────────────────────

function makeMockProvider(jsonResponse: string) {
  return {
    id: 'test-provider',
    label: 'Test',
    supportsStreaming: true,
    chat: vi.fn(async function* () {
      yield { delta: jsonResponse, done: true };
    }),
  };
}

function makeInput(text: string): HybridResolverInput {
  return { userText: text, mode: 'command' };
}

describe('HybridIntentResolver', () => {
  let resolver: HybridIntentResolver;
  const mockProvider = makeMockProvider(JSON.stringify({
    intent: 'delete',
    action: 'delete_segment',
    scope: 'current_scope',
    target: '当前语段',
    confidence: 0.9,
    needsClarification: false,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new HybridIntentResolver(() => mockProvider);
  });

  it('解析有效 JSON 响应 | parses valid JSON response', async () => {
    const result = await resolver.resolve(makeInput('删除这个语段'));
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('delete');
    expect(result!.scope).toBe('current_scope');
    expect(result!.confidence).toBe(0.9);
    expect(result!.methodology).toBe('hybrid');
  });

  it('缓存命中 | returns cached result on second call', async () => {
    await resolver.resolve(makeInput('删除这个语段'));
    const second = await resolver.resolve(makeInput('删除这个语段'));
    expect(second).not.toBeNull();
    expect(second!.methodology).toBe('cache');
    // provider 只调用一次 | provider called only once
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('缓存归一化 | cache normalizes whitespace/punctuation', async () => {
    await resolver.resolve(makeInput('删除  这个  语段'));
    const second = await resolver.resolve(makeInput('删除 这个 语段'));
    expect(second!.methodology).toBe('cache');
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('clearCache 清除缓存 | clearCache forces re-resolve', async () => {
    await resolver.resolve(makeInput('删除这个语段'));
    resolver.clearCache();
    await resolver.resolve(makeInput('删除这个语段'));
    expect(mockProvider.chat).toHaveBeenCalledTimes(2);
  });

  it('空文本返回 null | returns null for empty text', async () => {
    expect(await resolver.resolve(makeInput(''))).toBeNull();
    expect(await resolver.resolve(makeInput('   '))).toBeNull();
  });

  it('禁用时返回 null | returns null when disabled', async () => {
    const disabled = new HybridIntentResolver(() => mockProvider, { enabled: false });
    expect(await disabled.resolve(makeInput('删除这个语段'))).toBeNull();
  });

  it('无 provider 时返回 null | returns null when no provider', async () => {
    const noProvider = new HybridIntentResolver(() => null);
    expect(await noProvider.resolve(makeInput('删除这个语段'))).toBeNull();
  });

  it('解析失败返回 null | returns null when LLM returns garbage', async () => {
    const badProvider = makeMockProvider('not json at all');
    const r = new HybridIntentResolver(() => badProvider);
    expect(await r.resolve(makeInput('test'))).toBeNull();
  });

  it('超时返回 null | returns null on timeout', async () => {
    const slowProvider = {
      id: 'slow',
      label: 'Slow',
      supportsStreaming: true,
      chat: vi.fn(async function* () {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        yield { delta: '{}', done: true };
      }),
    };
    const r = new HybridIntentResolver(() => slowProvider, { timeoutMs: 50 });
    expect(await r.resolve(makeInput('test'))).toBeNull();
  }, 10_000);

  it('provider 错误返回 null | returns null on provider error chunk', async () => {
    const errorProvider = {
      id: 'err',
      label: 'Err',
      supportsStreaming: true,
      chat: vi.fn(async function* () {
        yield { delta: '', done: false, error: 'some error' };
      }),
    };
    const r = new HybridIntentResolver(() => errorProvider);
    expect(await r.resolve(makeInput('test'))).toBeNull();
  });

  it('clamp confidence 到 [0,1] | clamps confidence to [0,1]', async () => {
    const overProvider = makeMockProvider(JSON.stringify({
      intent: 'query',
      confidence: 5.0,
      needsClarification: false,
    }));
    const r = new HybridIntentResolver(() => overProvider);
    const result = await r.resolve(makeInput('有几个'));
    expect(result!.confidence).toBe(1);
  });

  it('未知 intent 回退到 unclear | unknown intent falls back to unclear', async () => {
    const unknownProvider = makeMockProvider(JSON.stringify({
      intent: 'magic',
      confidence: 0.8,
      needsClarification: false,
    }));
    const r = new HybridIntentResolver(() => unknownProvider);
    const result = await r.resolve(makeInput('test'));
    expect(result!.intent).toBe('unclear');
  });
});

// ── 工具函数测试 | Utility tests ──────────────────────────────────────────

describe('hybridScopeToLocalUnitScope', () => {
  it('传递已知 scope | passes through known scopes', () => {
    expect(hybridScopeToLocalUnitScope('current_scope')).toBe('current_scope');
    expect(hybridScopeToLocalUnitScope('current_track')).toBe('current_track');
    expect(hybridScopeToLocalUnitScope('project')).toBe('project');
  });

  it('undefined 输入返回 undefined | returns undefined for undefined input', () => {
    expect(hybridScopeToLocalUnitScope(undefined)).toBeUndefined();
  });
});
