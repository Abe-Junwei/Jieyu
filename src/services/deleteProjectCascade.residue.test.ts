/**
 * 删除项目（真实主库，写入校验与归属中间件都在）：探针里复现过的残留（layer_links、
 * project_ai_memories、项目备注）现在都被删除，另一个项目不受影响（rev5 N6，T21）。
 * Delete project on the real main DB (write validation and ownership middleware on): the leftovers
 * the probe reproduced (layer_links, project_ai_memories, project notes) are gone, and another
 * project is untouched (rev5 N6, T21).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { deleteProjectCascade } from './LinguisticService.cleanup';

const NOW = '2026-10-09T00:00:00.000Z';

async function seedProject(p: string): Promise<void> {
  await db.texts.put({ id: p, title: { default: p }, createdAt: NOW, updatedAt: NOW });
  await db.tier_definitions.put({
    id: `${p}-tier`,
    textId: p,
    key: `${p}-k`,
    name: { default: 'T' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.layer_links.put({
    id: `${p}-ll`,
    layerId: `${p}-tier`,
    transcriptionLayerKey: `${p}-k`,
    hostTranscriptionLayerId: `${p}-tier`,
    linkType: 'free',
    isPreferred: true,
    createdAt: NOW,
  });
  await db.project_ai_memories.put({
    id: `${p}-mem`,
    projectId: p,
    fact: 'f',
    confidence: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.user_notes.put({
    id: `${p}-note`,
    targetType: 'text',
    targetId: p,
    content: { default: 'x' },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await seedProject('pA');
  await seedProject('pB');
});

describe('deleteProjectCascade (real DB)', () => {
  it('removes the reproduced leftovers and keeps the other project', async () => {
    await deleteProjectCascade('pA');
    const ids = async (table: { toArray(): Promise<Array<{ id: string }>> }) =>
      (await table.toArray()).map((row) => row.id).sort();
    expect(await ids(db.texts)).toEqual(['pB']);
    expect(await ids(db.tier_definitions)).toEqual(['pB-tier']);
    expect(await ids(db.layer_links)).toEqual(['pB-ll']);
    expect(await ids(db.project_ai_memories)).toEqual(['pB-mem']);
    expect(await ids(db.user_notes)).toEqual(['pB-note']);
  });
});
