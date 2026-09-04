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
  encodeExternalMcpToolName,
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
      expect(resolved.finalContent).toContain('count');
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
});
