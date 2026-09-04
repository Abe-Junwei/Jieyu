// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { createAdoptionItem } from './adoptionQueue';
import {
  attachArtifactId,
  buildB5bExportManifest,
  getAgentArtifact,
  persistAgentArtifact,
} from './agentArtifact';

describe('agentArtifact', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('persists an artifact, links adoption ids, and builds a B5b export manifest', async () => {
    const stored = await persistAgentArtifact({
      kind: 'source_set_snapshot',
      uri: 'jieyu://source-set/set_art_1',
      title: 'Snapshot',
      body: { id: 'set_art_1' },
      agentRunId: 'run_b12_1',
    });

    const reloaded = await getAgentArtifact(stored.id);
    expect(reloaded).toMatchObject({
      id: stored.id,
      uri: 'jieyu://source-set/set_art_1',
      kind: 'source_set_snapshot',
      agentRunId: 'run_b12_1',
    });
    expect(JSON.parse(reloaded!.bodyJson)).toEqual({ id: 'set_art_1' });

    const db = await getDb();
    const audits = await db.collections.audit_logs.find().exec();
    expect(audits.some((row) => row.toJSON().field === 'agent_artifact')).toBe(true);

    const item = attachArtifactId(
      createAdoptionItem({
        workflowId: 'segment_qa',
        requestId: 'req-art-1',
        summary: 'qa',
        evidencePacketIds: ['ep-1'],
      }),
      stored.id,
    );
    expect(item.artifactIds).toEqual([stored.id]);

    expect(buildB5bExportManifest([stored])).toEqual({
      schemaVersion: 1,
      items: [
        {
          artifactId: stored.id,
          uri: stored.uri,
          title: stored.title,
          kind: stored.kind,
        },
      ],
    });
  });
});
