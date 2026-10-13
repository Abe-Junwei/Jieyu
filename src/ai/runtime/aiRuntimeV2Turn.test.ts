// @vitest-environment jsdom
import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultAiChatSettings } from '../providers/providerCatalog';
import { db } from '../../db';
import { AI_CHAT_TOOL_NAMES_FROM_PARSER } from '../chat/toolCallSchemas';
import { getAiToolPolicy } from '../policy/aiToolPolicyMatrix';
import type { AiChatToolName } from '../chat/aiChatToolName.types';
import {
  PENDING_APPROVAL_TTL_MS,
  loadTurnState,
  resolveApproval,
  saveTurnState,
  sweepExpiredTurnStates,
  restoreFirstUnanswered,
  expireApprovalIfStale,
  unansweredApprovals,
} from './aiRuntimeV2Pending';
import {
  createAiSdkModelFromSettings,
  runAiRuntimeV2Turn,
  runtimeV2ToolApproval,
  withLegacyFallback,
  type RunAiRuntimeV2TurnParams,
  type RuntimeV2Decision,
} from './aiRuntimeV2Turn';
import { isNoToolsThisSession, resetNoToolsThisSessionForTests } from './toolLoopAgentPilot';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const toolCallStream = (toolName: string, input: string, more: Array<[string, string]> = []) => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'stream-start' as const, warnings: [] },
      { type: 'tool-call' as const, toolCallId: `c-${toolName}`, toolName, input },
      ...more.map(([n, i]) => ({
        type: 'tool-call' as const,
        toolCallId: `c-${n}`,
        toolName: n,
        input: i,
      })),
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
    genRequestId: (call) => `req-${call.name}-${JSON.stringify(call.arguments)}`,
    decide: vi.fn(
      async (): Promise<RuntimeV2Decision> => ({
        finalContent: 'ok',
        finalStatus: 'done',
        pending: false,
      }),
    ),
    requestApproval: vi.fn(async (call) => ({
      pending: true,
      text: `请确认 ${call.name}`,
      card: { call },
    })),
    now: () => 1_000,
    ...over,
  };
}

beforeEach(async () => {
  await db.table('ai_runtime_v2_turns').clear();
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
  it('tools without approval (not-applicable) run through decide (auto); final text streams', async () => {
    const model = new MockLanguageModelV4({
      doStream: [toolCallStream('set_transcription_text', '{}'), textStream('done')],
    });
    // 生产策略里所有暴露的工具都是写工具；这里覆盖策略只为覆盖 auto 分支 | override only to hit the auto path
    const p = params(model, { approvalFor: () => 'not-applicable' });
    const chunks = await collect(runAiRuntimeV2Turn(p));
    expect(p.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'set_transcription_text',
        requestId: 'req-set_transcription_text-{}',
      }),
      'auto',
    );
    expect(p.requestApproval).not.toHaveBeenCalled();
    expect(chunks.map((c) => c.delta).join('')).toBe('done');
    expect(chunks.at(-1)).toMatchObject({ done: true, usage: { inputTokens: 6, outputTokens: 4 } });
    expect((await loadTurnState('conv-1', 2_000)).kind).toBe('none');
  });

  it('guardrail: no write tool can skip approval (never not-applicable)', () => {
    for (const name of AI_CHAT_TOOL_NAMES_FROM_PARSER) {
      const policy = getAiToolPolicy(name as AiChatToolName) as { effect?: string } | undefined;
      const status = runtimeV2ToolApproval(name);
      if (policy?.effect === 'read') expect(status, name).toBe('not-applicable');
      else expect(status, name).toMatchObject({ type: 'user-approval' });
    }
    expect(runtimeV2ToolApproval('not_a_tool')).toBe('denied');
  });

  it('a write stops with a native approval request: never executed, card + state saved in Dexie', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolCallStream('delete_transcription_segment', '{"segmentId":"s1"}'),
        textStream('unreachable'),
      ],
    });
    const p = params(model, { pendingHint: ' [hint]' });
    const chunks = await collect(runAiRuntimeV2Turn(p));
    expect(model.doStreamCalls).toHaveLength(1);
    expect(p.decide).not.toHaveBeenCalled();
    expect(chunks.map((c) => c.delta ?? '').join('')).toBe(
      '请确认 delete_transcription_segment [hint]',
    );
    const loaded = await loadTurnState('conv-1', 2_000);
    expect(loaded.kind).toBe('active');
    if (loaded.kind !== 'active') return;
    expect(loaded.state.expiresAt).toBe(1_000 + PENDING_APPROVAL_TTL_MS);
    expect(JSON.stringify(loaded.state.messages)).toContain('tool-approval-request');
    expect(Object.values(loaded.state.approvals)[0]!.requestId).toBe(
      'req-delete_transcription_segment-{"segmentId":"s1"}',
    );
  });

  it('two writes in one step: both get their own approval, and each executes with its own requestId', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolCallStream('delete_transcription_segment', '{"segmentId":"s1"}', [
          ['delete_layer', '{"layerId":"L"}'],
        ]),
        textStream('x'),
      ],
    });
    const p = params(model, { conversationId: 'conv-multi' });
    await collect(runAiRuntimeV2Turn(p));
    expect(p.requestApproval).toHaveBeenCalledTimes(2);
    const loaded = await loadTurnState('conv-multi', 2_000);
    if (loaded.kind !== 'active') throw new Error('state missing');
    const ids = Object.keys(loaded.state.approvals);
    expect(ids).toHaveLength(2);
    const first = await resolveApproval('conv-multi', ids[0]!, true, 2_000);
    expect(first?.outcome).toMatchObject({ status: 'done' });
    expect(first?.nextCard).toBeDefined();
    const second = await resolveApproval('conv-multi', ids[1]!, true, 2_000);
    expect(second?.outcome).toMatchObject({ status: 'done' });
    const approvedCalls = vi.mocked(p.decide).mock.calls.filter((c) => c[1] === 'approved');
    expect(approvedCalls.map((c) => c[0].requestId).sort()).toEqual([
      'req-delete_layer-{"layerId":"L"}',
      'req-delete_transcription_segment-{"segmentId":"s1"}',
    ]);
  });

  it('reload recovery: approved-without-result runs through the pipeline first, unanswered is denied', async () => {
    await saveTurnState({
      conversationId: 'conv-reload',
      createdAt: 0,
      approvals: { a1: { requestId: 'req-a1' }, a2: { requestId: 'req-a2' } },
      messages: [
        { role: 'user', content: 'delete s1 and layer L' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'delete_transcription_segment',
              input: { segmentId: 's1' },
            },
            {
              type: 'tool-call',
              toolCallId: 'c2',
              toolName: 'delete_layer',
              input: { layerId: 'L' },
            },
            { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' },
            { type: 'tool-approval-request', approvalId: 'a2', toolCallId: 'c2' },
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-approval-response', approvalId: 'a1', approved: true }],
        },
      ],
    });
    const onApprovalClosed = vi.fn(async () => {});
    const model = new MockLanguageModelV4({ doStream: [textStream('好的')] });
    const p = params(model, { conversationId: 'conv-reload', userText: '继续', onApprovalClosed });
    await collect(runAiRuntimeV2Turn(p));
    expect(p.decide).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-a1' }),
      'approved',
    );
    expect(onApprovalClosed).toHaveBeenCalledWith('req-a2', 'delete_layer', 'unanswered');
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('继续');
    expect(prompt).toContain('c1');
    expect((await loadTurnState('conv-reload', 2_000)).kind).toBe('none');
  });

  it('N1: approving executes the card snapshot, even if the selection changed after the card appeared (same page)', async () => {
    const model = new MockLanguageModelV4({
      doStream: [toolCallStream('delete_transcription_segment', '{}'), textStream('x')],
    });
    // 卡片按当时选区解析为 seg-A | the card resolved the selection to seg-A
    const p = params(model, {
      conversationId: 'conv-n1',
      requestApproval: vi.fn(async (call) => ({
        pending: true,
        text: 'confirm',
        card: { call },
        executionCall: { name: call.name, arguments: { segmentId: 'seg-A' } },
      })),
    });
    await collect(runAiRuntimeV2Turn(p));
    const loaded = await loadTurnState('conv-n1', 2_000);
    if (loaded.kind !== 'active') throw new Error('state missing');
    const [approvalId] = Object.keys(loaded.state.approvals);
    // 选区随后切到 seg-B：执行仍不得重新解析 | selection moves to seg-B; no re-resolution allowed
    await resolveApproval('conv-n1', approvalId!, true, 2_000);
    const approved = vi.mocked(p.decide).mock.calls.filter((c) => c[1] === 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0]![0]).toMatchObject({
      name: 'delete_transcription_segment',
      arguments: { segmentId: 'seg-A' },
      requestId: 'req-delete_transcription_segment-{}',
    });
  });

  it('N1: after reload, the approved card snapshot is what runs at the next turn', async () => {
    await saveTurnState({
      conversationId: 'conv-n1-reload',
      createdAt: 0,
      approvals: {
        a1: {
          requestId: 'req-a1',
          executionCall: {
            name: 'delete_transcription_segment',
            arguments: { segmentId: 'seg-A' },
          },
        },
      },
      messages: [
        { role: 'user', content: 'delete this' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'delete_transcription_segment',
              input: {},
            },
            { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' },
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-approval-response', approvalId: 'a1', approved: true }],
        },
      ],
    });
    const model = new MockLanguageModelV4({ doStream: [textStream('ok')] });
    const p = params(model, { conversationId: 'conv-n1-reload', userText: 'go on' });
    await collect(runAiRuntimeV2Turn(p));
    expect(p.decide).toHaveBeenCalledTimes(1);
    expect(p.decide).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: { segmentId: 'seg-A' }, requestId: 'req-a1' }),
      'approved',
    );
  });

  it('an unanswered approval whose execution was already persisted is reported as executed, not denied', async () => {
    await saveTurnState({
      conversationId: 'conv-crash',
      createdAt: 0,
      approvals: { a1: { requestId: 'req-done' } },
      messages: [
        { role: 'user', content: 'delete s1' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'delete_transcription_segment',
              input: { segmentId: 's1' },
            },
            { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' },
          ],
        },
      ],
    });
    const onApprovalClosed = vi.fn(async () => {});
    const model = new MockLanguageModelV4({ doStream: [textStream('ok')] });
    const p = params(model, {
      conversationId: 'conv-crash',
      userText: 'next',
      onApprovalClosed,
      hasPersistedExecutionForRequest: async (rid) => rid === 'req-done',
    });
    await collect(runAiRuntimeV2Turn(p));
    expect(onApprovalClosed).not.toHaveBeenCalled();
    expect(p.decide).not.toHaveBeenCalled();
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('executed before the page closed');
    expect(prompt).not.toContain('execution-denied');
  });

  describe('S1: restored cards are verified against the database, not the old read-model epoch', () => {
    const T0 = '2026-10-13T00:00:00.000Z';
    async function seedPending(conversationId: string) {
      await db
        .table('texts')
        .put({ id: 't-s1', title: { default: 'T' }, createdAt: T0, updatedAt: T0 });
      await saveTurnState({
        conversationId,
        createdAt: 1_000,
        approvals: {
          a1: {
            requestId: 'req-s1',
            card: { call: { name: 'delete_layer' }, readModelEpochCaptured: 7 },
            executionCall: { name: 'delete_layer', arguments: { layerId: 't-s1' } },
          },
        },
        messages: [
          { role: 'user', content: 'x' },
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolCallId: 'c1', toolName: 'delete_layer', input: {} },
              { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' },
            ],
          },
        ],
      });
    }

    it('right after a reload with no data change, the card is restored and can be approved', async () => {
      await seedPending('conv-s1-ok');
      const r = await restoreFirstUnanswered('conv-s1-ok', 2_000);
      expect(r?.kind).toBe('card');
      const resolved = await resolveApproval('conv-s1-ok', 'a1', true, 2_000);
      expect(resolved).not.toBeNull();
    });

    it('after the target changes, the approval expires and is closed as denied', async () => {
      await seedPending('conv-s1-stale');
      await db.table('texts').update('t-s1', { updatedAt: '2026-10-13T01:00:00.000Z' });
      const r = await restoreFirstUnanswered('conv-s1-stale', 2_000);
      expect(r).toMatchObject({ kind: 'stale', requestId: 'req-s1', toolName: 'delete_layer' });
      const loaded = await loadTurnState('conv-s1-stale', 2_000);
      if (loaded.kind !== 'active') throw new Error('state missing');
      expect(unansweredApprovals(loaded.state.messages)).toHaveLength(0);
      expect(await resolveApproval('conv-s1-stale', 'a1', true, 2_000)).toBeNull();
    });

    it('a target that changes after the card was restored still expires at approval time', async () => {
      await seedPending('conv-s1-late');
      expect((await restoreFirstUnanswered('conv-s1-late', 2_000))?.kind).toBe('card');
      await db.table('texts').update('t-s1', { updatedAt: '2026-10-13T02:00:00.000Z' });
      const r = await resolveApproval('conv-s1-late', 'a1', true, 2_000);
      expect(r).toMatchObject({ stale: true });
    });
  });

  describe('S2: fingerprints cover content rows, tokens, nested targets; reload fails closed', () => {
    const T0 = '2026-10-13T00:00:00.000Z';
    const T1 = '2026-10-13T03:00:00.000Z';
    async function seed(conversationId: string, name: string, args: Record<string, unknown>) {
      await saveTurnState({
        conversationId,
        createdAt: 1_000,
        approvals: {
          a1: {
            requestId: `req-${conversationId}`,
            card: { call: { name } },
            executionCall: { name, arguments: args },
          },
        },
        messages: [
          { role: 'user', content: 'x' },
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolCallId: 'c1', toolName: name, input: {} },
              { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' },
            ],
          },
        ],
      });
    }

    it('a text-only change (layer_unit_contents) expires a segment approval', async () => {
      await db
        .table('layer_units')
        .put({ id: 'u-s2', textId: 't', startTime: 0, endTime: 1, createdAt: T0, updatedAt: T0 });
      await db.table('layer_unit_contents').put({
        id: 'c-s2',
        unitId: 'u-s2',
        textId: 't',
        startTime: 0,
        endTime: 1,
        createdAt: T0,
        updatedAt: T0,
      });
      await seed('conv-s2-text', 'set_transcription_text', { segmentId: 'u-s2', text: 'new' });
      await db.table('layer_unit_contents').update('c-s2', { updatedAt: T1 });
      expect((await restoreFirstUnanswered('conv-s2-text', 2_000))?.kind).toBe('stale');
    });

    it('a token change (unit_tokens) expires set_token_gloss', async () => {
      await db.table('unit_tokens').put({
        id: 'tok-s2',
        unitId: 'u',
        textId: 't',
        tokenIndex: 0,
        form: { default: 'w' },
        createdAt: T0,
        updatedAt: T0,
      });
      await seed('conv-s2-tok', 'set_token_gloss', { tokenId: 'tok-s2', gloss: 'g' });
      expect((await restoreFirstUnanswered('conv-s2-tok', 2_000))?.kind).toBe('card');
      await db.table('unit_tokens').delete('tok-s2');
      expect(await resolveApproval('conv-s2-tok', 'a1', true, 2_000)).toMatchObject({
        stale: true,
      });
    });

    it('a nested propose_changes target is checked before the batch runs', async () => {
      await db
        .table('layer_units')
        .put({ id: 'u-s2n', textId: 't', startTime: 0, endTime: 1, createdAt: T0, updatedAt: T0 });
      await seed('conv-s2-nest', 'propose_changes', {
        changes: [{ tool: 'delete_transcription_segment', arguments: { segmentId: 'u-s2n' } }],
      });
      expect(await expireApprovalIfStale('conv-s2-nest', 'a1', 2_000)).toBe(false);
      await db.table('layer_units').delete('u-s2n');
      expect(await expireApprovalIfStale('conv-s2-nest', 'a1', 2_000)).toBe(true);
    });

    it('S3: after reload, tools outside the restore-safe allowlist expire (merge_prev, nested child)', async () => {
      await db
        .table('layer_units')
        .put({ id: 'u-s3', textId: 't', startTime: 0, endTime: 1, createdAt: T0, updatedAt: T0 });
      await seed('conv-s3-prev', 'merge_prev', { segmentId: 'u-s3' });
      expect((await restoreFirstUnanswered('conv-s3-prev', 2_000))?.kind).toBe('stale');
      await seed('conv-s3-nest', 'propose_changes', {
        changes: [{ tool: 'merge_next', arguments: { segmentId: 'u-s3' } }],
      });
      expect((await restoreFirstUnanswered('conv-s3-nest', 2_000))?.kind).toBe('stale');
      await seed('conv-s3-ok', 'propose_changes', {
        changes: [{ tool: 'delete_transcription_segment', arguments: { segmentId: 'u-s3' } }],
      });
      expect((await restoreFirstUnanswered('conv-s3-ok', 2_000))?.kind).toBe('card');
    });

    it('after reload a write tool with no checkable target expires', async () => {
      await seed('conv-s2-none', 'create_transcription_layer', { languageId: 'zho' });
      expect((await restoreFirstUnanswered('conv-s2-none', 2_000))?.kind).toBe('stale');
    });
  });

  it('N3: sweepExpiredTurnStates removes only expired rows', async () => {
    await saveTurnState({ conversationId: 'old', createdAt: 0, approvals: {}, messages: [] });
    await saveTurnState({ conversationId: 'new', createdAt: 10_000, approvals: {}, messages: [] });
    await sweepExpiredTurnStates(PENDING_APPROVAL_TTL_MS + 1);
    const keys = (await db.table('ai_runtime_v2_turns').toCollection().primaryKeys()).sort();
    expect(keys).toEqual(['new']);
  });

  it('expired approvals (24 h) are dropped and reported as expired', async () => {
    await saveTurnState({
      conversationId: 'conv-1',
      createdAt: 0,
      approvals: { a1: { requestId: 'req-old' } },
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: 'c1', toolName: 'delete_layer', input: {} },
            { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' },
          ],
        },
      ],
    });
    const onApprovalClosed = vi.fn(async () => {});
    const model = new MockLanguageModelV4({ doStream: [textStream('hi')] });
    await collect(
      runAiRuntimeV2Turn(params(model, { onApprovalClosed, now: () => PENDING_APPROVAL_TTL_MS })),
    );
    expect(onApprovalClosed).toHaveBeenCalledWith('req-old', 'delete_layer', 'expired');
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).not.toContain('c1');
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
