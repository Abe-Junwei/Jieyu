/**
 * 第 5 批：一个项目有两份标注文稿时，JYT / JYM / JYB 往返都保住每份文稿、它的层和单元、当前文稿。
 * Batch 5: with two annotation documents in a project, JYT / JYM / JYB round trips keep every document,
 * its layers and units, and the current document.
 */
import 'fake-indexeddb/auto';
import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportProjectToJyt, overwriteProjectWithJyt, restoreJytAsNewProject } from './JytService';
import { exportProjectToJym, restoreJymAsNewProject } from './JymService';
import { disasterRestoreFromJyb, exportDatabaseToJyb, importJybProjectsAsNew } from './JybService';

const NOW = '2026-10-09T01:00:00.000Z';
const LATER = '2026-10-09T02:00:00.000Z';
const P = 'pDocs';

async function seedDocument(doc: string, isDefault: boolean, createdAt: string): Promise<void> {
  const layer = `${doc}-layer`;
  const unit = `${doc}-unit`;
  await db.annotation_documents.put({
    id: doc,
    textId: P,
    isDefault,
    title: { und: `title ${doc}` },
    createdAt,
    updatedAt: createdAt,
  });
  await db.tier_definitions.put({
    id: layer,
    textId: P,
    documentId: doc,
    key: `bridge_trc_${doc}`,
    name: { default: `Transcription ${doc}` },
    tierType: 'time-aligned',
    contentType: 'transcription',
    languageId: 'und',
    createdAt,
    updatedAt: createdAt,
  } as never);
  await db.layer_units.put({
    id: unit,
    textId: P,
    mediaId: `${P}-media`,
    layerId: layer,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt,
    updatedAt: createdAt,
  } as never);
  await db.layer_unit_contents.put({
    id: `${doc}-content`,
    textId: P,
    unitId: unit,
    layerId: layer,
    contentRole: 'primary_text',
    modality: 'text',
    text: `text of ${doc}`,
    sourceType: 'human',
    createdAt,
    updatedAt: createdAt,
  } as never);
}

/** d1（最早）与 d2（当前）| d1 (oldest) and d2 (current) */
async function seedTwoDocumentProject(): Promise<void> {
  await db.texts.put({
    id: P,
    title: { default: 'Two documents' },
    defaultDocumentId: 'd2',
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.media_items.put({
    id: `${P}-media`,
    textId: P,
    filename: 'field.wav',
    isOfflineCached: false,
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
    createdAt: NOW,
  });
  await seedDocument('d1', false, NOW);
  await seedDocument('d2', true, LATER);
}

/** 读出某项目的文稿结构：按标题对应层和单元文本 | Document shape of a project keyed by title */
async function documentShape(projectId: string) {
  const text = await db.texts.get(projectId);
  const docs = await db.annotation_documents.where('textId').equals(projectId).toArray();
  const tiers = await db.tier_definitions.where('textId').equals(projectId).toArray();
  const units = await db.layer_units.where('textId').equals(projectId).toArray();
  const contents = await db.layer_unit_contents.where('textId').equals(projectId).toArray();
  const shape = docs
    .map((doc) => {
      const layerIds = tiers.filter((t) => t.documentId === doc.id).map((t) => t.id);
      const unitIds = units
        .filter((u) => u.layerId && layerIds.includes(u.layerId))
        .map((u) => u.id);
      return {
        title: doc.title?.['und'],
        isDefault: doc.isDefault,
        isCurrent: text?.defaultDocumentId === doc.id,
        layerCount: layerIds.length,
        texts: contents.filter((c) => c.unitId && unitIds.includes(c.unitId)).map((c) => c.text),
      };
    })
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return { shape, docIds: docs.map((d) => d.id) };
}

const EXPECTED_SHAPE = [
  { title: 'title d1', isDefault: false, isCurrent: false, layerCount: 1, texts: ['text of d1'] },
  { title: 'title d2', isDefault: true, isCurrent: true, layerCount: 1, texts: ['text of d2'] },
];

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await seedTwoDocumentProject();
});

describe('batch 5: packages carry multiple annotation documents', () => {
  it('JYT manifest lists both documents with their layers', async () => {
    const files = unzipSync(await exportProjectToJyt(P));
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!));
    expect(manifest.projects[0]).toMatchObject({ id: P, defaultDocumentId: 'd2' });
    expect(
      [...manifest.projects[0].documents].sort(
        (a: { documentId: string }, b: { documentId: string }) =>
          a.documentId.localeCompare(b.documentId),
      ),
    ).toEqual([
      expect.objectContaining({ documentId: 'd1', isDefault: false, layerIds: ['d1-layer'] }),
      expect.objectContaining({ documentId: 'd2', isDefault: true, layerIds: ['d2-layer'] }),
    ]);
  });

  it('JYT and JYM restore as new: fresh document ids, layers follow, current document kept', async () => {
    for (const restored of [
      await restoreJytAsNewProject(await exportProjectToJyt(P)),
      await restoreJymAsNewProject(await exportProjectToJym(P)),
    ]) {
      const { shape, docIds } = await documentShape(restored.projectId);
      expect(shape).toEqual(EXPECTED_SHAPE);
      expect(docIds).not.toContain('d1');
      expect(docIds).not.toContain('d2');
    }
    // 原项目不动 | Source project untouched
    expect((await documentShape(P)).shape).toEqual(EXPECTED_SHAPE);
  });

  it('JYT overwrite brings back both documents after one was deleted locally', async () => {
    const archive = await exportProjectToJyt(P);
    await db.layer_unit_contents.delete('d1-content');
    await db.layer_units.delete('d1-unit');
    await db.tier_definitions.delete('d1-layer');
    await db.annotation_documents.delete('d1');
    await overwriteProjectWithJyt(archive, { targetProjectId: P });
    const { shape, docIds } = await documentShape(P);
    expect(shape).toEqual(EXPECTED_SHAPE);
    expect(docIds.sort()).toEqual(['d1', 'd2']);
  });

  it('JYB per-project import and disaster restore keep both documents', async () => {
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    const imported = await importJybProjectsAsNew(archive);
    expect((await documentShape(imported.projects[0]!.projectId)).shape).toEqual(EXPECTED_SHAPE);

    await disasterRestoreFromJyb(archive);
    expect((await db.texts.toArray()).map((t) => t.id)).toEqual([P]);
    const { shape, docIds } = await documentShape(P);
    expect(shape).toEqual(EXPECTED_SHAPE);
    expect(docIds.sort()).toEqual(['d1', 'd2']);
  });
});
