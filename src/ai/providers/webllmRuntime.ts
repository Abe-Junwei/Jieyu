export type WebLLMRuntimeSource = 'injected-runtime' | 'prompt-api' | 'unavailable';

export interface WebLLMRuntimeStatus {
  available: boolean;
  source: WebLLMRuntimeSource;
  detail: string;
}

export interface WebLLMWarmupProgress {
  phase: 'preparing' | 'downloading' | 'initializing' | 'ready';
  progress: number;
  message: string;
}

interface WarmupOptions {
  signal?: AbortSignal;
  onProgress?: (progress: WebLLMWarmupProgress) => void;
}

interface InjectedWebLLMRuntime {
  ensureModel?: (model: string, options?: { signal?: AbortSignal }) => Promise<void>;
  ensureModelWithProgress?: (
    model: string,
    options?: { signal?: AbortSignal; onProgress?: (progress: unknown) => void },
  ) => Promise<void>;
  ensureModelProgress?: (model: string, options?: { signal?: AbortSignal }) => AsyncIterable<unknown>;
  chatStream?: (...args: unknown[]) => unknown;
}

interface PromptApiSession {
  destroy?: () => void;
}

interface PromptApiLanguageModel {
  create: (options?: Record<string, unknown>) => Promise<PromptApiSession>;
}

interface PromptApiNamespace {
  languageModel?: PromptApiLanguageModel;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function readGlobalRuntime(): InjectedWebLLMRuntime | null {
  const globalRecord = asRecord(globalThis);
  const runtime = globalRecord?.__JIEYU_WEBLLM_RUNTIME__;
  const runtimeRecord = asRecord(runtime);
  if (!runtimeRecord || typeof runtimeRecord.chatStream !== 'function') return null;
  return runtimeRecord as unknown as InjectedWebLLMRuntime;
}

function readPromptApiNamespace(): PromptApiNamespace | null {
  const globalRecord = asRecord(globalThis);
  const promptApi = asRecord(globalRecord?.ai);
  if (!promptApi) return null;
  return promptApi as unknown as PromptApiNamespace;
}

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Warmup cancelled', 'AbortError');
  }
  const error = new Error('Warmup cancelled');
  (error as { name: string }).name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function normalizeProgressValue(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeWarmupPhase(phaseRaw: string | null): WebLLMWarmupProgress['phase'] {
  if (!phaseRaw) return 'preparing';
  const normalized = phaseRaw.toLowerCase();
  if (normalized === 'ready' || normalized.includes('done') || normalized.includes('complete')) {
    return 'ready';
  }
  if (normalized === 'downloading' || normalized.includes('download') || normalized.includes('fetch')) {
    return 'downloading';
  }
  if (normalized === 'initializing' || normalized.includes('init') || normalized.includes('load') || normalized.includes('compile')) {
    return 'initializing';
  }
  return 'preparing';
}

function normalizeWarmupProgress(value: unknown): WebLLMWarmupProgress | null {
  const progressRecord = asRecord(value);
  if (!progressRecord) return null;

  const progressValue = normalizeProgressValue(progressRecord.progress)
    ?? normalizeProgressValue(progressRecord.percentage)
    ?? (() => {
      const loaded = typeof progressRecord.loadedBytes === 'number' ? progressRecord.loadedBytes
        : typeof progressRecord.loaded === 'number' ? progressRecord.loaded
          : null;
      const total = typeof progressRecord.totalBytes === 'number' ? progressRecord.totalBytes
        : typeof progressRecord.total === 'number' ? progressRecord.total
          : null;
      if (loaded === null || total === null || total <= 0) return null;
      return Math.max(0, Math.min(1, loaded / total));
    })();

  const phaseRaw = typeof progressRecord.phase === 'string'
    ? progressRecord.phase
    : typeof progressRecord.stage === 'string'
      ? progressRecord.stage
      : typeof progressRecord.status === 'string'
        ? progressRecord.status
        : null;
  const normalizedPhase = normalizeWarmupPhase(phaseRaw);

  const message = typeof progressRecord.message === 'string'
    ? progressRecord.message
    : typeof progressRecord.text === 'string'
      ? progressRecord.text
      : normalizedPhase === 'ready'
        ? 'Model ready.'
        : 'Preparing model runtime.';

  return {
    phase: normalizedPhase,
    progress: progressValue ?? (normalizedPhase === 'ready' ? 1 : 0),
    message,
  };
}

export function detectWebLLMRuntimeStatus(): WebLLMRuntimeStatus {
  const injected = readGlobalRuntime();
  if (injected) {
    return {
      available: true,
      source: 'injected-runtime',
      detail: 'Injected runtime bridge detected.',
    };
  }

  const promptApi = readPromptApiNamespace();
  if (promptApi?.languageModel && typeof promptApi.languageModel.create === 'function') {
    return {
      available: true,
      source: 'prompt-api',
      detail: 'Browser Prompt API detected.',
    };
  }

  return {
    available: false,
    source: 'unavailable',
    detail: 'No runtime bridge or Prompt API found.',
  };
}

export async function warmupWebLLMModel(model: string, options?: WarmupOptions): Promise<WebLLMRuntimeStatus> {
  throwIfAborted(options?.signal);
  options?.onProgress?.({
    phase: 'preparing',
    progress: 0,
    message: 'Checking runtime availability.',
  });

  const status = detectWebLLMRuntimeStatus();
  if (!status.available) {
    return status;
  }

  const runtime = readGlobalRuntime();
  if (runtime?.ensureModelWithProgress) {
    const ensureOptions: { signal?: AbortSignal; onProgress?: (progress: unknown) => void } = {
      onProgress: (progress) => {
        const normalized = normalizeWarmupProgress(progress);
        if (!normalized) return;
        options?.onProgress?.(normalized);
      },
    };
    if (options?.signal) {
      ensureOptions.signal = options.signal;
    }
    await runtime.ensureModelWithProgress(model, {
      ...ensureOptions,
    });
    options?.onProgress?.({
      phase: 'ready',
      progress: 1,
      message: `Model ${model} is ready.`,
    });
    return {
      available: true,
      source: 'injected-runtime',
      detail: `Model ${model} warmed by injected runtime.`,
    };
  }

  if (runtime?.ensureModelProgress) {
    const progressStream = options?.signal
      ? runtime.ensureModelProgress(model, { signal: options.signal })
      : runtime.ensureModelProgress(model);
    for await (const progress of progressStream) {
      const normalized = normalizeWarmupProgress(progress);
      if (!normalized) continue;
      options?.onProgress?.(normalized);
    }
    options?.onProgress?.({
      phase: 'ready',
      progress: 1,
      message: `Model ${model} is ready.`,
    });
    return {
      available: true,
      source: 'injected-runtime',
      detail: `Model ${model} warmed by injected runtime.`,
    };
  }

  if (runtime?.ensureModel) {
    if (options?.signal) {
      await runtime.ensureModel(model, { signal: options.signal });
    } else {
      await runtime.ensureModel(model);
    }
    options?.onProgress?.({
      phase: 'ready',
      progress: 1,
      message: `Model ${model} is ready.`,
    });
    return {
      available: true,
      source: 'injected-runtime',
      detail: `Model ${model} warmed by injected runtime.`,
    };
  }

  const promptApi = readPromptApiNamespace();
  if (promptApi?.languageModel?.create) {
    throwIfAborted(options?.signal);
    options?.onProgress?.({
      phase: 'initializing',
      progress: 0.35,
      message: 'Creating Prompt API session.',
    });
    const session = await promptApi.languageModel.create({ model });
    throwIfAborted(options?.signal);
    session.destroy?.();
    options?.onProgress?.({
      phase: 'ready',
      progress: 1,
      message: `Model ${model} is ready.`,
    });
    return {
      available: true,
      source: 'prompt-api',
      detail: `Prompt API session created for model ${model}.`,
    };
  }

  return {
    available: false,
    source: 'unavailable',
    detail: 'Runtime became unavailable during warmup.',
  };
}
