import { describe, expect, it } from 'vitest';
import {
  detectWebLLMRuntimeStatus,
  warmupWebLLMModel,
} from './webllmRuntime';

function makeAbortError(): Error {
  const error = new Error('aborted');
  (error as { name: string }).name = 'AbortError';
  return error;
}

describe('webllmRuntime', () => {
  it('reports unavailable when no runtime is exposed', () => {
    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
    delete (globalThis as Record<string, unknown>).ai;

    const status = detectWebLLMRuntimeStatus();
    expect(status.available).toBe(false);
    expect(status.source).toBe('unavailable');
  });

  it('detects injected runtime and warms model via ensureModel', async () => {
    let warmedModel = '';
    (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__ = {
      chatStream: async function* () {
        yield { delta: 'ok' };
      },
      ensureModel: async (model: string) => {
        warmedModel = model;
      },
    };

    const status = await warmupWebLLMModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    expect(status.available).toBe(true);
    expect(status.source).toBe('injected-runtime');
    expect(warmedModel).toContain('Qwen2.5');

    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
  });

  it('falls back to prompt api warmup when injected runtime is absent', async () => {
    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
    let destroyCalled = false;
    (globalThis as Record<string, unknown>).ai = {
      languageModel: {
        create: async () => ({
          destroy: () => {
            destroyCalled = true;
          },
        }),
      },
    };

    const status = await warmupWebLLMModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(status.available).toBe(true);
    expect(status.source).toBe('prompt-api');
    expect(destroyCalled).toBe(true);

    delete (globalThis as Record<string, unknown>).ai;
  });

  it('reports warmup progress from injected runtime callback', async () => {
    const progressSamples: number[] = [];
    const phases: string[] = [];
    (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__ = {
      chatStream: async function* () {
        yield { delta: 'ok' };
      },
      ensureModelWithProgress: async (
        _model: string,
        options?: { onProgress?: (progress: unknown) => void },
      ) => {
        options?.onProgress?.({ stage: 'fetching-weights', percentage: 25, message: 'Downloading model.' });
        options?.onProgress?.({ status: 'loading-kernel', progress: 0.8, message: 'Loading weights.' });
      },
    };

    const status = await warmupWebLLMModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', {
      onProgress: (progress) => {
        progressSamples.push(progress.progress);
        phases.push(progress.phase);
      },
    });

    expect(status.available).toBe(true);
    expect(progressSamples.some((sample) => sample >= 0.25 && sample <= 0.3)).toBe(true);
    expect(progressSamples.some((sample) => sample >= 0.75 && sample <= 0.85)).toBe(true);
    expect(progressSamples[progressSamples.length - 1]).toBe(1);
    expect(phases).toContain('downloading');
    expect(phases).toContain('initializing');
    expect(phases[phases.length - 1]).toBe('ready');

    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
  });

  it('rejects warmup with AbortError when cancelled', async () => {
    const controller = new AbortController();
    (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__ = {
      chatStream: async function* () {
        yield { delta: 'ok' };
      },
      ensureModelWithProgress: async (
        _model: string,
        options?: { signal?: AbortSignal },
      ) => {
        if (options?.signal?.aborted) throw makeAbortError();
        await new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(makeAbortError()), { once: true });
        });
      },
    };

    const pending = warmupWebLLMModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    delete (globalThis as Record<string, unknown>).__JIEYU_WEBLLM_RUNTIME__;
  });
});
