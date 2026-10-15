// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: true,
    aiExternalMcpHttpClientEnabled: true,
    aiExternalMcpSendTurnEnabled: true,
    aiSemanticGuardEnabled: true,
  },
}));

import { getDb, resetJieyuDatabaseSingletonForTests } from '../../../db';
import { setExternalMcpTrustEnabled } from './externalMcpTrustRegistry';
import {
  buildExternalMcpToolCallGuide,
  decodeExternalMcpToolName,
  encodeExternalMcpToolName,
  externalMcpModelMessage,
  listRuntimeV2ExternalMcpTools,
  parseExternalMcpToolCallsFromText,
  resolveExternalMcpSendTurn,
} from './externalMcpTurnBridge';

const ORIGIN = 'https://mcp.example.test/mcp';
const SAFE_TOOLS = [{ name: 'search_works', description: 'Search OpenAlex works by title.' }];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('externalMcpTurnBridge', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('encodes https origins without `__` inside the origin key', () => {
    const encoded = encodeExternalMcpToolName(ORIGIN, 'search_works');
    expect(encoded).toBe('extmcp__https---mcp.example.test-mcp__search_works');
    expect(decodeExternalMcpToolName(encoded)).toEqual({
      originKey: 'https---mcp.example.test-mcp',
      toolName: 'search_works',
    });
  });

  it('builds a cache-only guide without fetching', async () => {
    await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools: SAFE_TOOLS });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const encoded = encodeExternalMcpToolName(ORIGIN, 'search_works');
    const guide = await buildExternalMcpToolCallGuide();
    expect(guide).toContain(encoded);
    expect(guide).toContain('Search OpenAlex works by title.');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('parses namespaced tool_call JSON against the enabled origin', async () => {
    await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools: SAFE_TOOLS });
    const encoded = encodeExternalMcpToolName(ORIGIN, 'search_works');
    const calls = await parseExternalMcpToolCallsFromText(
      JSON.stringify({ tool_call: { name: encoded, arguments: { q: 'jieyu' } } }),
    );
    expect(calls).toEqual([
      { name: encoded, origin: ORIGIN, toolName: 'search_works', arguments: { q: 'jieyu' } },
    ]);
  });

  it('executes tools/call over HTTP and audits agentRunId', async () => {
    await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools: SAFE_TOOLS });
    const encoded = encodeExternalMcpToolName(ORIGIN, 'search_works');
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      if (body.method === 'tools/list') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools: SAFE_TOOLS } });
      }
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: '{"count":1}' }] },
      });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const resolved = await resolveExternalMcpSendTurn({
        assistantContent: JSON.stringify({
          tool_call: { name: encoded, arguments: { q: 'jieyu' } },
        }),
        canApplySideEffects: true,
        agentRunId: 'run_b14_call',
      });
      expect(resolved.handled).toBe(true);
      if (!resolved.handled) return;
      expect(resolved.finalStatus).toBe('done');
      expect(JSON.parse(resolved.finalContent)).toMatchObject({
        external_mcp_tool_results: [expect.objectContaining({ ok: true })],
      });
      expect(JSON.parse(resolved.finalContent).truncated).toBeUndefined();
      expect(resolved.finalContent).not.toContain('evidencePackets');
      expect(fetchImpl).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }

    const db = await getDb();
    const audits = await db.collections.mcp_tool_call_audits.find().exec();
    expect(audits.some((row) => row.toJSON().agentRunId === 'run_b14_call')).toBe(true);
  });

  it('prefers leaving local-only JSON unhandled', async () => {
    const resolved = await resolveExternalMcpSendTurn({
      assistantContent: JSON.stringify({
        tool_call: { name: 'get_project_stats', arguments: {} },
      }),
      canApplySideEffects: true,
    });
    expect(resolved).toEqual({ handled: false });
  });

  it('offers at most five cached tools and skips second-model tools', async () => {
    const tools = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `search_${i}`, description: 'Search.' })),
      { name: 'answer_with_citations', description: 'Answer.' },
    ];
    await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools });
    const listed = await listRuntimeV2ExternalMcpTools();
    expect(listed).toHaveLength(5);
    expect(listed.map((tool) => tool.toolName)).toEqual([
      'search_0',
      'search_1',
      'search_2',
      'search_3',
      'search_4',
    ]);
    expect(
      externalMcpModelMessage({
        name: 'x',
        ok: false,
        reason: 'input_required',
        form: {
          origin: ORIGIN,
          toolName: 'search_works',
          arguments: {},
          requestState: 'opaque-state',
          requests: [
            {
              id: 'login',
              message: 'Please provide your GitHub username',
              fields: [{ name: 'name', required: true }],
            },
          ],
        },
      }),
    ).toBe('input_required');
  });

  it('returns a parseable truncation mark when model content exceeds 4000 characters', () => {
    const message = externalMcpModelMessage({
      name: 'x',
      ok: true,
      content: [{ type: 'text', text: 'a'.repeat(4_001) }],
    });
    expect(JSON.parse(message)).toEqual({ truncated: true });
    expect(externalMcpModelMessage({ name: 'x', ok: true, content: () => undefined })).toBe('ok');
  });

  it('returns evidence packet summaries whole when the quote is long', () => {
    const quote = 'q'.repeat(5_000);
    const message = externalMcpModelMessage({
      name: 'x',
      ok: true,
      evidencePackets: [
        {
          schemaVersion: 0,
          id: 'pkt-1',
          sourceType: 'document',
          sourceId: 'src-1',
          title: 'Work',
          page: '2',
          url: 'https://example.test/work',
          quote,
        },
      ],
    });
    expect(JSON.parse(message)).toEqual([
      {
        id: 'pkt-1',
        title: 'Work',
        page: '2',
        url: 'https://example.test/work',
        quote,
      },
    ]);
  });

  it('drops an oversized external result and marks the turn truncated', async () => {
    await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools: SAFE_TOOLS });
    const encoded = encodeExternalMcpToolName(ORIGIN, 'search_works');
    await withMcpFetch(
      SAFE_TOOLS,
      () => 'a'.repeat(9_000),
      async () => {
        const resolved = await resolveExternalMcpSendTurn({
          assistantContent: JSON.stringify({
            tool_call: { name: encoded, arguments: { q: 'jieyu' } },
          }),
          canApplySideEffects: true,
        });
        expect(resolved.handled).toBe(true);
        if (!resolved.handled) return;
        expect(resolved.finalStatus).toBe('done');
        expect(JSON.parse(resolved.finalContent)).toEqual({
          external_mcp_tool_results: [],
          truncated: true,
        });
      },
    );
  });

  it('keeps earlier complete results when a later external result does not fit', async () => {
    const tools = [
      { name: 'search_one', description: 'One.' },
      { name: 'search_two', description: 'Two.' },
    ];
    await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools });
    const first = encodeExternalMcpToolName(ORIGIN, 'search_one');
    const second = encodeExternalMcpToolName(ORIGIN, 'search_two');
    await withMcpFetch(
      tools,
      (toolName) => (toolName === 'search_one' ? 'one' : 'b'.repeat(9_000)),
      async () => {
        const resolved = await resolveExternalMcpSendTurn({
          assistantContent: JSON.stringify({
            tool_calls: [
              { name: first, arguments: {} },
              { name: second, arguments: {} },
            ],
          }),
          canApplySideEffects: true,
        });
        expect(resolved.handled).toBe(true);
        if (!resolved.handled) return;
        expect(resolved.finalStatus).toBe('done');
        const parsed = JSON.parse(resolved.finalContent) as {
          external_mcp_tool_results: Array<{ content?: Array<{ text?: string }> }>;
          truncated?: boolean;
        };
        expect(parsed.truncated).toBe(true);
        expect(parsed.external_mcp_tool_results).toHaveLength(1);
        expect(parsed.external_mcp_tool_results[0]?.content).toEqual([
          { type: 'text', text: 'one' },
        ]);
      },
    );
  });
});

async function withMcpFetch(
  tools: Array<{ name: string; description: string }>,
  textForTool: (toolName: string) => string,
  run: () => Promise<void>,
): Promise<void> {
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      id?: unknown;
      method?: string;
      params?: { name?: string };
    };
    if (body.method === 'tools/list') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools } });
    }
    return jsonResponse({
      jsonrpc: '2.0',
      id: body.id,
      result: { content: [{ type: 'text', text: textForTool(String(body.params?.name)) }] },
    });
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
