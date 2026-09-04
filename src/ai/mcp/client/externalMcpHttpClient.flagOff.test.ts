import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: true,
    aiExternalMcpHttpClientEnabled: false,
  },
}));

import { listExternalMcpToolsViaHttp } from './externalMcpHttpClient';

describe('externalMcpHttpClient flag off', () => {
  it('does not fetch when the HTTP client flag is off', async () => {
    const fetchImpl = vi.fn();
    const result = await listExternalMcpToolsViaHttp({
      origin: 'https://mcp.example.test/mcp',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: 'http_client_flag_off' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
