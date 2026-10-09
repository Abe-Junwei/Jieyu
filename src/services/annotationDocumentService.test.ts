/**
 * rev5 切片 2B-E：标注文档身份与事务替换（T18、T22、N11）。
 * rev5 slice 2B-E: annotation document identity and transactional replace (T18, T22, N11).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  dexieStoresForAnnotationImportRw,
  getDb,
  withTransaction,
  type LayerDocType,
  type LayerUnitDocType,
} from '../db';
import { isSyntheticManuscriptId, syntheticManuscriptId } from '../utils/projectSourceFiles';
import { collectArchiveProjectDocuments } from './archiveProjectDocuments';
import { LayerTierUnifiedService } from './LayerTierUnifiedService';
import {
  AnnotationDocumentProjectNotFoundError,
  attachSourceToAnnotationDocument,
  buildProjectDocumentsManifest,
  deleteAnnotationDocumentUnitGraph,
  ensureDefaultAnnotationDocument,
  listAnnotationDocuments,
  previewAnnotationDocumentReplace,
  readDefaultAnnotationDocumentId,
} from './annotationDocumentService';

const TEXT_A = 'text_2be_a';
const TEXT_B = 'text_2be_b';
const NOW = '2026-10-09T08:00:00.000Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function seedText(id: string): Promise<void> {
  await db.texts.put({ id, title: { default: id }, createdAt: NOW, updatedAt: NOW });
}

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

function unit(id: string, textId: string, layerId: string, startTime: number): LayerUnitDocType {
  return {
    id,
    textId,
    layerId,
    unitType: 'unit',
    startTime,
    endTime: startTime + 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function snapshotUnits(textId: string): Promise<string[]> {
  return (await db.layer_units.where('textId').equals(textId).toArray()).map((u) => u.id).sort();
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  await seedText(TEXT_A);
  await seedText(TEXT_B);
});

describe('T22: default document identity', () => {
  it('two projects get distinct UUID default documents with defaultDocumentId / isDefault set', async () => {
    const docA = await ensureDefaultAnnotationDocument(TEXT_A);
    const docB = await ensureDefaultAnnotationDocument(TEXT_B);
    expect(docA).toMatch(UUID_RE);
    expect(docB).toMatch(UUID_RE);
    expect(docA).not.toBe(docB);
    expect((await db.texts.get(TEXT_A))?.defaultDocumentId).toBe(docA);
    expect((await db.texts.get(TEXT_B))?.defaultDocumentId).toBe(docB);
    expect(await listAnnotationDocuments(TEXT_A)).toEqual([
      expect.objectContaining({ id: docA, textId: TEXT_A, isDefault: true }),
    ]);
  });

  it('is idempotent and never creates on read paths', async () => {
    expect(await readDefaultAnnotationDocumentId(TEXT_A)).toBeUndefined();
    expect(await previewAnnotationDocumentReplace(TEXT_A)).toEqual(
      expect.objectContaining({ documentId: undefined, unitCount: 0 }),
    );
    expect(await db.annotation_documents.count()).toBe(0);
    const first = await ensureDefaultAnnotationDocument(TEXT_A);
    const second = await ensureDefaultAnnotationDocument(TEXT_A);
    expect(second).toBe(first);
    expect(await db.annotation_documents.count()).toBe(1);
  });

  it('rejects a missing project with a typed error', async () => {
    await expect(ensureDefaultAnnotationDocument('text_missing')).rejects.toBeInstanceOf(
      AnnotationDocumentProjectNotFoundError,
    );
  });

  it('stamps new layers with the default document and lists them in projects[].documents[]', async () => {
    const docA = await ensureDefaultAnnotationDocument(TEXT_A);
    const docB = await ensureDefaultAnnotationDocument(TEXT_B);
    await LayerTierUnifiedService.createLayer(layer('lay_a1', TEXT_A));
    await LayerTierUnifiedService.createLayer(layer('lay_b1', TEXT_B));
    expect((await db.tier_definitions.get('lay_a1'))?.documentId).toBe(docA);
    expect((await db.tier_definitions.get('lay_b1'))?.documentId).toBe(docB);

    const dexieDb = await getDb();
    await withTransaction(dexieDb, 'rw', [dexieDb.dexie.annotation_documents], () =>
      attachSourceToAnnotationDocument(dexieDb, docA, 'src_1'),
    );
    const manifest = await buildProjectDocumentsManifest(TEXT_A);
    expect(manifest).toEqual({
      defaultDocumentId: docA,
      documents: [
        { documentId: docA, isDefault: true, layerIds: ['lay_a1'], sourceIds: ['src_1'] },
      ],
    });
  });
});

describe('T22: archive manifest projects[].documents[]', () => {
  it('lists each project with its default document, bridged layers and sources', () => {
    const projects = collectArchiveProjectDocuments({
      collections: {
        texts: [
          { id: TEXT_A, defaultDocumentId: 'doc-a' },
          { id: TEXT_B, defaultDocumentId: 'doc-b' },
        ],
        annotation_documents: [
          { id: 'doc-a', textId: TEXT_A, isDefault: true, sourceIds: ['src-a'] },
          { id: 'doc-b', textId: TEXT_B, isDefault: true },
        ],
        tier_definitions: [
          { id: 'lay-a', textId: TEXT_A, key: 'bridge_lay-a' },
          { id: 'lay-b', textId: TEXT_B, key: 'bridge_lay-b', documentId: 'doc-b' },
          { id: 'tier-raw', textId: TEXT_A, key: 'raw' },
        ],
      },
    });
    expect(projects).toEqual([
      {
        id: TEXT_A,
        defaultDocumentId: 'doc-a',
        documents: [
          { documentId: 'doc-a', isDefault: true, layerIds: ['lay-a'], sourceIds: ['src-a'] },
        ],
      },
      {
        id: TEXT_B,
        defaultDocumentId: 'doc-b',
        documents: [{ documentId: 'doc-b', isDefault: true, layerIds: ['lay-b'], sourceIds: [] }],
      },
    ]);
  });
});

describe('T18: transactional replace with preview', () => {
  async function seedTwoDocuments(): Promise<{ defaultDoc: string; otherDoc: string }> {
    const defaultDoc = await ensureDefaultAnnotationDocument(TEXT_A);
    const otherDoc = 'b1c2d3e4-0000-4000-8000-000000000002';
    await db.annotation_documents.put({
      id: otherDoc,
      textId: TEXT_A,
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await LayerTierUnifiedService.createLayer(layer('lay_main', TEXT_A));
    await LayerTierUnifiedService.createLayer(layer('lay_other', TEXT_A, otherDoc));
    await db.layer_units.bulkPut([
      unit('u_main_1', TEXT_A, 'lay_main', 0),
      unit('u_main_2', TEXT_A, 'lay_main', 2),
      unit('u_other_1', TEXT_A, 'lay_other', 0),
      unit('u_b_1', TEXT_B, 'lay_b', 0),
    ]);
    return { defaultDoc, otherDoc };
  }

  it('preview is read-only and counts only the default document', async () => {
    const { defaultDoc } = await seedTwoDocuments();
    const before = await snapshotUnits(TEXT_A);
    const docsBefore = await db.annotation_documents.toArray();
    const preview = await previewAnnotationDocumentReplace(TEXT_A);
    expect(preview).toEqual({ documentId: defaultDoc, unitCount: 2, layerCount: 1 });
    // 预览之后取消 = 什么都不写 | Cancel after preview = nothing written
    expect(await snapshotUnits(TEXT_A)).toEqual(before);
    expect(await db.annotation_documents.toArray()).toEqual(docsBefore);
  });

  it('a failure inside the replace transaction keeps the original content', async () => {
    const { defaultDoc } = await seedTwoDocuments();
    const before = await snapshotUnits(TEXT_A);
    const dexieDb = await getDb();
    await expect(
      withTransaction(dexieDb, 'rw', [...dexieStoresForAnnotationImportRw(dexieDb)], async () => {
        const result = await deleteAnnotationDocumentUnitGraph(dexieDb, TEXT_A, defaultDoc);
        expect(result.deletedUnitIds.sort()).toEqual(['u_main_1', 'u_main_2']);
        throw new Error('simulated mid-import failure');
      }),
    ).rejects.toThrow();
    expect(await snapshotUnits(TEXT_A)).toEqual(before);
  });

  it('replace removes only the default document units; other documents and projects stay', async () => {
    const { defaultDoc } = await seedTwoDocuments();
    const dexieDb = await getDb();
    await withTransaction(dexieDb, 'rw', [...dexieStoresForAnnotationImportRw(dexieDb)], () =>
      deleteAnnotationDocumentUnitGraph(dexieDb, TEXT_A, defaultDoc),
    );
    expect(await snapshotUnits(TEXT_A)).toEqual(['u_other_1']);
    expect(await snapshotUnits(TEXT_B)).toEqual(['u_b_1']);
    expect(await db.tier_definitions.get('lay_other')).toBeDefined();
    expect(await db.tier_definitions.get('lay_main')).toBeDefined();
  });
});

describe('JY-12: replace leaves no orphaned dependent rows', () => {
  async function seedDependents(unitId: string, suffix: string): Promise<void> {
    await db.layer_unit_contents.put({
      id: `luc_${suffix}`,
      textId: TEXT_A,
      unitId,
      layerId: 'lay_main',
      modality: 'text',
      text: suffix,
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_tokens.put({
      id: `tok_${suffix}`,
      textId: TEXT_A,
      unitId,
      form: { default: suffix },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_morphemes.put({
      id: `mor_${suffix}`,
      textId: TEXT_A,
      unitId,
      tokenId: `tok_${suffix}`,
      form: { default: suffix },
      morphemeIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.token_lexeme_links.bulkPut([
      {
        id: `link_tok_${suffix}`,
        targetType: 'token',
        targetId: `tok_${suffix}`,
        lexemeId: 'lex_shared',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: `link_mor_${suffix}`,
        targetType: 'morpheme',
        targetId: `mor_${suffix}`,
        lexemeId: 'lex_shared',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const note = (targetType: 'unit' | 'token' | 'morpheme' | 'translation', targetId: string) => ({
      id: `note_${targetType}_${suffix}`,
      targetType,
      targetId,
      content: { eng: `${targetType} note` },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.user_notes.bulkPut([
      note('unit', unitId),
      note('token', `tok_${suffix}`),
      note('morpheme', `mor_${suffix}`),
      note('translation', `luc_${suffix}`),
    ]);
    await db.segment_meta.put({
      id: `lay_main::${unitId}`,
      segmentId: unitId,
      textId: TEXT_A,
      mediaId: 'media_a',
      layerId: 'lay_main',
      hostUnitId: unitId,
      startTime: 0,
      endTime: 1,
      text: suffix,
      normalizedText: suffix,
      hasText: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.embeddings.put({
      id: `unit::${unitId}::m::v`,
      sourceType: 'unit',
      sourceId: unitId,
      model: 'm',
      modelVersion: 'v',
      contentHash: suffix,
      vector: [1, 0],
      createdAt: NOW,
    });
  }

  async function countDependents(suffix: string, unitId: string): Promise<number[]> {
    return Promise.all([
      db.layer_unit_contents.where('unitId').equals(unitId).count(),
      db.unit_tokens.where('unitId').equals(unitId).count(),
      db.unit_morphemes.where('unitId').equals(unitId).count(),
      db.token_lexeme_links
        .where('[targetType+targetId]')
        .anyOf([
          ['token', `tok_${suffix}`],
          ['morpheme', `mor_${suffix}`],
        ])
        .count(),
      db.user_notes.filter((row) => row.id.endsWith(`_${suffix}`)).count(),
      db.segment_meta.where('segmentId').equals(unitId).count(),
      db.embeddings.where('sourceId').equals(unitId).count(),
    ]);
  }

  it('re-import replace removes tokens, morphemes, links, notes, segment_meta of replaced units only', async () => {
    const defaultDoc = await ensureDefaultAnnotationDocument(TEXT_A);
    const otherDoc = 'b1c2d3e4-0000-4000-8000-000000000003';
    await db.annotation_documents.put({
      id: otherDoc,
      textId: TEXT_A,
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await LayerTierUnifiedService.createLayer(layer('lay_main', TEXT_A));
    await LayerTierUnifiedService.createLayer(layer('lay_other', TEXT_A, otherDoc));
    await db.layer_units.bulkPut([
      unit('u_main_1', TEXT_A, 'lay_main', 0),
      unit('u_other_1', TEXT_A, 'lay_other', 0),
    ]);
    await seedDependents('u_main_1', 'main');
    await seedDependents('u_other_1', 'other');
    expect(await countDependents('main', 'u_main_1')).toEqual([1, 1, 1, 2, 4, 1, 1]);

    const dexieDb = await getDb();
    await withTransaction(dexieDb, 'rw', [...dexieStoresForAnnotationImportRw(dexieDb)], () =>
      deleteAnnotationDocumentUnitGraph(dexieDb, TEXT_A, defaultDoc),
    );

    expect(await countDependents('main', 'u_main_1')).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // 其他文档的单元及其附属行不受影响 | Another document's units and dependents stay
    expect(await countDependents('other', 'u_other_1')).toEqual([1, 1, 1, 2, 4, 1, 1]);
  });
});

describe('N11: synthetic manuscript ids', () => {
  it('never look like a source record UUID or the old src-manuscript- prefix', () => {
    const id = syntheticManuscriptId(TEXT_A);
    expect(isSyntheticManuscriptId(id)).toBe(true);
    expect(id.startsWith('src-manuscript-')).toBe(false);
    expect(id).not.toMatch(UUID_RE);
    expect(isSyntheticManuscriptId('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(false);
  });
});
