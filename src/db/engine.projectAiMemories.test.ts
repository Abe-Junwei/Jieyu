// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from './engine';

describe('project_ai_memories Dexie table (v47)', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  afterEach(async () => {
    // no-op
  });

  it('can insert and retrieve a memory doc', async () => {
    const doc = {
      id: 'mem-001',
      projectId: 'proj-001',
      fact: 'This language has 5 vowels.',
      confidence: 0.9,
      sourceConversationId: 'conv-001',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const jieyuDb = await getDb();
    await jieyuDb.collections.project_ai_memories.insert(doc);
    const retrieved = await jieyuDb.collections.project_ai_memories.findOne({ selector: { id: 'mem-001' } }).exec();

    expect(retrieved).not.toBeNull();
    expect(retrieved!.toJSON().fact).toBe('This language has 5 vowels.');
    expect(retrieved!.toJSON().projectId).toBe('proj-001');
  });

  it('can query by projectId index', async () => {
    const docs = [
      { id: 'mem-001', projectId: 'proj-a', fact: 'A', confidence: 0.8, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'mem-002', projectId: 'proj-a', fact: 'B', confidence: 0.7, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'mem-003', projectId: 'proj-b', fact: 'C', confidence: 0.9, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];

    const jieyuDb = await getDb();
    for (const doc of docs) {
      await jieyuDb.collections.project_ai_memories.insert(doc);
    }

    const results = await jieyuDb.collections.project_ai_memories.findByIndex('projectId', 'proj-a');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.fact).sort()).toEqual(['A', 'B']);
  });

  it('can update a memory doc', async () => {
    const doc = {
      id: 'mem-004',
      projectId: 'proj-001',
      fact: 'Original fact.',
      confidence: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const jieyuDb = await getDb();
    await jieyuDb.collections.project_ai_memories.insert(doc);
    await jieyuDb.collections.project_ai_memories.update('mem-004', { fact: 'Updated fact.', confidence: 0.95 });

    const retrieved = await jieyuDb.collections.project_ai_memories.findOne({ selector: { id: 'mem-004' } }).exec();
    expect(retrieved!.toJSON().fact).toBe('Updated fact.');
    expect(retrieved!.toJSON().confidence).toBe(0.95);
  });

  it('can delete a memory doc', async () => {
    const doc = {
      id: 'mem-005',
      projectId: 'proj-001',
      fact: 'To be deleted.',
      confidence: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const jieyuDb = await getDb();
    await jieyuDb.collections.project_ai_memories.insert(doc);
    await jieyuDb.collections.project_ai_memories.remove('mem-005');

    const retrieved = await jieyuDb.collections.project_ai_memories.findOne({ selector: { id: 'mem-005' } }).exec();
    expect(retrieved).toBeNull();
  });

  it('schema version is at least 47', async () => {
    const jieyuDb = await getDb();
    expect(jieyuDb.dexie.verno).toBeGreaterThanOrEqual(47);
  });
});
