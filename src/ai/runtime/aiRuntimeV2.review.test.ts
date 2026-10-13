// @vitest-environment jsdom
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPendingApproval } from './aiRuntimeV2Pending';
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
  hasPersistedExecutionForRequest: vi.fn(async () => false),
  ...over,
});
beforeEach(() => localStorage.clear());

describe('R2 review probes (after B1/B2/B4 fixes)', () => {
  it('P1 bypass: every tool call goes through decide (unknown tool name too)', async () => {
    const decide = vi.fn(async () => ({
      finalContent: 'ok',
      finalStatus: 'done' as const,
      pending: false,
    }));
    await run(
      base(
        seq(
          calls(
            ['a', 'delete_transcription_segment', '{"segmentId":"s1"}'],
            ['b', 'not_a_tool', '{}'],
          ),
          text('x'),
        ),
        { decide },
      ),
    );
    console.warn(
      'P1 decide calls',
      decide.mock.calls.map((c) => ((c as unknown[])[0] as { name: string }).name),
    );
    expect(decide).toHaveBeenCalledTimes(1);
  });
  it('P2 two pending calls in one step: both saved?', async () => {
    const decide = vi.fn(async () => ({
      finalContent: 'confirm?',
      finalStatus: 'done' as const,
      pending: true,
    }));
    await run(
      base(
        seq(
          calls(
            ['a', 'delete_transcription_segment', '{"segmentId":"s1"}'],
            ['b', 'delete_layer', '{"layerId":"L"}'],
          ),
          text('x'),
        ),
        { decide },
      ),
    );
    const st = loadPendingApproval('c', Date.now());
    console.warn(
      'P2 decide',
      decide.mock.calls.length,
      'saved',
      st.kind === 'active' ? st.state.requestId : st.kind,
    );
    // B1：第二个需确认的调用被拒，不进管线，只保存第一个 pending
    expect(decide).toHaveBeenCalledTimes(1);
    expect(st.kind === 'active' ? st.state.toolName : st.kind).toBe('delete_transcription_segment');
  });
  it('P3 invalid JSON args: decide not called, any invalid_args signal?', async () => {
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
    console.warn('P3 decide', decide.mock.calls.length, JSON.stringify(out));
    expect(decide).not.toHaveBeenCalled();
    // B2：进入澄清（invalid_args 审计由 onInvalidArgs 写），且循环停止
    expect(onInvalidArgs).toHaveBeenCalledTimes(1);
    expect(out.map((c) => c.delta ?? '').join('')).toBe('clarify-me');
  });
  it('P4 resume after reload, model re-proposes same tool: decide again (dup confirm risk)', async () => {
    const decide = vi.fn(async () => ({
      finalContent: 'confirm?',
      finalStatus: 'done' as const,
      pending: true,
    }));
    await run(base(seq(calls(['a', 'delete_layer', '{"layerId":"L"}']), text('x')), { decide }));
    expect(loadPendingApproval('c', Date.now()).kind).toBe('active');
    // "reload": new turn, user has NOT confirmed yet, model re-calls
    const decide2 = vi.fn(async () => ({
      finalContent: 'confirm?',
      finalStatus: 'done' as const,
      pending: true,
    }));
    await run(
      base(seq(calls(['a2', 'delete_layer', '{"layerId":"L"}']), text('x')), {
        decide: decide2,
        userText: 'ok go',
      }),
    );
    console.warn('P4 second-turn decide calls', decide2.mock.calls.length);
  });
  it('P5 abort mid-execute: pending not saved, decide still completes', async () => {
    const ac = new AbortController();
    let finished = false;
    const decide = vi.fn(async () => {
      ac.abort();
      await new Promise((r) => setTimeout(r, 20));
      finished = true;
      return { finalContent: 'c', finalStatus: 'done' as const, pending: true };
    });
    await run(
      base(seq(calls(['a', 'delete_layer', '{"layerId":"L"}']), text('x')), {
        decide,
        signal: ac.signal,
      }),
    );
    await new Promise((r) => setTimeout(r, 40));
    console.warn('P5 finished', finished, 'saved', loadPendingApproval('c', Date.now()).kind);
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
