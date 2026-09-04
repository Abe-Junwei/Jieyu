// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: true,
    aiExternalMcpHttpClientEnabled: true,
    aiExternalMcpSendTurnEnabled: false,
  },
}));

import { buildExternalMcpToolCallGuide, resolveExternalMcpSendTurn } from './externalMcpTurnBridge';

describe('externalMcpTurnBridge flag off', () => {
  it('returns an empty guide and does not handle send-turn', async () => {
    const fetchImpl = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      expect(await buildExternalMcpToolCallGuide()).toBe('');
      const resolved = await resolveExternalMcpSendTurn({
        assistantContent: JSON.stringify({
          tool_call: {
            name: 'extmcp__https_mcp.example.test_mcp__search_works',
            arguments: {},
          },
        }),
        canApplySideEffects: true,
      });
      expect(resolved).toEqual({ handled: false });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
