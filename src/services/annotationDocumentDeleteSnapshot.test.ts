// @vitest-environment jsdom
/**
 * 第 5 批：删除标注文稿前先存一份核对过的项目快照；快照失败就不删；从快照恢复能把文稿找回来。
 * Batch 5: a verified project snapshot is saved before a document is deleted; a failed snapshot aborts
 * the delete; restoring the snapshot brings the document back.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, type LayerDocType } from '../db';

const flags = vi.hoisted(() => ({ failSnapshot: false }));

vi.mock('../db/projectOverwriteSnapshotStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/projectOverwriteSnapshotStore')>();
  return {
    ...actual,
    saveProjectOverwriteSnapshot: (
      input: Parameters<typeof actual.saveProjectOverwriteSnapshot>[0],
    ) =>
      flags.failSnapshot
        ? Promise.reject(new Error('QuotaExceededError'))
        : actual.saveProjectOverwriteSnapshot(input),
  };
});

const { listProjectOverwriteSnapshots } = await import('../db/projectOverwriteSnapshotStore');
const {
  AnnotationDocumentLastDocumentError,
  AnnotationDocumentSnapshotFailedError,
  createAnnotationDocument,
  deleteAnnotationDocument,
  ensureDefaultAnnotationDocument,
} = await import('./annotationDocumentService');
const { restoreOverwriteSnapshot } = await import('./overwriteSnapshotRestoreService');

const P = 'text_b5_snapshot';
const NOW = '2026-10-09T08:00:00.000Z';

function layer(id: string): LayerDocType {
  return {
    id,
    textId: P,
    key: id,
    name: { eng: id },
    layerType: 'transcription',
    languageId: 'eng',
    modality: 'text',
    acceptsAudio: false,
    constraint: 'independent_boundary',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function seed(): Promise<{ d1: string; d2: string }> {
  const d1 = await ensureDefaultAnnotationDocument(P);
  const jdb = await getDb();
  await jdb.collections.layers.insert(layer('L1'));
  const d2 = await createAnnotationDocument(P, 'two');
  await jdb.collections.layers.insert(layer('L2'));
  await db.layer_units.put({
    id: 'u2',
    textId: P,
    layerId: 'L2',
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  return { d1, d2 };
}

beforeEach(async () => {
  flags.failSnapshot = false;
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({ id: P, title: { default: P }, createdAt: NOW, updatedAt: NOW });
});

describe('Batch 5: pre-delete snapshot', () => {
  it('saves a document-delete snapshot first; restoring it brings the document back', async () => {
    const { d1, d2 } = await seed();
    const before = (await listProjectOverwriteSnapshots(P)).length;
    const result = await deleteAnnotationDocument(P, d2);
    const snapshots = await listProjectOverwriteSnapshots(P);
    expect(snapshots).toHaveLength(Math.min(before + 1, 3));
    expect(snapshots[0]).toMatchObject({ seq: result.snapshotSeq, packageKind: 'document-delete' });
    expect(snapshots[0]!.snapshotJson).toContain(d2);
    expect(await db.annotation_documents.get(d2)).toBeUndefined();

    await restoreOverwriteSnapshot(result.snapshotSeq);
    expect(await db.annotation_documents.get(d2)).toBeDefined();
    expect(await db.tier_definitions.get('L2')).toBeDefined();
    expect(await db.layer_units.get('u2')).toBeDefined();
    expect((await db.texts.get(P))?.defaultDocumentId).toBe(d2);
    expect(await db.annotation_documents.get(d1)).toBeDefined();
  });

  it('a failed snapshot aborts the delete and changes nothing', async () => {
    const { d2 } = await seed();
    flags.failSnapshot = true;
    await expect(deleteAnnotationDocument(P, d2)).rejects.toBeInstanceOf(
      AnnotationDocumentSnapshotFailedError,
    );
    expect(await db.annotation_documents.get(d2)).toBeDefined();
    expect(await db.tier_definitions.get('L2')).toBeDefined();
    expect(await db.layer_units.get('u2')).toBeDefined();
    expect((await db.texts.get(P))?.defaultDocumentId).toBe(d2);
  });

  it('a delete refused up front (last document) leaves no snapshot', async () => {
    const d1 = await ensureDefaultAnnotationDocument(P);
    const before = (await listProjectOverwriteSnapshots(P)).length;
    await expect(deleteAnnotationDocument(P, d1)).rejects.toBeInstanceOf(
      AnnotationDocumentLastDocumentError,
    );
    expect(await listProjectOverwriteSnapshots(P)).toHaveLength(before);
  });
});
