// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { getDb } from './engine';
import type { AiSourceSetDoc } from './types';

describe('ai_source_sets DB operations', () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.collections.ai_source_sets.removeBySelector({});
  });

  it('inserts and retrieves a source set', async () => {
    const db = await getDb();
    const doc: AiSourceSetDoc = {
      id: 'set_test_001',
      name: 'Test Set',
      scope: 'selection',
      members: [
        { id: 'seg_1', type: 'segment', label: 'Segment A' },
        { id: 'seg_2', type: 'segment' },
      ],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const inserted = await db.collections.ai_source_sets.insert(doc);
    expect(inserted.id).toBe('set_test_001');
    expect(inserted.name).toBe('Test Set');

    const rows = await db.collections.ai_source_sets.find().exec();
    expect(rows.length).toBe(1);
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first!.toJSON().members).toHaveLength(2);
  });

  it('updates a source set', async () => {
    const db = await getDb();
    const doc: AiSourceSetDoc = {
      id: 'set_test_002',
      name: 'Original',
      scope: 'project',
      members: [],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collections.ai_source_sets.insert(doc);
    await db.collections.ai_source_sets.update('set_test_002', {
      name: 'Updated',
      members: [{ id: 'doc_1', type: 'document' }],
    });

    const rows = await db.collections.ai_source_sets.find().exec();
    expect(rows.length).toBe(1);
    const updated = rows[0];
    expect(updated).toBeDefined();
    expect(updated!.toJSON().name).toBe('Updated');
    expect(updated!.toJSON().members).toHaveLength(1);
  });

  it('removes a source set', async () => {
    const db = await getDb();
    const doc: AiSourceSetDoc = {
      id: 'set_test_003',
      name: 'To Remove',
      scope: 'selection',
      members: [],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collections.ai_source_sets.insert(doc);
    await db.collections.ai_source_sets.remove('set_test_003');

    const rows = await db.collections.ai_source_sets.find().exec();
    expect(rows.length).toBe(0);
  });

  it('filters by status index', async () => {
    const db = await getDb();
    const active: AiSourceSetDoc = {
      id: 'set_active',
      name: 'Active',
      scope: 'selection',
      members: [],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const invalidated: AiSourceSetDoc = {
      id: 'set_invalidated',
      name: 'Invalidated',
      scope: 'selection',
      members: [],
      status: 'invalidated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invalidationReason: 'test',
    };

    await db.collections.ai_source_sets.insert(active);
    await db.collections.ai_source_sets.insert(invalidated);

    const activeRows = await db.collections.ai_source_sets.findByIndex('status', 'active');
    expect(activeRows.length).toBe(1);
    const activeRow = activeRows[0];
    expect(activeRow).toBeDefined();
    expect(activeRow!.id).toBe('set_active');
  });

  it('persists and retrieves invalidated status with reason', async () => {
    const db = await getDb();
    const doc: AiSourceSetDoc = {
      id: 'set_pruned',
      name: 'Pruned Set',
      scope: 'selection',
      members: [{ id: 'gone', type: 'segment' }],
      status: 'invalidated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invalidationReason: 'segment gone',
    };

    await db.collections.ai_source_sets.insert(doc);
    const invalidatedRows = await db.collections.ai_source_sets.findByIndex('status', 'invalidated');
    expect(invalidatedRows.length).toBe(1);
    const row = invalidatedRows[0];
    expect(row).toBeDefined();
    expect(row!.toJSON().status).toBe('invalidated');
    expect(row!.toJSON().invalidationReason).toBe('segment gone');
  });
});
