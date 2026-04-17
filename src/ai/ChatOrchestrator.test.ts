/**
 * ChatOrchestrator 测试：降级链 (fallback) 与基本消息组装
 * ChatOrchestrator tests: fallback chain & basic message assembly
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatOrchestrator, isRetryableStreamError } from './ChatOrchestrator';
import type { ChatChunk, LLMProvider } from './providers/LLMProvider';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockProvider(
  id: string,
  chunks: ChatChunk[],
): LLMProvider {
  return {
    id,
    label: id,
    supportsStreaming: true,
    async *chat() {
      for (const c of chunks) yield c;
    },
  };
}

function makeErrorProvider(id: string, errorMsg: string): LLMProvider {
  return {
    id,
    label: id,
    supportsStreaming: true,
    async *chat() {
      // 首个 chunk 即为错误 | First chunk is an error
      yield { delta: '', error: errorMsg };
      yield { delta: '', done: true };
    },
  };
}

function makeThrowProvider(id: string, errorMsg: string): LLMProvider {
  return {
    id,
    label: id,
    supportsStreaming: true,
    async *chat() {
      throw new Error(errorMsg);
    },
  };
}

async function collectChunks(stream: AsyncGenerator<ChatChunk, void, unknown>): Promise<ChatChunk[]> {
  const result: ChatChunk[] = [];
  for await (const chunk of stream) {
    result.push(chunk);
  }
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('isRetryableStreamError', () => {
  it.each([
    ['HTTP 429 rate limit', 'Request failed with status 429'],
    ['HTTP 503 unavailable', 'Service unavailable 503'],
    ['rate limit text', 'Rate limit exceeded'],
    ['network error', 'fetch failed'],
    ['ECONNRESET', 'socket hang up ECONNRESET'],
  ])('should classify "%s" as retryable', (_label, msg) => {
    expect(isRetryableStreamError(new Error(msg))).toBe(true);
  });

  it.each([
    ['auth failure', 'Invalid API key (401)'],
    ['bad request', 'Request failed with status 400'],
    ['generic error', 'Something went wrong'],
  ])('should classify "%s" as non-retryable', (_label, msg) => {
    expect(isRetryableStreamError(new Error(msg))).toBe(false);
  });
});

describe('ChatOrchestrator', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const baseInput = {
    history: [],
    userText: '你好',
    systemPrompt: '你是助手',
  };

  it('injects trace context into provider options when header flag is enabled', async () => {
    vi.stubEnv('VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS', 'true');

    let capturedOptions: { traceContext?: { traceparent: string } } | undefined;
    const provider: LLMProvider = {
      id: 'primary',
      label: 'primary',
      supportsStreaming: true,
      async *chat(_messages, options) {
        capturedOptions = options;
        yield { delta: 'ok', done: true };
      },
    };

    const orchestrator = new ChatOrchestrator(provider);
    const { stream } = orchestrator.sendMessage(baseInput);
    await collectChunks(stream);

    expect(capturedOptions?.traceContext?.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('does not inject trace context when header flag is disabled', async () => {
    vi.stubEnv('VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS', 'false');

    let capturedOptions: { traceContext?: { traceparent: string } } | undefined;
    const provider: LLMProvider = {
      id: 'primary',
      label: 'primary',
      supportsStreaming: true,
      async *chat(_messages, options) {
        capturedOptions = options;
        yield { delta: 'ok', done: true };
      },
    };

    const orchestrator = new ChatOrchestrator(provider);
    const { stream } = orchestrator.sendMessage(baseInput);
    await collectChunks(stream);

    expect(capturedOptions?.traceContext).toBeUndefined();
  });

  it('should assemble messages in correct order', () => {
    const provider = makeMockProvider('primary', [{ delta: 'Hi', done: true }]);
    const orchestrator = new ChatOrchestrator(provider);
    const { messages } = orchestrator.sendMessage(baseInput);
    expect(messages).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
    ]);
  });

  it('should stream from primary provider when no fallback', async () => {
    const provider = makeMockProvider('primary', [
      { delta: 'Hello' },
      { delta: ' world', done: true },
    ]);
    const orchestrator = new ChatOrchestrator(provider);
    const { stream } = orchestrator.sendMessage(baseInput);
    const chunks = await collectChunks(stream);
    expect(chunks.map((c) => c.delta)).toEqual(['Hello', ' world']);
  });

  it('should fallback on retryable first-chunk error', async () => {
    const primary = makeErrorProvider('primary', 'Service unavailable 503');
    const fallback = makeMockProvider('fallback', [
      { delta: 'Fallback reply', done: true },
    ]);
    const orchestrator = new ChatOrchestrator(primary, fallback);
    const { stream } = orchestrator.sendMessage(baseInput);
    const chunks = await collectChunks(stream);
    // 应有降级提示 + fallback 的内容 | Should include degradation notice + fallback content
    const allText = chunks.map((c) => `${c.delta ?? ''}${c.error ?? ''}`).join('');
    expect(allText).toContain('降级');
    expect(allText).toContain('Fallback reply');
  });

  it('should fallback when primary throws retryable error', async () => {
    const primary = makeThrowProvider('primary', 'fetch failed');
    const fallback = makeMockProvider('fallback', [
      { delta: 'OK', done: true },
    ]);
    const orchestrator = new ChatOrchestrator(primary, fallback);
    const { stream } = orchestrator.sendMessage(baseInput);
    const chunks = await collectChunks(stream);
    expect(chunks.some((c) => c.delta === 'OK')).toBe(true);
  });

  it('should fallback on non-retryable error', async () => {
    const primary = makeThrowProvider('primary', 'Invalid API key (401)');
    const fallback = makeMockProvider('fallback', [
      { delta: 'OK', done: true },
    ]);
    const orchestrator = new ChatOrchestrator(primary, fallback);
    const { stream } = orchestrator.sendMessage(baseInput);
    const chunks = await collectChunks(stream);
    const allText = chunks.map((c) => `${c.delta ?? ''}${c.error ?? ''}`).join('');
    expect(allText).toContain('降级');
    expect(chunks.some((c) => c.delta === 'OK')).toBe(true);
  });

  it('should NOT fallback on retryable error if no fallback configured', async () => {
    const primary = makeThrowProvider('primary', 'Service unavailable 503');
    const orchestrator = new ChatOrchestrator(primary);
    const { stream } = orchestrator.sendMessage(baseInput);
    await expect(collectChunks(stream)).rejects.toThrow('503');
  });

  it('should warn about duplicate content when primary emitted partial output before failing', async () => {
    // 主模型输出部分内容后抛错 | Primary emits partial content then throws
    const primary: LLMProvider = {
      id: 'primary',
      label: 'primary',
      supportsStreaming: true,
      async *chat() {
        yield { delta: '部分内容' };
        throw new Error('connection reset');
      },
    };
    const fallback = makeMockProvider('fallback', [
      { delta: '完整回复', done: true },
    ]);
    const orchestrator = new ChatOrchestrator(primary, fallback);
    const { stream } = orchestrator.sendMessage(baseInput);
    const chunks = await collectChunks(stream);
    const allText = chunks.map((c) => `${c.delta ?? ''}${c.error ?? ''}`).join('');
    // 应有"输出中断"提示（区别于普通降级提示） | Should include "interrupted" notice (distinct from plain fallback)
    expect(allText).toContain('输出中断');
    expect(allText).toContain('上方内容可忽略');
    expect(allText).toContain('完整回复');
  });
});
