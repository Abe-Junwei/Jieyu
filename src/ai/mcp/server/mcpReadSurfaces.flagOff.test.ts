import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: { aiMcpResourcesArtifactsEnabled: false },
}));

import { handleMcpReadSurface } from './mcpReadSurfaces';

describe('mcpReadSurfaces flag off', () => {
  it('returns Method not found for resources and prompts', async () => {
    const listed = await handleMcpReadSurface({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(listed).toEqual({
      ok: false,
      code: -32601,
      message: 'Method not found: resources/list',
    });
  });
});
