// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: { aiMcpResourcesArtifactsEnabled: true },
}));

import { getDb, resetJieyuDatabaseSingletonForTests } from '../../../db';
import { handleMcpReadSurface, sourceSetResourceUri } from './mcpReadSurfaces';
import { listVerticalWorkflowsV0 } from '../../vertical/verticalWorkflowRegistry';

describe('mcpReadSurfaces flag on', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('lists and reads an active CorpusSourceSet snapshot by URI', async () => {
    const db = await getDb();
    await db.collections.ai_source_sets.insert({
      id: 'set_mcp_1',
      name: 'Field notes',
      scope: 'selection',
      members: [{ id: 'seg_1', type: 'segment' }],
      status: 'active',
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    });

    const listed = await handleMcpReadSurface({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const resources = (listed.result as { resources: Array<{ uri: string }> }).resources;
    expect(resources).toEqual(
      expect.arrayContaining([
        {
          uri: sourceSetResourceUri('set_mcp_1'),
          name: 'Field notes',
          description: expect.any(String),
          mimeType: 'application/json',
        },
      ]),
    );

    const read = await handleMcpReadSurface({
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/read',
      params: { uri: sourceSetResourceUri('set_mcp_1') },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const contents = (read.result as { contents: Array<{ text: string }> }).contents;
    expect(JSON.parse(contents[0]!.text)).toMatchObject({ id: 'set_mcp_1', name: 'Field notes' });
  });

  it('lists vertical workflow prompts from the A12 registry', async () => {
    const listed = await handleMcpReadSurface({
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/list',
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const names = (listed.result as { prompts: Array<{ name: string }> }).prompts.map(
      (p) => p.name,
    );
    const registryIds = listVerticalWorkflowsV0().map((w) => w.id);
    expect(names.sort()).toEqual([...registryIds].sort());

    const got = await handleMcpReadSurface({
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/get',
      params: { name: 'segment_qa' },
    });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const messages = (got.result as { messages: Array<{ content: { text: string } }> }).messages;
    expect(messages[0]?.content.text).toContain('segment_qa');
  });
});
