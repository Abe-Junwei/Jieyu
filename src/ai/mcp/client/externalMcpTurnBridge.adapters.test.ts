// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: true,
    aiExternalMcpHttpClientEnabled: true,
    aiExternalMcpSendTurnEnabled: true,
    aiExternalMcpProviderAdaptersEnabled: true,
    aiSemanticGuardEnabled: true,
  },
}));

import { resetJieyuDatabaseSingletonForTests } from '../../../db';
import { setExternalMcpTrustEnabled } from './externalMcpTrustRegistry';
import { encodeExternalMcpToolName, resolveExternalMcpSendTurn } from './externalMcpTurnBridge';

const ORIGIN = 'https://mcp.example.test/mcp';
const SAFE_TOOLS = [{ name: 'search_works', description: 'Search OpenAlex works by title.' }];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('externalMcpTurnBridge provider adapters', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('attaches document evidencePackets when the adapter flag is on', async () => {
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
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results: [{ id: 'https://openalex.org/W123', display_name: 'Jieyu' }],
              }),
            },
          ],
        },
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
      });
      expect(resolved.handled).toBe(true);
      if (!resolved.handled) return;
      expect(resolved.finalStatus).toBe('done');
      const parsed = JSON.parse(resolved.finalContent) as {
        external_mcp_tool_results: Array<{ evidencePackets?: Array<{ sourceType: string }> }>;
      };
      expect(parsed.external_mcp_tool_results[0]?.evidencePackets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceType: 'document',
            sourceId: 'https://openalex.org/W123',
            reasonCode: 'external_mcp_openalex',
          }),
        ]),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
