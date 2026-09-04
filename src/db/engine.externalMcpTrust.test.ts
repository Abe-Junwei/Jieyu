// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDb,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
  resetJieyuDatabaseSingletonForTests,
} from './engine';

describe('external_mcp_trust Dexie table (v51)', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  afterEach(async () => {
    // no-op
  });

  it('schema version is 51 and persists a trust row', async () => {
    const jieyuDb = await getDb();
    expect(JIEYU_DEXIE_TARGET_SCHEMA_VERSION).toBe(51);
    expect(jieyuDb.dexie.verno).toBeGreaterThanOrEqual(51);

    await jieyuDb.collections.external_mcp_trust.insert({
      id: 'https://mcp.example.test',
      origin: 'https://mcp.example.test',
      enabled: true,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    });

    const retrieved = await jieyuDb.collections.external_mcp_trust
      .findOne({ selector: { id: 'https://mcp.example.test' } })
      .exec();
    expect(retrieved?.toJSON()).toMatchObject({
      origin: 'https://mcp.example.test',
      enabled: true,
    });
  });
});
