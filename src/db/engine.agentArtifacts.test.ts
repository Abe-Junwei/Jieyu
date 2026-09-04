// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDb,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
  resetJieyuDatabaseSingletonForTests,
} from './engine';

describe('agent_artifacts Dexie table (v52)', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('schema version is 52 and persists an artifact row', async () => {
    const jieyuDb = await getDb();
    expect(JIEYU_DEXIE_TARGET_SCHEMA_VERSION).toBe(52);
    expect(jieyuDb.dexie.verno).toBeGreaterThanOrEqual(52);

    await jieyuDb.collections.agent_artifacts.insert({
      id: 'art_test_1',
      schemaVersion: 0,
      kind: 'source_set_snapshot',
      uri: 'jieyu://source-set/set_1',
      title: 'Set 1',
      mimeType: 'application/json',
      bodyJson: '{}',
      createdAt: '2026-09-04T00:00:00.000Z',
    });

    const retrieved = await jieyuDb.collections.agent_artifacts
      .findOne({ selector: { id: 'art_test_1' } })
      .exec();
    expect(retrieved?.toJSON()).toMatchObject({
      uri: 'jieyu://source-set/set_1',
      kind: 'source_set_snapshot',
    });
  });
});
