import { APICallError, type ModelMessage, type ToolApprovalResponse } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  assertProviderInstance,
  createPilotAgent,
  isToolsRejectedError,
  mapStreamPart,
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

function buildAgent(turns: ReturnType<typeof toolCallTurn | typeof textTurn>[]) {
  const model = new MockLanguageModelV4({ doGenerate: turns as never });
  const readExec = vi.fn(async (input: unknown) => ({ ok: true, input }));
  const runWriteDecision = vi.fn(async () => ({ committed: true }));
  const agent = createPilotAgent({
    model,
    readTools: {
      search_segments: {
        description: 'search',
        inputSchema: z.object({ q: z.string() }),
        execute: readExec,
      },
      list_layers: { description: 'layers', inputSchema: z.object({}), execute: readExec },
    },
    writeTools: {
      delete_transcription_segment: {
        description: 'delete',
        inputSchema: z.object({ segmentId: z.string() }),
      },
    },
    runWriteDecision,
  });
  return { agent, model, readExec, runWriteDecision };
}

describe('toolLoopAgentPilot guardrails (§3.3)', () => {
  it('G1: rejects string model ids', () => {
    expect(() => assertProviderInstance('openai/gpt-4o')).toThrow(/string model ids/);
  });

  it('loop: two read tools, then write needs approval; reject => zero writes', async () => {
    const { agent, readExec, runWriteDecision } = buildAgent([
      toolCallTurn('search_segments', '{"q":"a"}'),
      toolCallTurn('list_layers', '{}'),
      toolCallTurn('delete_transcription_segment', '{"segmentId":"s1"}'),
      textTurn('ok, not deleted'),
    ]);
    const messages: ModelMessage[] = [{ role: 'user', content: 'find and delete s1' }];
    const first = await agent.generate({ messages });
    expect(readExec).toHaveBeenCalledTimes(2);
    const req = first.content.find((p) => p.type === 'tool-approval-request');
    expect(req).toBeDefined();
    expect(runWriteDecision).not.toHaveBeenCalled();

    messages.push(...first.responseMessages);
    const deny: ToolApprovalResponse = {
      type: 'tool-approval-response',
      approvalId: (req as { approvalId: string }).approvalId,
      approved: false,
    };
    messages.push({ role: 'tool', content: [deny] });
    await agent.generate({ messages });
    expect(runWriteDecision).not.toHaveBeenCalled();
  });

  it('approve => write goes only through runWriteDecision, with the call id', async () => {
    const { agent, runWriteDecision } = buildAgent([
      toolCallTurn('delete_transcription_segment', '{"segmentId":"s1"}', 'call-9'),
      textTurn('deleted'),
    ]);
    const messages: ModelMessage[] = [{ role: 'user', content: 'delete s1' }];
    const first = await agent.generate({ messages });
    const req = first.content.find((p) => p.type === 'tool-approval-request') as {
      approvalId: string;
    };
    messages.push(...first.responseMessages, {
      role: 'tool',
      content: [{ type: 'tool-approval-response', approvalId: req.approvalId, approved: true }],
    });
    await agent.generate({ messages });
    expect(runWriteDecision).toHaveBeenCalledTimes(1);
    expect(runWriteDecision).toHaveBeenCalledWith(
      'delete_transcription_segment',
      { segmentId: 's1' },
      'call-9',
    );
  });

  it('G5: invalid args never execute and never become {}', async () => {
    const { agent, runWriteDecision } = buildAgent([
      toolCallTurn('delete_transcription_segment', '{"segmentId":'),
      textTurn('need clarification'),
    ]);
    const result = await agent.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(runWriteDecision).not.toHaveBeenCalled();
    expect(result.content.some((p) => p.type === 'tool-approval-request')).toBe(false);
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
      readTools: {},
      writeTools: {},
      runWriteDecision: vi.fn(),
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
