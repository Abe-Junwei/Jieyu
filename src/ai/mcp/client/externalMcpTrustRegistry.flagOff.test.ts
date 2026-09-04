// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: false,
    aiSemanticGuardEnabled: true,
  },
}));

import { getDb, resetJieyuDatabaseSingletonForTests } from '../../../db';
import {
  exposeExternalMcpToolsToLlm,
  setExternalMcpTrustEnabled,
} from './externalMcpTrustRegistry';

const SAFE_TOOLS = [{ name: 'search_works', description: 'Search OpenAlex works by title.' }];

describe('externalMcpTrustRegistry flag off', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('never exposes tools when the B11 flag is off', async () => {
    const enabled = await setExternalMcpTrustEnabled({
      origin: 'https://mcp.example.test',
      enabled: true,
      tools: SAFE_TOOLS,
    });
    expect(enabled.ok).toBe(true);

    const db = await getDb();
    const stored = await db.collections.external_mcp_trust
      .findOne({ selector: { id: 'https://mcp.example.test' } })
      .exec();
    expect(stored?.toJSON().enabled).toBe(true);

    const exposed = await exposeExternalMcpToolsToLlm({
      origin: 'https://mcp.example.test',
      tools: SAFE_TOOLS,
    });
    expect(exposed).toEqual({ allowed: false, reason: 'flag_off' });
  });
});
