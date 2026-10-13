// @vitest-environment jsdom
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { loadTurnState } from './aiRuntimeV2Pending';
import {
  runAiRuntimeV2Turn,
  type RunAiRuntimeV2TurnParams,
  type RuntimeV2Decision,
} from './aiRuntimeV2Turn';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const fin = (u: 'tool-calls' | 'stop') => ({
  type: 'finish' as const,
  finishReason: { unified: u, raw: undefined },
  usage,
});
const calls = (...cs: Array<[string, string, string]>) => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'stream-start' as const, warnings: [] },
      ...cs.map(([id, toolName, input]) => ({
        type: 'tool-call' as const,
        toolCallId: id,
        toolName,
        input,
      })),
      fin('tool-calls'),
    ],
  }),
});
const text = (t: string) => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'stream-start' as const, warnings: [] },
      { type: 'text-start' as const, id: 't' },
      { type: 'text-delta' as const, id: 't', delta: t },
      { type: 'text-end' as const, id: 't' },
      fin('stop'),
    ],
  }),
});
const seq = (...rs: unknown[]) => {
  let i = 0;
  return new MockLanguageModelV4({
    doStream: async () => rs[Math.min(i++, rs.length - 1)] as never,
  });
};
async function run(p: RunAiRuntimeV2TurnParams) {
  const out = [];
  for await (const c of runAiRuntimeV2Turn(p)) out.push(c);
  return out;
}
const base = (
  model: MockLanguageModelV4,
  over: Partial<RunAiRuntimeV2TurnParams> = {},
): RunAiRuntimeV2TurnParams => ({
  model,
  providerId: 'p',
  modelId: 'm',
  conversationId: 'c',
  history: [],
  systemPrompt: 's',
  userText: 'u',
  signal: new AbortController().signal,
  genRequestId: (c) => `req-${c.name}-${JSON.stringify(c.arguments)}`,
  decide: vi.fn(
    async (): Promise<RuntimeV2Decision> => ({
      finalContent: 'ok',
      finalStatus: 'done',
      pending: false,
    }),
  ),
  requestApproval: vi.fn(async () => ({ pending: true, text: 'confirm?' })),
  ...over,
});
beforeEach(async () => {
  await db.table('ai_runtime_v2_turns').clear();
});

describe('R2 review probes (after native toolApproval)', () => {
  it('P1: writes never reach decide before approval; unknown tools never execute', async () => {
    const decide = vi.fn(async () => ({
      finalContent: 'ok',
      finalStatus: 'done' as const,
      pending: false,
    }));
    const requestApproval = vi.fn(async () => ({ pending: true, text: 'confirm?' }));
    await run(
      base(
        seq(
          calls(
            ['a', 'delete_transcription_segment', '{"segmentId":"s1"}'],
            ['b', 'not_a_tool', '{}'],
          ),
          text('x'),
        ),
        { decide, requestApproval },
      ),
    );
    expect(decide).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledTimes(1);
  });
  it('P2: two pending writes in one step are both kept (was: last one wins)', async () => {
    const requestApproval = vi.fn(async () => ({ pending: true, text: 'confirm?' }));
    await run(
      base(
        seq(
          calls(
            ['a', 'delete_transcription_segment', '{"segmentId":"s1"}'],
            ['b', 'delete_layer', '{"layerId":"L"}'],
          ),
          text('x'),
        ),
        { requestApproval },
      ),
    );
    const st = await loadTurnState('c', Date.now());
    expect(requestApproval).toHaveBeenCalledTimes(2);
    expect(
      st.kind === 'active'
        ? Object.values(st.state.approvals)
            .map((a) => a.requestId)
            .sort()
        : st.kind,
    ).toEqual([
      'req-delete_layer-{"layerId":"L"}',
      'req-delete_transcription_segment-{"segmentId":"s1"}',
    ]);
  });
  it('P3: invalid JSON args go to clarification, never decide', async () => {
    const decide = vi.fn(async () => ({
      finalContent: 'ok',
      finalStatus: 'done' as const,
      pending: false,
    }));
    const onInvalidArgs = vi.fn(async () => 'clarify-me');
    const out = await run(
      base(seq(calls(['a', 'delete_transcription_segment', '{"segmentId":"s1"']), text('x')), {
        decide,
        onInvalidArgs,
      }),
    );
    expect(decide).not.toHaveBeenCalled();
    expect(onInvalidArgs).toHaveBeenCalledTimes(1);
    expect(out.map((c) => c.delta ?? '').join('')).toBe('clarify-me');
  });
  it('P4: a new message while an approval is unanswered denies it, then the model may ask again', async () => {
    await run(base(seq(calls(['a', 'delete_layer', '{"layerId":"L"}']), text('x'))));
    expect((await loadTurnState('c', Date.now())).kind).toBe('active');
    const onApprovalClosed = vi.fn(async () => {});
    const requestApproval = vi.fn(async () => ({ pending: true, text: 'confirm?' }));
    await run(
      base(seq(calls(['a2', 'delete_layer', '{"layerId":"L"}']), text('x')), {
        userText: 'ok go',
        onApprovalClosed,
        requestApproval,
      }),
    );
    expect(onApprovalClosed).toHaveBeenCalledWith(
      'req-delete_layer-{"layerId":"L"}',
      'delete_layer',
      'unanswered',
    );
    expect(requestApproval).toHaveBeenCalledTimes(1);
  });
  it('strips <think> from visible text and reports a leaked text tool_call (B4)', async () => {
    const onTextToolCallLeak = vi.fn();
    const out = await run(
      base(seq(text('<think>plan</think>{"tool_call":{"name":"undo","arguments":{}}}')), {
        onTextToolCallLeak,
      }),
    );
    const visible = out.map((c) => c.delta ?? '').join('');
    expect(visible).not.toContain('plan');
    expect(onTextToolCallLeak).toHaveBeenCalledTimes(1);
  });
  it('derives tool definitions from zod schemas without boundary validation', async () => {
    const { buildRuntimeV2ToolSpecs } = await import('./aiRuntimeV2Turn');
    const spec = buildRuntimeV2ToolSpecs().set_transcription_text!;
    expect(spec.description).toContain('set_transcription_text');
    const json = (
      spec.inputSchema as {
        jsonSchema: { properties: Record<string, unknown>; required?: unknown };
      }
    ).jsonSchema;
    expect(Object.keys(json.properties)).toContain('text');
    expect(json.required).toBeUndefined();
  });
});
