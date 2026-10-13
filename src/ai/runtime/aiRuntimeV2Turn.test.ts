// @vitest-environment jsdom
import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultAiChatSettings } from '../providers/providerCatalog';
import {
  PENDING_APPROVAL_TTL_MS,
  loadPendingApproval,
  savePendingApproval,
} from './aiRuntimeV2Pending';
import {
  createAiSdkModelFromSettings,
  runAiRuntimeV2Turn,
  withLegacyFallback,
  type RunAiRuntimeV2TurnParams,
  type RuntimeV2Decision,
} from './aiRuntimeV2Turn';
import { isNoToolsThisSession, resetNoToolsThisSessionForTests } from './toolLoopAgentPilot';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const toolCallStream = (toolName: string, input: string) => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'stream-start' as const, warnings: [] },
      { type: 'tool-call' as const, toolCallId: `c-${toolName}`, toolName, input },
      {
        type: 'finish' as const,
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage,
      },
    ],
  }),
});
const textStream = (text: string) => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'stream-start' as const, warnings: [] },
      { type: 'text-start' as const, id: 't' },
      { type: 'text-delta' as const, id: 't', delta: text },
      { type: 'text-end' as const, id: 't' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage,
      },
    ],
  }),
});

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

function params(
  model: MockLanguageModelV4,
  over: Partial<RunAiRuntimeV2TurnParams> = {},
): RunAiRuntimeV2TurnParams {
  return {
    model,
    providerId: 'deepseek',
    modelId: 'deepseek-chat',
    conversationId: 'conv-1',
    history: [],
    systemPrompt: 'sys',
    userText: 'delete s1',
    signal: new AbortController().signal,
    genRequestId: (call) => `req-${call.name}`,
    decide: vi.fn(
      async (): Promise<RuntimeV2Decision> => ({
        finalContent: 'ok',
        finalStatus: 'done',
        pending: false,
      }),
    ),
    hasPersistedExecutionForRequest: vi.fn(async () => false),
    now: () => 1_000,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetNoToolsThisSessionForTests();
});

describe('createAiSdkModelFromSettings', () => {
  it('builds a provider instance for the openai-compatible family only', () => {
    const ds = createAiSdkModelFromSettings({
      ...getDefaultAiChatSettings('deepseek'),
      apiKey: 'k',
    });
    expect(ds && typeof ds).toBe('object');
    expect(createAiSdkModelFromSettings(getDefaultAiChatSettings('anthropic'))).toBeNull();
    expect(createAiSdkModelFromSettings(getDefaultAiChatSettings('ollama'))).toBeNull();
  });
});

describe('runAiRuntimeV2Turn', () => {
  it('runs tools through decide with the shared requestId rule and streams the final text', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolCallStream('set_transcription_text', '{"segmentId":"s1","text":"x"}'),
        textStream('done'),
      ],
    });
    const p = params(model);
    const chunks = await collect(runAiRuntimeV2Turn(p));
    expect(p.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'set_transcription_text',
        requestId: 'req-set_transcription_text',
      }),
    );
    expect(chunks.map((c) => c.delta).join('')).toBe('done');
    expect(chunks.at(-1)).toMatchObject({ done: true, usage: { inputTokens: 6, outputTokens: 4 } });
    expect(loadPendingApproval('conv-1', 2_000).kind).toBe('none');
  });

  it('pending confirmation stops the loop, saves paired history locally and shows the confirm text', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolCallStream('delete_transcription_segment', '{"segmentId":"s1"}'),
        textStream('unreachable'),
      ],
    });
    const p = params(model, {
      decide: vi.fn(async () => ({
        finalContent: '请确认删除',
        finalStatus: 'done' as const,
        pending: true,
      })),
    });
    const chunks = await collect(runAiRuntimeV2Turn(p));
    expect(model.doStreamCalls).toHaveLength(1);
    expect(chunks.map((c) => c.delta ?? '').join('')).toBe('请确认删除');
    const loaded = loadPendingApproval('conv-1', 2_000);
    expect(loaded.kind).toBe('active');
    if (loaded.kind !== 'active') return;
    expect(loaded.state.requestId).toBe('req-delete_transcription_segment');
    expect(loaded.state.expiresAt).toBe(1_000 + PENDING_APPROVAL_TTL_MS);
    const roles = loaded.state.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'tool']);
  });

  it('reload recovery: resumes the saved history and tells the model whether the user executed it', async () => {
    savePendingApproval('conv-1', {
      requestId: 'req-x',
      toolName: 'delete_transcription_segment',
      messages: [{ role: 'user', content: 'delete s1' }],
      createdAt: 0,
    });
    const model = new MockLanguageModelV4({ doStream: [textStream('好的')] });
    const p = params(model, {
      userText: '继续',
      hasPersistedExecutionForRequest: vi.fn(async () => true),
    });
    await collect(runAiRuntimeV2Turn(p));
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('delete s1');
    expect(prompt).toContain('requestId=req-x: confirmed and executed by the user');
    expect(loadPendingApproval('conv-1', 2_000).kind).toBe('none');
  });

  it('expired pending (24 h) is dropped and reported as expired', async () => {
    savePendingApproval('conv-1', {
      requestId: 'req-old',
      toolName: 'delete_layer',
      messages: [],
      createdAt: 0,
    });
    const onExpired = vi.fn(async () => {});
    const model = new MockLanguageModelV4({ doStream: [textStream('hi')] });
    await collect(
      runAiRuntimeV2Turn(params(model, { onExpired, now: () => PENDING_APPROVAL_TTL_MS })),
    );
    expect(onExpired).toHaveBeenCalledWith('req-old', 'delete_layer');
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).not.toContain('req-old');
  });

  it('M2: tools rejected before any output falls back to the untouched legacy stream for this session', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: 'tools is not supported',
          url: 'x',
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const legacy = (async function* () {
      yield { delta: 'legacy' };
      yield { done: true };
    })();
    const chunks = await collect(withLegacyFallback(runAiRuntimeV2Turn(params(model)), legacy));
    expect(chunks).toEqual([{ delta: 'legacy' }, { done: true }]);
    expect(isNoToolsThisSession('deepseek', 'deepseek-chat')).toBe(true);
  });
});
