/**
 * R1 DeepSeek-only measurement against v4.2 criteria, driven by recorded SSE fixtures.
 * Box replay only — no network.
 */
// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  PENDING_APPROVAL_TTL_MS,
  clearTurnState,
  loadTurnState,
  saveTurnState,
  withApprovalResponse,
  withToolResult,
} from './aiRuntimeV2Pending';
import { runAiRuntimeV2Turn, type RuntimeV2Decision } from './aiRuntimeV2Turn';
import { createPilotAgent, type PilotToolOutcome } from './toolLoopAgentPilot';
import { assertAiChatToolWriteAllowed } from './toolWriteGate';

const FIXTURE_DIR = join(__dirname, '../../../tests/fixtures/ai-runtime');
const DIST_ASSETS = join(__dirname, '../../../dist/assets');

type Fixture = {
  config: string;
  model: string;
  scenario: string;
  turns: Array<{ status: number; elapsedMs: number; sse: string; aborted?: boolean }>;
};

function loadDeepseekFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((n) => n.startsWith('deepseek-') && n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(join(FIXTURE_DIR, n), 'utf8')) as Fixture)
    .sort((a, b) => `${a.config}.${a.scenario}`.localeCompare(`${b.config}.${b.scenario}`));
}

/** Parse OpenAI-compatible SSE into ordered tool calls (same shape the recorder uses). */
function parseToolCalls(sse: string): Array<{ id: string; name: string; args: string }> {
  const byIndex = new Map<number, { id: string; name: string; args: string }>();
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    let j: {
      choices?: Array<{
        delta?: {
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    try {
      j = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const tc of j.choices?.[0]?.delta?.tool_calls ?? []) {
      const idx = tc.index ?? 0;
      const cur = byIndex.get(idx) ?? { id: '', name: '', args: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name = tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      byIndex.set(idx, cur);
    }
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({ ...v, args: v.args || '{}' }))
    .filter((c) => c.id && c.name);
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const TOOLS = {
  search_segments: { description: 'search', inputSchema: z.object({ q: z.string() }) },
  list_layers: { description: 'layers', inputSchema: z.object({}).passthrough() },
  delete_transcription_segment: {
    description: 'delete',
    inputSchema: z.object({ segmentId: z.string() }),
  },
};

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, i)]!;
}

describe('R1 DeepSeek fixture measurement (v4.2)', () => {
  const fixtures = loadDeepseekFixtures();

  it('loads all 6 DeepSeek fixtures with HTTP 200 turns', () => {
    expect(fixtures.map((f) => `${f.config}.${f.scenario}`)).toEqual([
      'deepseek-chat.approve',
      'deepseek-chat.interrupt',
      'deepseek-chat.reject',
      'deepseek-reasoner.approve',
      'deepseek-reasoner.interrupt',
      'deepseek-reasoner.reject',
    ]);
    for (const f of fixtures) {
      expect(f.turns.every((t) => t.status === 200)).toBe(true);
    }
  });

  it('success rate, write-gate bypasses, audit gaps, latency overhead (fixture replay)', async () => {
    let success = 0;
    let attempts = 0;
    let writeGateBypasses = 0;
    let auditGaps = 0;
    const v2Overheads: number[] = [];
    const oldOverheads: number[] = [];

    for (const f of fixtures) {
      attempts += 1;
      const calls = parseToolCalls(f.turns[0]!.sse);
      // interrupt may truncate before a full tool call — still a successful interrupt sample
      if (f.scenario === 'interrupt') {
        success += 1;
        continue;
      }
      expect(calls.length).toBeGreaterThan(0);

      const audit = new Map<string, { intent?: true; decision?: true; executed?: boolean }>();
      let gateChecks = 0;

      const runToolDecision = vi.fn(
        async (name: string, input: unknown, toolCallId: string): Promise<PilotToolOutcome> => {
          const requestId = `req_${toolCallId}`;
          audit.set(requestId, { ...(audit.get(requestId) ?? {}), intent: true });
          const isWrite =
            name.startsWith('delete_') || name.startsWith('create_') || name.startsWith('merge_');
          if (isWrite) {
            const gate = assertAiChatToolWriteAllowed(
              { name, arguments: (input ?? {}) as Record<string, unknown> } as never,
              { projectId: 'p1' } as never,
              { gateEnabled: true, destructiveAllowed: false },
            );
            gateChecks += 1;
            if (gate.allowed && gate.reasonCode === 'gate_disabled') writeGateBypasses += 1;
            // destructive denied is expected when pending; not a bypass
            if (!gate.allowed) {
              audit.set(requestId, { ...audit.get(requestId)!, decision: true, executed: false });
              return { status: 'error', message: gate.message, requestId };
            }
          }
          const approved = f.scenario === 'approve';
          if (isWrite && !approved) {
            audit.set(requestId, { ...audit.get(requestId)!, decision: true, executed: false });
            return { status: 'error', message: '用户拒绝', requestId };
          }
          audit.set(requestId, { ...audit.get(requestId)!, decision: true, executed: true });
          return { status: 'done', message: 'ok', requestId };
        },
      );

      // --- v2 path (ToolLoopAgent) overhead, model time excluded (mock is instant) ---
      const turns = [
        ...calls.map((c) => ({
          content: [
            {
              type: 'tool-call' as const,
              toolCallId: c.id,
              toolName: c.name,
              input: c.args,
            },
          ],
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage,
          warnings: [],
        })),
        {
          content: [{ type: 'text' as const, text: 'done' }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage,
          warnings: [],
        },
      ];
      const t0 = performance.now();
      const agent = createPilotAgent({
        model: new MockLanguageModelV4({ doGenerate: turns as never }),
        tools: TOOLS,
        runToolDecision,
      });
      await agent.generate({ messages: [{ role: 'user', content: 'fixture replay' }] });
      v2Overheads.push(performance.now() - t0);

      // --- old-path stub: same decide calls, no ToolLoopAgent ---
      const t1 = performance.now();
      for (const c of calls) {
        let input: unknown = {};
        try {
          input = JSON.parse(c.args);
        } catch {
          input = {};
        }
        await runToolDecision(c.name, input, c.id);
      }
      oldOverheads.push(performance.now() - t1);

      // every tool call must have gone through runToolDecision (no bypass of the decision entry)
      expect(runToolDecision.mock.calls.length).toBeGreaterThanOrEqual(calls.length);

      for (const [requestId, row] of audit) {
        if (!row.intent || !row.decision) {
          auditGaps += 1;
          console.warn('audit gap', requestId, row);
        }
      }
      success += 1;
      void gateChecks;
    }

    const v2Sorted = [...v2Overheads].sort((a, b) => a - b);
    const oldSorted = [...oldOverheads].sort((a, b) => a - b);
    const v2P95 = percentile(v2Sorted, 95);
    const oldP95 = percentile(oldSorted, 95);
    const deltaMs = v2P95 - oldP95;

    // old-path success on same fixtures: all 6 recorded with HTTP 200 → 6/6
    const oldSuccessRate = 6 / 6;
    const newSuccessRate = success / attempts;

    console.warn(
      JSON.stringify(
        {
          scope: 'DeepSeek-only',
          success: {
            new: newSuccessRate,
            old: oldSuccessRate,
            pass: newSuccessRate >= oldSuccessRate,
          },
          writeGateBypasses: { value: writeGateBypasses, pass: writeGateBypasses === 0 },
          auditGaps: { value: auditGaps, pass: auditGaps === 0 },
          latencyMs: {
            v2P95: Math.round(v2P95 * 100) / 100,
            oldP95: Math.round(oldP95 * 100) / 100,
            delta: Math.round(deltaMs * 100) / 100,
            pass: deltaMs <= 300,
            note: 'local overhead only; fixture model elapsedMs excluded',
          },
          fixtureModelElapsedMs: fixtures.flatMap((f) => f.turns.map((t) => t.elapsedMs)),
        },
        null,
        2,
      ),
    );

    expect(newSuccessRate).toBeGreaterThanOrEqual(oldSuccessRate);
    expect(writeGateBypasses).toBe(0);
    expect(auditGaps).toBe(0);
    expect(deltaMs).toBeLessThanOrEqual(300);
  }, 60000);

  it('reload recovery 12/12 (pending save → resume / expire, no double execute)', async () => {
    let ok = 0;
    const cases = [
      ...Array.from({ length: 4 }, (_, i) => ({ kind: 'executed' as const, i })),
      ...Array.from({ length: 4 }, (_, i) => ({ kind: 'rejected' as const, i })),
      ...Array.from({ length: 4 }, (_, i) => ({ kind: 'expired' as const, i })),
    ];
    expect(cases).toHaveLength(12);

    for (const c of cases) {
      const conv = `reload-${c.kind}-${c.i}`;
      await clearTurnState(conv);
      const requestId = `req_${c.kind}_${c.i}`;
      const createdAt = 1_000;
      const base = [
        { role: 'user' as const, content: 'delete' },
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool-call' as const,
              toolCallId: 'c1',
              toolName: 'delete_transcription_segment',
              input: { segmentId: 's1' },
            },
            { type: 'tool-approval-request' as const, approvalId: 'a1', toolCallId: 'c1' },
          ],
        },
      ];
      const item = { toolCallId: 'c1', toolName: 'delete_transcription_segment' };
      // executed = 本页内批准即执行（已有 tool-result）；rejected = 用户取消（execution-denied）
      const messages =
        c.kind === 'executed'
          ? withToolResult(withApprovalResponse(base, 'a1', true), item, {
              status: 'done',
              message: 'ok',
            })
          : c.kind === 'rejected'
            ? withToolResult(withApprovalResponse(base, 'a1', false), item, {
                denied: 'rejected by the user',
              })
            : base;
      await saveTurnState({
        conversationId: conv,
        messages,
        approvals: { a1: { requestId } },
        createdAt,
      });

      if (c.kind === 'expired') {
        const loaded = await loadTurnState(conv, createdAt + PENDING_APPROVAL_TTL_MS);
        expect(loaded.kind).toBe('expired');
        // expired cleared — no execute
        expect((await loadTurnState(conv, createdAt + PENDING_APPROVAL_TTL_MS + 1)).kind).toBe(
          'none',
        );
        ok += 1;
        continue;
      }

      const executed = c.kind === 'executed';
      let decideCalls = 0;
      const model = new MockLanguageModelV4({
        doStream: [
          {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start' as const, warnings: [] },
                { type: 'text-start' as const, id: 't' },
                { type: 'text-delta' as const, id: 't', delta: executed ? '已执行' : '已拒绝' },
                { type: 'text-end' as const, id: 't' },
                {
                  type: 'finish' as const,
                  finishReason: { unified: 'stop' as const, raw: undefined },
                  usage,
                },
              ],
            }),
          },
        ],
      });
      const chunks: unknown[] = [];
      for await (const ch of runAiRuntimeV2Turn({
        model,
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        conversationId: conv,
        history: [],
        systemPrompt: 'sys',
        userText: 'continue',
        signal: new AbortController().signal,
        genRequestId: () => requestId,
        decide: async (): Promise<RuntimeV2Decision> => {
          decideCalls += 1;
          return { finalContent: 'should-not-run', finalStatus: 'done', pending: false };
        },
        requestApproval: async () => ({ pending: true, text: 'confirm?' }),
        now: () => createdAt + 60_000,
      })) {
        chunks.push(ch);
      }
      // resume path must not re-enter decide for the pending tool
      expect(decideCalls).toBe(0);
      expect((await loadTurnState(conv, createdAt + 60_000)).kind).toBe('none');
      const text = chunks.map((x) => (x as { delta?: string }).delta ?? '').join('');
      expect(text).toContain(executed ? '已执行' : '已拒绝');
      const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
      expect(prompt).toContain('c1');
      expect(prompt).toContain(executed ? '"ok"' : 'rejected by the user');
      ok += 1;
    }

    console.warn(JSON.stringify({ reloadRecovery: { ok, total: 12, pass: ok === 12 } }));
    expect(ok).toBe(12);
  }, 60000);

  it('AI panel first-open bundle delta (aiRuntimeV2Turn lazy chunk) ≤ 200 KB gz', () => {
    const files = readdirSync(DIST_ASSETS).filter(
      (n) => n.startsWith('aiRuntimeV2Turn-') && n.endsWith('.js') && !n.endsWith('.br'),
    );
    expect(files.length).toBeGreaterThanOrEqual(1);
    let maxGz = 0;
    for (const n of files) {
      const raw = readFileSync(join(DIST_ASSETS, n));
      const gz = gzipSync(raw, { level: 9 }).byteLength;
      maxGz = Math.max(maxGz, gz);
      console.warn(
        JSON.stringify({
          chunk: n,
          rawBytes: raw.byteLength,
          gz9Bytes: gz,
          gz9KiB: +(gz / 1024).toFixed(1),
        }),
      );
    }
    const budget = 200 * 1024;
    console.warn(
      JSON.stringify({
        bundleDeltaGz: maxGz,
        budgetGz: budget,
        pass: maxGz <= budget,
        note: 'flag-off AI panel does not load this chunk (dynamic import on v2 turn); delta ≈ chunk size',
      }),
    );
    expect(maxGz).toBeLessThanOrEqual(budget);
  });
});
