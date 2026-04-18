import type { ChatTokenUsage } from './LLMProvider';

function asCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function buildUsage(inputTokens: unknown, outputTokens: unknown, totalTokens: unknown): ChatTokenUsage | undefined {
  const normalizedInput = asCount(inputTokens);
  const normalizedOutput = asCount(outputTokens);
  const normalizedTotal = asCount(totalTokens)
    ?? ((normalizedInput ?? 0) + (normalizedOutput ?? 0));

  if (normalizedInput === undefined && normalizedOutput === undefined && normalizedTotal === undefined) {
    return undefined;
  }

  return {
    ...(normalizedInput !== undefined ? { inputTokens: normalizedInput } : {}),
    ...(normalizedOutput !== undefined ? { outputTokens: normalizedOutput } : {}),
    ...(normalizedTotal !== undefined ? { totalTokens: normalizedTotal } : {}),
  };
}

export function normalizeOpenAIUsage(raw: unknown): ChatTokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  return buildUsage(
    usage.prompt_tokens ?? usage.input_tokens,
    usage.completion_tokens ?? usage.output_tokens,
    usage.total_tokens,
  );
}

export function normalizeAnthropicUsage(raw: unknown): ChatTokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  return buildUsage(usage.input_tokens, usage.output_tokens, undefined);
}

export function normalizeGeminiUsage(raw: unknown): ChatTokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as {
    promptTokenCount?: unknown;
    candidatesTokenCount?: unknown;
    totalTokenCount?: unknown;
  };
  return buildUsage(usage.promptTokenCount, usage.candidatesTokenCount, usage.totalTokenCount);
}

export function normalizeOllamaUsage(raw: unknown): ChatTokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as {
    prompt_eval_count?: unknown;
    eval_count?: unknown;
  };
  return buildUsage(usage.prompt_eval_count, usage.eval_count, undefined);
}

export function mergeTokenUsage(current: ChatTokenUsage | undefined, next: ChatTokenUsage | undefined): ChatTokenUsage | undefined {
  if (!current) return next;
  if (!next) return current;

  const inputTokens = next.inputTokens ?? current.inputTokens;
  const outputTokens = next.outputTokens ?? current.outputTokens;
  const totalTokens = next.totalTokens ?? current.totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0));

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}
