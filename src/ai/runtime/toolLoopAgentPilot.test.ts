import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  assertProviderInstance,
  createPilotAgent,
  isToolsRejectedError,
  mapStreamPart,
  type PilotToolOutcome,
} from './toolLoopAgentPilot';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const toolCallTurn = (toolName: string, input: string, toolCallId = `c-${toolName}`) => ({
  content: [{ type: 'tool-call' as const, toolCallId, toolName, input }],
  finishReason: { unified: 'tool-calls' as const, raw: undefined },
  usage,
  warnings: [],
});
const textTurn = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
});

function buildAgent(
  turns: ReturnType<typeof toolCallTurn | typeof textTurn>[],
  decide: (name: string) => PilotToolOutcome = () => ({ status: 'done', message: 'ok' }),
  toolApproval?: (name: string) => 'user-approval' | 'not-applicable',
) {
  const model = new MockLanguageModelV4({ doGenerate: turns as never });
  const runToolDecision = vi.fn(async (name: string) => decide(name));
  const agent = createPilotAgent({
    model,
    tools: {
      search_segments: { description: 'search', inputSchema: z.object({ q: z.string() }) },
      list_layers: { description: 'layers', inputSchema: z.object({}) },
      delete_transcription_segment: {
        description: 'delete',
        inputSchema: z.object({ segmentId: z.string() }),
      },
    },
    runToolDecision,
    ...(toolApproval ? { toolApproval } : {}),
  });
  return { agent, model, runToolDecision };
}

const approveDeletes = (name: string) =>
  name === 'delete_transcription_segment'
    ? ('user-approval' as const)
    : ('not-applicable' as const);

describe('toolLoopAgentPilot guardrails (§3.3)', () => {
  it('G1: rejects string model ids', () => {
    expect(() => assertProviderInstance('openai/gpt-4o')).toThrow(/string model ids/);
  });

  it('loop: two reads, then a write needing approval stops with a native approval request', async () => {
    const { agent, model, runToolDecision } = buildAgent(
      [
        toolCallTurn('search_segments', '{"q":"a"}'),
        toolCallTurn('list_layers', '{}'),
        toolCallTurn('delete_transcription_segment', '{"segmentId":"s1"}'),
        textTurn('should not be reached'),
      ],
      undefined,
      approveDeletes,
    );
    const result = await agent.generate({
      messages: [{ role: 'user', content: 'find and delete s1' }],
    });
    // 写工具未执行，只发出 tool-approval-request | the write never ran
    expect(runToolDecision.mock.calls.map((c) => c[0])).toEqual(['search_segments', 'list_layers']);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(result.content.some((p) => p.type === 'tool-approval-request')).toBe(true);
  });

  it('every tool call goes only through runToolDecision, with the parsed input, call id and abort signal', async () => {
    const { agent, runToolDecision } = buildAgent([
      toolCallTurn('delete_transcription_segment', '{"segmentId":"s1"}', 'call-9'),
      textTurn('deleted'),
    ]);
    await agent.generate({
      messages: [{ role: 'user', content: 'delete s1' }],
      abortSignal: new AbortController().signal,
    });
    expect(runToolDecision).toHaveBeenCalledTimes(1);
    expect(runToolDecision).toHaveBeenCalledWith(
      'delete_transcription_segment',
      { segmentId: 's1' },
      'call-9',
      expect.any(AbortSignal),
    );
  });

  it('keeps the chat-only userMessage out of the tool result sent to the model', async () => {
    const { agent, model } = buildAgent(
      [toolCallTurn('list_layers', '{}'), textTurn('done')],
      () => ({ status: 'done', message: '{"layers":[]}', userMessage: 'CHAT-ONLY-TEXT' }),
    );
    await agent.generate({ messages: [{ role: 'user', content: 'layers' }] });
    const prompt = JSON.stringify(model.doGenerateCalls[1]!.prompt);
    expect(prompt).toContain('layers');
    expect(prompt).not.toContain('CHAT-ONLY-TEXT');
  });

  it('G5: invalid args never execute and never become {}', async () => {
    const { agent, runToolDecision } = buildAgent([
      toolCallTurn('delete_transcription_segment', '{"segmentId":'),
      textTurn('need clarification'),
    ]);
    const result = await agent.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(runToolDecision).not.toHaveBeenCalled();
    const invalid = result.steps[0]!.toolCalls[0] as { invalid?: boolean; input: unknown };
    expect(invalid.invalid).toBe(true);
    expect(invalid.input).not.toEqual({});
    expect(mapStreamPart({ ...(invalid as object), type: 'tool-call' } as never)).toMatchObject({
      type: 'invalid-args',
    });
  });

  it('G7: maxRetries 0 => exactly one provider call on failure', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'overloaded',
          url: 'x',
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
        });
      },
    });
    const agent = createPilotAgent({
      model,
      tools: {},
      runToolDecision: vi.fn(),
    });
    await expect(agent.generate({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow();
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('G3: providerExecuted parts are dropped', () => {
    expect(
      mapStreamPart({
        type: 'tool-call',
        toolCallId: 'a',
        toolName: 'web_search',
        input: {},
        providerExecuted: true,
      } as never),
    ).toBeNull();
    expect(
      mapStreamPart({
        type: 'tool-result',
        toolCallId: 'a',
        toolName: 'web_search',
        input: {},
        output: {},
        providerExecuted: true,
      } as never),
    ).toBeNull();
  });

  it('G4: tool-error / tool-result are not provider errors', () => {
    expect(
      mapStreamPart({
        type: 'tool-error',
        toolCallId: 'a',
        toolName: 't',
        input: {},
        error: new Error('bad'),
      } as never),
    ).toBeNull();
    expect(
      mapStreamPart({
        type: 'tool-result',
        toolCallId: 'a',
        toolName: 't',
        input: {},
        output: 1,
      } as never),
    ).toBeNull();
    expect(mapStreamPart({ type: 'error', error: new Error('boom') } as never)).toMatchObject({
      type: 'provider-error',
    });
  });

  it('G6: tools-rejected detection covers APICallError and stream error text, incl. Chinese', () => {
    const api = (statusCode: number, message: string) =>
      new APICallError({
        message,
        url: 'x',
        requestBodyValues: {},
        statusCode,
        isRetryable: false,
      });
    expect(isToolsRejectedError(api(400, 'tools is not supported'))).toBe(true);
    expect(isToolsRejectedError(api(400, '该模型不支持工具调用'))).toBe(true);
    expect(isToolsRejectedError(api(400, 'function calling unavailable'))).toBe(true);
    expect(isToolsRejectedError(api(401, 'invalid key for tool'))).toBe(false);
    expect(isToolsRejectedError(api(429, 'tool rate limit'))).toBe(false);
    expect(isToolsRejectedError(api(500, 'tool backend down'))).toBe(false);
    expect(isToolsRejectedError(api(400, 'context too long'))).toBe(false);
    expect(isToolsRejectedError('不支持函数调用')).toBe(true);
  });

  it('G8: tool-input-start/delta only reach the UI channel', () => {
    expect(mapStreamPart({ type: 'tool-input-start', id: 'a', toolName: 't' } as never)).toEqual({
      type: 'tool-input-ui',
      toolCallId: 'a',
    });
    expect(mapStreamPart({ type: 'tool-input-delta', id: 'a', delta: '{"seg' } as never)).toEqual({
      type: 'tool-input-ui',
      toolCallId: 'a',
    });
  });
});
