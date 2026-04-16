import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './LLMProvider';
import { normalizeAiProviderError } from './errorUtils';
import { toErrorChunk } from './streamUtils';

export interface WebLLMProviderConfig {
  model: string;
}

type RuntimeChunk = string | {
  delta?: string;
  done?: boolean;
  error?: string;
};

type RuntimeOutput =
  | RuntimeChunk
  | Promise<RuntimeChunk>
  | AsyncIterable<RuntimeChunk>
  | ReadableStream<RuntimeChunk | Uint8Array | string>
  | Promise<AsyncIterable<RuntimeChunk> | ReadableStream<RuntimeChunk | Uint8Array | string>>;

interface WebLLMRuntime {
  ensureModel?: (model: string) => Promise<void>;
  chatStream: (input: {
    messages: ChatMessage[];
    model: string;
    temperature: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }) => RuntimeOutput;
}

interface PromptApiSession {
  prompt: (prompt: string, options?: Record<string, unknown>) => Promise<string>;
  promptStreaming?: (prompt: string, options?: Record<string, unknown>) => unknown;
  destroy?: () => void;
}

interface PromptApiLanguageModel {
  create: (options?: Record<string, unknown>) => Promise<PromptApiSession>;
}

interface PromptApiNamespace {
  languageModel?: PromptApiLanguageModel;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function isWebLLMRuntime(value: unknown): value is WebLLMRuntime {
  const record = asRecord(value);
  return !!record && typeof record.chatStream === 'function';
}

function toPrompt(messages: ChatMessage[]): string {
  return messages.map((message) => {
    const role = message.role === 'assistant'
      ? 'Assistant'
      : message.role === 'system'
        ? 'System'
        : 'User';
    return `${role}: ${message.content}`;
  }).join('\n\n');
}

async function* iterateReadableStream(
  stream: ReadableStream<RuntimeChunk | Uint8Array | string>,
): AsyncGenerator<RuntimeChunk, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (typeof value === 'string') {
        yield value;
      } else if (value instanceof Uint8Array) {
        yield decoder.decode(value, { stream: true });
      } else {
        yield value;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // no-op
    }
  }
}

async function* iterateRuntimeOutput(output: RuntimeOutput): AsyncGenerator<RuntimeChunk, void, unknown> {
  const awaited = await output;
  if (typeof awaited === 'string') {
    yield awaited;
    return;
  }

  if (awaited && typeof awaited === 'object' && Symbol.asyncIterator in awaited) {
    for await (const chunk of awaited as AsyncIterable<RuntimeChunk>) {
      yield chunk;
    }
    return;
  }

  if (awaited && typeof awaited === 'object' && 'getReader' in awaited) {
    for await (const chunk of iterateReadableStream(awaited as ReadableStream<RuntimeChunk | Uint8Array | string>)) {
      yield chunk;
    }
    return;
  }

  yield awaited;
}

function readPromptApiNamespace(): PromptApiNamespace | null {
  const fromGlobal = asRecord(globalThis)?.ai;
  if (asRecord(fromGlobal)) {
    return fromGlobal as PromptApiNamespace;
  }

  const fromWindow = typeof window !== 'undefined'
    ? asRecord(window as unknown as Record<string, unknown>)?.ai
    : null;
  if (asRecord(fromWindow)) {
    return fromWindow as PromptApiNamespace;
  }

  return null;
}

function resolveInjectedRuntime(): WebLLMRuntime | null {
  const globalRuntime = asRecord(globalThis)?.__JIEYU_WEBLLM_RUNTIME__;
  if (isWebLLMRuntime(globalRuntime)) return globalRuntime;

  if (typeof window !== 'undefined') {
    const windowRuntime = asRecord(window as unknown as Record<string, unknown>)?.__JIEYU_WEBLLM_RUNTIME__;
    if (isWebLLMRuntime(windowRuntime)) return windowRuntime;
  }

  return null;
}

function createPromptApiRuntime(namespace: PromptApiNamespace): WebLLMRuntime | null {
  const createSession = namespace.languageModel?.create;
  if (typeof createSession !== 'function') return null;

  return {
    chatStream: async function* ({ messages, model, temperature, maxTokens, signal }) {
      const createOptions: Record<string, unknown> = {};
      if (model.trim().length > 0) createOptions.model = model;
      const session = await createSession(createOptions);
      const prompt = toPrompt(messages);
      const promptOptions: Record<string, unknown> = { temperature };
      if (typeof maxTokens === 'number') promptOptions.maxTokens = maxTokens;
      if (signal) promptOptions.signal = signal;

      try {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        if (typeof session.promptStreaming === 'function') {
          const stream = session.promptStreaming(prompt, promptOptions) as RuntimeOutput;
          for await (const chunk of iterateRuntimeOutput(stream)) {
            if (typeof chunk === 'string') {
              if (chunk.length > 0) yield chunk;
              continue;
            }
            if (chunk.error) {
              yield { error: chunk.error, done: true };
              return;
            }
            if (typeof chunk.delta === 'string' && chunk.delta.length > 0) {
              yield chunk.delta;
            }
            if (chunk.done) {
              return;
            }
          }
          return;
        }

        const completion = await session.prompt(prompt, promptOptions);
        if (completion.length > 0) {
          yield completion;
        }
      } finally {
        session.destroy?.();
      }
    },
  };
}

function resolveRuntime(): WebLLMRuntime | null {
  const injected = resolveInjectedRuntime();
  if (injected) return injected;
  const promptApiRuntime = createPromptApiRuntime(readPromptApiNamespace() ?? {});
  if (promptApiRuntime) return promptApiRuntime;
  return null;
}

export class WebLLMProvider implements LLMProvider {
  readonly id = 'webllm';
  readonly label = 'WebLLM';
  readonly supportsStreaming = true;

  constructor(private readonly config: WebLLMProviderConfig) {}

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const runtime = resolveRuntime();
    if (!runtime) {
      yield toErrorChunk('WebLLM runtime unavailable. Expose window.__JIEYU_WEBLLM_RUNTIME__ or browser ai.languageModel first.');
      return;
    }

    const model = (options?.model ?? this.config.model).trim() || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

    try {
      if (runtime.ensureModel) {
        await runtime.ensureModel(model);
      }

      for await (const chunk of iterateRuntimeOutput(runtime.chatStream({
        messages,
        model,
        temperature: options?.temperature ?? 0.2,
        ...(typeof options?.maxTokens === 'number' ? { maxTokens: options.maxTokens } : {}),
        ...(options?.signal ? { signal: options.signal } : {}),
      }))) {
        if (options?.signal?.aborted) {
          yield { delta: '', done: true, error: 'aborted' };
          return;
        }

        if (typeof chunk === 'string') {
          if (chunk.length > 0) {
            yield { delta: chunk };
          }
          continue;
        }

        if (chunk.error) {
          yield toErrorChunk(chunk.error);
          return;
        }

        if (typeof chunk.delta === 'string' && chunk.delta.length > 0) {
          yield { delta: chunk.delta };
        }

        if (chunk.done) {
          yield { delta: '', done: true };
          return;
        }
      }

      yield { delta: '', done: true };
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        yield { delta: '', done: true, error: 'aborted' };
        return;
      }
      yield toErrorChunk(normalizeAiProviderError(error, this.label));
    }
  }
}
