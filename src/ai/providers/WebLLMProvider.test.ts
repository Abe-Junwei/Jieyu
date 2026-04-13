import { describe, expect, it } from 'vitest';
import { WebLLMProvider } from './WebLLMProvider';

describe('WebLLMProvider', () => {
  it('returns a clear error chunk when no runtime is available', async () => {
    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
    delete (globalThis as Record<string, unknown>).ai;

    const provider = new WebLLMProvider({ model: 'test-local-model' });
    const chunks = [] as Array<{ delta: string; done?: boolean; error?: string }>;

    for await (const chunk of provider.chat([{ role: 'user', content: 'hello' }])) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.done).toBe(true);
    expect(chunks[0]?.error).toContain('WebLLM runtime unavailable');
  });

  it('streams from injected runtime and emits done chunk', async () => {
    let ensuredModel = '';
    (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__ = {
      ensureModel: async (model: string) => {
        ensuredModel = model;
      },
      chatStream: async function* () {
        yield 'A';
        yield { delta: 'B' };
      },
    };

    const provider = new WebLLMProvider({ model: 'fallback-model' });
    const chunks: string[] = [];
    let done = false;

    for await (const chunk of provider.chat([{ role: 'user', content: 'hello' }], { model: 'runtime-model' })) {
      if (chunk.done) {
        done = true;
        continue;
      }
      chunks.push(chunk.delta);
    }

    expect(ensuredModel).toBe('runtime-model');
    expect(chunks.join('')).toBe('AB');
    expect(done).toBe(true);

    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
  });

  it('falls back to browser ai.languageModel when injected runtime is absent', async () => {
    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
    (globalThis as Record<string, unknown>).ai = {
      languageModel: {
        create: async () => ({
          prompt: async () => 'OK',
          destroy: () => {},
        }),
      },
    };

    const provider = new WebLLMProvider({ model: 'prompt-api-model' });
    const chunks: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hello' }])) {
      if (!chunk.done) chunks.push(chunk.delta);
    }

    expect(chunks.join('')).toBe('OK');

    delete (globalThis as Record<string, unknown>).ai;
  });
});
