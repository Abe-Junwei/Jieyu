// @vitest-environment jsdom
/**
 * 第 5 批：工作台之外的读取（按项目列层 / 单元、AI 默认转写层）只看当前文稿；项目统计与首页按全项目；
 * 词库引用用 `allDocuments` 看全部文稿。
 * Batch 5: reads outside the workbench (per-project layer / unit lists, project statistics, the AI
 * default transcription layer) cover the current document only; lexicon citations use `allDocuments`.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type LayerDocType, type LayerUnitDocType } from '../db';
import { isDefaultTranscriptionLayerForUnitText } from '../ai/embeddings/EmbeddingInvalidationService';
import { LayerTierUnifiedService } from './LayerTierUnifiedService';
import { LinguisticService } from './LinguisticService';
import { WorkspaceReadModelService } from './WorkspaceReadModelService';
import { loadHomeProjectProgressBundle } from '../utils/homeTranscriptionRecordProgress';
import { resolveDefaultTranscriptionLayerIdsPerDocument } from './LayerSegmentGraphService';
import {
  createAnnotationDocument,
  ensureDefaultAnnotationDocument,
  keepCurrentDocumentRows,
  readOtherDocumentLayerIds,
  switchAnnotationDocument,
} from './annotationDocumentService';

const A = 'text_b5_scope';
const NOW = '2026-10-09T08:00:00.000Z';

function layer(id: string): LayerDocType {
  return {
    id,
    textId: A,
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

function unit(id: string, layerId: string): LayerUnitDocType {
  return {
    id,
    textId: A,
    layerId,
    mediaId: 'm1',
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({ id: A, title: { default: A }, createdAt: NOW, updatedAt: NOW });
});

/** 文稿 d1：层 L1 / 单元 u1；文稿 d2（当前）：层 L2 / 单元 u2 */
async function seedTwoDocuments(): Promise<{ d1: string; d2: string }> {
  const d1 = await ensureDefaultAnnotationDocument(A);
  await LayerTierUnifiedService.createLayer(layer('L1'));
  await db.layer_units.put(unit('u1', 'L1'));
  const d2 = await createAnnotationDocument(A);
  await LayerTierUnifiedService.createLayer(layer('L2'));
  await db.layer_units.put(unit('u2', 'L2'));
  return { d1, d2 };
}

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id).sort();

describe('Batch 5: reads outside the workbench follow the current document', () => {
  it('per-project layer / unit lists show the current document; allDocuments shows all', async () => {
    const { d1 } = await seedTwoDocuments();
    expect([...(await readOtherDocumentLayerIds(await getDb(), A))]).toEqual(['L1']);
    expect(ids(await LinguisticService.layers.listByTextId(A))).toEqual(['L2']);
    expect(ids(await LinguisticService.units.listByTextId(A))).toEqual(['u2']);
    expect(ids(await LinguisticService.layers.listByTextId(A, { allDocuments: true }))).toEqual([
      'L1',
      'L2',
    ]);
    expect(ids(await LinguisticService.units.listByTextId(A, { allDocuments: true }))).toEqual([
      'u1',
      'u2',
    ]);
    await switchAnnotationDocument(A, d1);
    expect(ids(await LinguisticService.layers.listByTextId(A))).toEqual(['L1']);
    expect(ids(await LinguisticService.units.listByTextId(A))).toEqual(['u1']);
  });

  it('a single-document project lists everything', async () => {
    await ensureDefaultAnnotationDocument(A);
    await LayerTierUnifiedService.createLayer(layer('L1'));
    await db.layer_units.put(unit('u1', 'L1'));
    expect(ids(await LinguisticService.layers.listByTextId(A))).toEqual(['L1']);
    expect(ids(await LinguisticService.units.listByTextId(A))).toEqual(['u1']);
  });

  it('project statistics count the whole project (all documents)', async () => {
    await seedTwoDocuments();
    await WorkspaceReadModelService.rebuildForText(A);
    const stats = await db.scope_stats_snapshots.where('textId').equals(A).toArray();
    expect(stats.find((row) => row.scopeType === 'project')?.unitCount).toBe(2);
    expect(
      stats
        .filter((row) => row.scopeType === 'layer')
        .map((row) => row.layerId)
        .sort(),
    ).toEqual(['L1', 'L2']);
  });

  it('AI segment_meta rows keep the current document only; other projects pass through', async () => {
    await seedTwoDocuments();
    const rows = [
      { textId: A, layerId: 'L1', id: 'a' },
      { textId: A, layerId: 'L2', id: 'b' },
      { textId: 'text_other_project', layerId: 'L9', id: 'c' },
    ];
    expect(ids(await keepCurrentDocumentRows(rows))).toEqual(['b', 'c']);
    expect(await keepCurrentDocumentRows([])).toEqual([]);
  });

  it('home statistics cover every document and say so when the project has several', async () => {
    await ensureDefaultAnnotationDocument(A);
    await LayerTierUnifiedService.createLayer(layer('L1'));
    const text = (await db.texts.get(A))!;
    expect((await loadHomeProjectProgressBundle(text, 'zh-CN')).documentCount).toBeUndefined();
    await createAnnotationDocument(A);
    await LayerTierUnifiedService.createLayer(layer('L2'));
    expect((await resolveDefaultTranscriptionLayerIdsPerDocument(await getDb(), A)).sort()).toEqual(
      ['L1', 'L2'],
    );
    expect((await loadHomeProjectProgressBundle(text, 'zh-CN')).documentCount).toBe(2);
  });

  it('the AI default transcription layer is the current document one', async () => {
    const { d1 } = await seedTwoDocuments();
    const database = await getDb();
    expect(await isDefaultTranscriptionLayerForUnitText(database, 'u2', 'L2')).toBe(true);
    expect(await isDefaultTranscriptionLayerForUnitText(database, 'u1', 'L1')).toBe(false);
    await switchAnnotationDocument(A, d1);
    expect(await isDefaultTranscriptionLayerForUnitText(database, 'u1', 'L1')).toBe(true);
  });
});
