// @vitest-environment jsdom
/**
 * 第 5 批多文稿：新建 / 改名 / 切换 / 删除，当前文稿范围，层归属的中间件规则（T46 的服务层部分）。
 * Batch 5 multi-document: create / rename / switch / delete, current-document scope and the layer
 * ownership middleware rule (service-level part of T46).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type LayerDocType, type LayerUnitDocType } from '../db';
import { JieyuParentOwnershipMismatchError } from '../db/ownershipImmutabilityMiddleware';
import { markProjectCollaborationBound } from '../collaboration/cloud/collaborationLocalProjectRegistry';
import { LayerTierUnifiedService } from './LayerTierUnifiedService';
import {
  AnnotationDocumentCollaboratedProjectError,
  AnnotationDocumentLastDocumentError,
  AnnotationDocumentNotFoundError,
  canCreateAnnotationDocument,
  createAnnotationDocument,
  deleteAnnotationDocument,
  ensureDefaultAnnotationDocument,
  isLayerInCurrentDocument,
  listAnnotationDocuments,
  previewAnnotationDocumentReplace,
  readAnnotationDocumentScope,
  renameAnnotationDocument,
  switchAnnotationDocument,
} from './annotationDocumentService';

const A = 'text_b5_a';
const B = 'text_b5_b';
const NOW = '2026-10-09T08:00:00.000Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function layer(id: string, textId: string, documentId?: string): LayerDocType {
  return {
    id,
    textId,
    key: id,
    name: { eng: id },
    layerType: 'transcription',
    languageId: 'eng',
    modality: 'text',
    acceptsAudio: false,
    constraint: 'independent_boundary',
    sortOrder: 0,
    ...(documentId !== undefined ? { documentId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function unit(id: string, textId: string, layerId: string): LayerUnitDocType {
  return {
    id,
    textId,
    layerId,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function unitIds(textId: string): Promise<string[]> {
  return (await db.layer_units.where('textId').equals(textId).toArray()).map((u) => u.id).sort();
}

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
  for (const id of [A, B]) {
    await db.texts.put({ id, title: { default: id }, createdAt: NOW, updatedAt: NOW });
  }
});

/** 默认文稿 d1 带层 L1 / 单元 u1；新建 d2（成为当前）带层 L2 / 单元 u2 */
async function seedTwoDocuments(): Promise<{ d1: string; d2: string }> {
  const d1 = await ensureDefaultAnnotationDocument(A);
  // 旧写法留下的“没写 documentId”的层 | A layer written without a documentId
  await (await getDb()).collections.layers.insert(layer('L1', A));
  await db.layer_units.put(unit('u1', A, 'L1'));
  const d2 = await createAnnotationDocument(A, '  第二份  ');
  await LayerTierUnifiedService.createLayer(layer('L2', A));
  await db.layer_units.put(unit('u2', A, 'L2'));
  return { d1, d2 };
}

describe('Batch 5: create / switch keep layer ownership explicit', () => {
  it('create makes a new UUID document current and stamps unowned layers with the old default', async () => {
    const { d1, d2 } = await seedTwoDocuments();
    expect(d2).toMatch(UUID_RE);
    expect(d2).not.toBe(d1);
    expect((await db.texts.get(A))?.defaultDocumentId).toBe(d2);
    expect((await db.tier_definitions.get('L1'))?.documentId).toBe(d1);
    expect((await db.tier_definitions.get('L2'))?.documentId).toBe(d2);
    const docs = await listAnnotationDocuments(A);
    expect(docs.map((doc) => [doc.id, doc.isDefault])).toEqual([
      [d2, true],
      [d1, false],
    ]);
    expect(docs[0]?.title).toEqual({ und: '第二份' });
  });

  it('switch changes only the current document; scope follows it', async () => {
    const { d1, d2 } = await seedTwoDocuments();
    await switchAnnotationDocument(A, d1);
    const scope = await readAnnotationDocumentScope(await getDb(), A);
    expect(scope.defaultDocumentId).toBe(d1);
    expect(isLayerInCurrentDocument({ documentId: d1 }, scope)).toBe(true);
    expect(isLayerInCurrentDocument({ documentId: d2 }, scope)).toBe(false);
    // 没写归属、或指向本机没有的文稿：归当前文稿，不消失 | Unowned / unknown document: current document
    expect(isLayerInCurrentDocument({}, scope)).toBe(true);
    expect(isLayerInCurrentDocument({ documentId: 'remote-doc' }, scope)).toBe(true);
    expect((await db.annotation_documents.get(d1))?.isDefault).toBe(true);
    expect((await db.annotation_documents.get(d2))?.isDefault).toBe(false);
    expect(await unitIds(A)).toEqual(['u1', 'u2']);
  });

  it('switch / rename refuse a document of another project', async () => {
    await seedTwoDocuments();
    const foreign = await ensureDefaultAnnotationDocument(B);
    await expect(switchAnnotationDocument(A, foreign)).rejects.toBeInstanceOf(
      AnnotationDocumentNotFoundError,
    );
    await expect(renameAnnotationDocument(A, foreign, 'x')).rejects.toBeInstanceOf(
      AnnotationDocumentNotFoundError,
    );
    expect((await db.texts.get(B))?.defaultDocumentId).toBe(foreign);
  });

  it('rename only changes the title; an empty name clears it', async () => {
    const { d1 } = await seedTwoDocuments();
    await renameAnnotationDocument(A, d1, '访谈 A');
    expect((await db.annotation_documents.get(d1))?.title).toEqual({ und: '访谈 A' });
    await renameAnnotationDocument(A, d1, '   ');
    expect((await db.annotation_documents.get(d1))?.title).toBeUndefined();
    expect((await db.texts.get(A))?.defaultDocumentId).not.toBe(d1);
  });

  it('collaborated projects cannot add documents (D6)', async () => {
    await ensureDefaultAnnotationDocument(A);
    markProjectCollaborationBound(A);
    expect(canCreateAnnotationDocument(A)).toBe(false);
    await expect(createAnnotationDocument(A)).rejects.toBeInstanceOf(
      AnnotationDocumentCollaboratedProjectError,
    );
    expect(await db.annotation_documents.where('textId').equals(A).count()).toBe(1);
  });
});

describe('Batch 5 / T46: deleting one document leaves the other', () => {
  it('delete removes the document, its layers, links and units; the other document is untouched', async () => {
    const { d1, d2 } = await seedTwoDocuments();
    await db.layer_units.put(unit('u_b', B, 'L_b'));
    await db.layer_links.put({
      id: 'link-2',
      transcriptionLayerKey: 'L2',
      hostTranscriptionLayerId: 'L2',
      layerId: 'L2',
      linkType: 'free',
      isPreferred: true,
      createdAt: NOW,
    } as never);
    expect(await previewAnnotationDocumentReplace(A, d2)).toEqual({
      documentId: d2,
      unitCount: 1,
      layerCount: 1,
    });
    const result = await deleteAnnotationDocument(A, d2);
    expect(result.currentDocumentId).toBe(d1);
    expect(result.deletedUnitIds).toEqual(['u2']);
    expect(result.deletedLayerIds).toEqual(['L2']);
    expect(await unitIds(A)).toEqual(['u1']);
    expect(await unitIds(B)).toEqual(['u_b']);
    expect(await db.tier_definitions.get('L2')).toBeUndefined();
    expect(await db.tier_definitions.get('L1')).toBeDefined();
    expect(await db.layer_links.get('link-2')).toBeUndefined();
    expect(await db.annotation_documents.get(d2)).toBeUndefined();
    expect((await db.texts.get(A))?.defaultDocumentId).toBe(d1);
    expect((await db.annotation_documents.get(d1))?.isDefault).toBe(true);
  });

  it('deleting a non-current document keeps the current one', async () => {
    const { d1, d2 } = await seedTwoDocuments();
    const result = await deleteAnnotationDocument(A, d1);
    expect(result.currentDocumentId).toBe(d2);
    expect(await unitIds(A)).toEqual(['u2']);
    expect(await db.tier_definitions.get('L1')).toBeUndefined();
  });

  it('the last document cannot be deleted and nothing is written', async () => {
    const d1 = await ensureDefaultAnnotationDocument(A);
    await (await getDb()).collections.layers.insert(layer('L1', A));
    await db.layer_units.put(unit('u1', A, 'L1'));
    await expect(deleteAnnotationDocument(A, d1)).rejects.toBeInstanceOf(
      AnnotationDocumentLastDocumentError,
    );
    expect(await unitIds(A)).toEqual(['u1']);
    // 失败的事务连层归属的补写也一起回滚 | The failed transaction rolls back the stamping too
    expect((await db.tier_definitions.get('L1'))?.documentId).toBeUndefined();
  });
});

describe('Batch 5: ownership middleware checks a layer document', () => {
  it('a layer cannot point at another project document', async () => {
    await ensureDefaultAnnotationDocument(A);
    const foreign = await ensureDefaultAnnotationDocument(B);
    await expect(
      (await getDb()).collections.layers.insert(layer('L_bad', A, foreign)),
    ).rejects.toThrow(JieyuParentOwnershipMismatchError);
    await expect(
      LayerTierUnifiedService.createLayer(layer('L_bad2', A, foreign)),
    ).rejects.toThrow();
    expect(await db.tier_definitions.get('L_bad')).toBeUndefined();
    expect(await db.tier_definitions.get('L_bad2')).toBeUndefined();
  });
});
