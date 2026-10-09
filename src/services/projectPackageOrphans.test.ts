/**
 * BF1-N3：归档导入丢弃父行不在包里的行（JYT / JYM 共用 inspectProjectPackage，JYB 用 inspectJyb）。
 * BF1-N3: archive import drops rows whose parent is not in the package (JYT / JYM share
 * inspectProjectPackage; JYB uses inspectJyb).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { entryDoc } from '../utils/dmlexEntry';
import {
  disasterRestoreFromJyb,
  exportDatabaseToJyb,
  importJybProjectsAsNew,
  previewJybRestore,
} from './JybService';
import {
  exportProjectToJyt,
  overwriteProjectWithJyt,
  previewJytRestore,
  restoreJytAsNewProject,
} from './JytService';
import { dropOrphanRows } from './projectPackageService';

vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => true,
  listCollaboratedIds: () => [],
}));

const NOW = '2026-10-09T01:00:00.000Z';

async function seedProject(p: string): Promise<void> {
  await db.texts.put({ id: p, title: { default: `Project ${p}` }, createdAt: NOW, updatedAt: NOW });
  await db.tier_definitions.put({
    id: `${p}-layer`,
    textId: p,
    key: `bridge_trc_${p}`,
    name: { default: 'Transcription' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    languageId: 'user:demo',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.layer_units.put(unit(`${p}-unit`, p));
  await db.unit_tokens.put(token(`${p}-tok`, p, `${p}-unit`));
  await db.lexemes.put(
    entryDoc({
      id: `${p}-lex`,
      headword: 'dog',
      createdAt: NOW,
      updatedAt: NOW,
      textId: p,
    }) as never,
  );
  await db.token_lexeme_links.put(link(`${p}-link`, `${p}-tok`, `${p}-lex`));
}

function unit(id: string, textId: string) {
  return {
    id,
    textId,
    layerId: `${textId}-layer`,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never;
}

function token(id: string, textId: string, unitId: string) {
  return {
    id,
    textId,
    unitId,
    form: { default: 'dog' },
    tokenIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as never;
}

function link(id: string, targetId: string, lexemeId: string) {
  return { id, targetType: 'token', targetId, lexemeId, createdAt: NOW, updatedAt: NOW } as never;
}

function segment(id: string, textId: string, parentUnitId: string) {
  return {
    id,
    textId,
    layerId: `${textId}-layer`,
    unitType: 'segment',
    parentUnitId,
    rootUnitId: parentUnitId,
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never;
}

function content(id: string, textId: string, unitId: string) {
  return {
    id,
    textId,
    unitId,
    layerId: `${textId}-layer`,
    contentRole: 'primary_text',
    modality: 'text',
    text: 'orphan-seg',
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  } as never;
}

/**
 * 修复前留下的坏数据（中间件拦不住先写子行、后补父行）：pA 的 token 挂在 pB 的句段上，带一个
 * morpheme 和一个链接；pA 自己的 token 还有一个指向 pB 词条的链接。
 * Pre-fix bad data (child written before its parent exists): a pA token on pB's unit with a
 * morpheme and a link, plus a link from pA's own token to pB's lexeme.
 */
async function plantOrphans(): Promise<void> {
  await db.layer_units.delete('pB-unit');
  await db.lexemes.delete('pB-lex');
  await db.unit_tokens.put(token('pA-stray-tok', 'pA', 'pB-unit'));
  await db.unit_morphemes.put({
    id: 'pA-stray-mor',
    textId: 'pA',
    unitId: 'pB-unit',
    tokenId: 'pA-stray-tok',
    form: { default: 'dog' },
    morphemeIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.token_lexeme_links.put(link('pA-stray-link', 'pA-stray-tok', 'pA-lex'));
  await db.token_lexeme_links.put(link('pA-foreign-lex-link', 'pA-tok', 'pB-lex'));
  await db.layer_units.put(unit('pB-unit', 'pB'));
  await db.lexemes.put(
    entryDoc({
      id: 'pB-lex',
      headword: 'dog',
      createdAt: NOW,
      updatedAt: NOW,
      textId: 'pB',
    }) as never,
  );
}

const EXPECTED_SKIPPED = [
  { collection: 'token_lexeme_links', count: 2 },
  { collection: 'unit_morphemes', count: 1 },
  { collection: 'unit_tokens', count: 1 },
];

/** 某项目里每个 token / morpheme / 链接的父行都在同一项目 | Every child's parents are in the same project */
async function expectNoOrphansIn(projectId: string): Promise<void> {
  const units = new Set(
    (await db.layer_units.where('textId').equals(projectId).primaryKeys()).map(String),
  );
  const tokens = await db.unit_tokens.where('textId').equals(projectId).toArray();
  expect(tokens).toHaveLength(1);
  for (const row of tokens) expect(units.has(row.unitId)).toBe(true);
  expect(await db.unit_morphemes.where('textId').equals(projectId).count()).toBe(0);
  const tokenIds = new Set(tokens.map((row) => row.id));
  const lexemeIds = new Set(
    (await db.lexemes.toArray()).filter((row) => row.textId === projectId).map((row) => row.id),
  );
  const links = (await db.token_lexeme_links.toArray()).filter((row) => tokenIds.has(row.targetId));
  expect(links).toHaveLength(1);
  expect(lexemeIds.has(links[0]!.lexemeId)).toBe(true);
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await seedProject('pA');
  await seedProject('pB');
  await plantOrphans();
});

describe('dropOrphanRows', () => {
  const base = {
    layer_units: [
      { id: 'u1' },
      { id: 'seg1', parentUnitId: 'u1', rootUnitId: 'u1' },
      { id: 'seg-orphan', parentUnitId: 'gone', rootUnitId: 'u1' },
    ],
    layer_unit_contents: [
      { id: 'c1', unitId: 'seg1' },
      { id: 'c-seg-orphan', unitId: 'seg-orphan' },
      { id: 'c-orphan', unitId: 'gone' },
    ],
    unit_tokens: [
      { id: 't1', unitId: 'u1' },
      { id: 't-orphan', unitId: 'gone' },
    ],
    unit_morphemes: [
      { id: 'm1', unitId: 'u1', tokenId: 't1' },
      { id: 'm-cascade', unitId: 'u1', tokenId: 't-orphan' },
    ],
    lexemes: [{ id: 'lex1' }],
    token_lexeme_links: [
      { id: 'l1', targetType: 'token', targetId: 't1', lexemeId: 'lex1' },
      { id: 'l-morph', targetType: 'morpheme', targetId: 'm1', lexemeId: 'lex1' },
      { id: 'l-dropped-morph', targetType: 'morpheme', targetId: 'm-cascade', lexemeId: 'lex1' },
      { id: 'l-foreign-lex', targetType: 'token', targetId: 't1', lexemeId: 'lex-elsewhere' },
    ],
  };

  it('drops orphans and their cascade, keeps valid rows, counts per table', () => {
    const { collections, skipped } = dropOrphanRows(base);
    const ids = (name: keyof typeof base) =>
      (collections[name] as Array<{ id: string }>).map((r) => r.id);
    expect(ids('layer_units')).toEqual(['u1', 'seg1']);
    expect(ids('layer_unit_contents')).toEqual(['c1']);
    expect(ids('unit_tokens')).toEqual(['t1']);
    expect(ids('unit_morphemes')).toEqual(['m1']);
    expect(ids('token_lexeme_links')).toEqual(['l1', 'l-morph']);
    expect(skipped).toEqual([
      { collection: 'layer_unit_contents', count: 2 },
      { collection: 'layer_units', count: 1 },
      { collection: 'token_lexeme_links', count: 2 },
      { collection: 'unit_morphemes', count: 1 },
      { collection: 'unit_tokens', count: 1 },
    ]);
  });

  it('returns the same object when nothing is orphaned', () => {
    const clean = { layer_units: [{ id: 'u1' }], unit_tokens: [{ id: 't1', unitId: 'u1' }] };
    const result = dropOrphanRows(clean);
    expect(result.collections).toBe(clean);
    expect(result.skipped).toEqual([]);
  });
});

describe('JYT / JYM (inspectProjectPackage)', () => {
  it('preview reports the orphans; restore-as-new drops them and does not fail at commit', async () => {
    const archive = await exportProjectToJyt('pA');
    const preview = await previewJytRestore(archive);
    expect(preview.skippedOrphanRows).toEqual(EXPECTED_SKIPPED);
    expect(preview.collections.find((c) => c.name === 'unit_tokens')?.incoming).toBe(1);

    // 回归：pB-unit 在本机存在；修复前孤儿 token 带着旧 id 落到新项目，归属中间件在提交时报错
    // Regression: pB-unit exists locally; before the fix the orphan token kept its old id and the
    // ownership middleware threw JieyuParentOwnershipMismatchError at commit
    const restored = await restoreJytAsNewProject(archive);
    expect(restored.skippedOrphanRows).toEqual(EXPECTED_SKIPPED);
    await expectNoOrphansIn(restored.projectId);
  });

  it('overwrite of another project drops them too', async () => {
    await seedProject('pC');
    const archive = await exportProjectToJyt('pA');
    const result = await overwriteProjectWithJyt(archive, { targetProjectId: 'pC' });
    expect(result.skippedOrphanRows).toEqual(EXPECTED_SKIPPED);
    await expectNoOrphansIn('pC');
  });

  it('drops a segment whose parentUnitId points outside the package', async () => {
    // 修复前坏数据：pA 的句段挂在 pB 的单元上（先写子行再补父行）
    // Pre-fix: a pA segment whose parentUnitId points at pB's unit
    await db.layer_units.delete('pB-unit');
    await db.layer_units.put(segment('pA-stray-seg', 'pA', 'pB-unit'));
    await db.layer_unit_contents.put(content('pA-stray-seg-content', 'pA', 'pA-stray-seg'));
    await db.layer_units.put(unit('pB-unit', 'pB'));

    const archive = await exportProjectToJyt('pA');
    const preview = await previewJytRestore(archive);
    expect(preview.skippedOrphanRows).toEqual([
      { collection: 'layer_unit_contents', count: 1 },
      { collection: 'layer_units', count: 1 },
      ...EXPECTED_SKIPPED,
    ]);

    const restored = await restoreJytAsNewProject(archive);
    expect(restored.skippedOrphanRows).toEqual([
      { collection: 'layer_unit_contents', count: 1 },
      { collection: 'layer_units', count: 1 },
      ...EXPECTED_SKIPPED,
    ]);
    const units = await db.layer_units.where('textId').equals(restored.projectId).toArray();
    expect(
      units.every((row) => !row.parentUnitId || units.some((u) => u.id === row.parentUnitId)),
    ).toBe(true);
    expect(units.some((row) => row.unitType === 'segment')).toBe(false);
    expect(await db.layer_unit_contents.where('textId').equals(restored.projectId).count()).toBe(0);
  });
});

describe('JYB (inspectJyb)', () => {
  it('per-project preview and import attribute the orphans to their project', async () => {
    const archive = await exportDatabaseToJyb();
    const preview = await previewJybRestore(archive);
    const byId = new Map(preview.projects.map((p) => [p.id, p.skippedOrphanRows]));
    expect(byId.get('pA')).toEqual(EXPECTED_SKIPPED);
    expect(byId.get('pB')).toEqual([]);

    const result = await importJybProjectsAsNew(archive);
    const imported = new Map(result.projects.map((p) => [p.sourceProjectId, p]));
    expect(imported.get('pA')?.skippedOrphanRows).toEqual(EXPECTED_SKIPPED);
    expect(imported.get('pB')?.skippedOrphanRows).toEqual([]);
    await expectNoOrphansIn(imported.get('pA')!.projectId);
  });

  it('disaster restore leaves no orphan behind', async () => {
    const archive = await exportDatabaseToJyb();
    await Promise.all(db.tables.map((table) => table.clear()));
    const result = await disasterRestoreFromJyb(archive);
    expect(result.skippedOrphanRows).toEqual(EXPECTED_SKIPPED);
    expect(await db.unit_tokens.get('pA-stray-tok')).toBeUndefined();
    expect(await db.unit_morphemes.get('pA-stray-mor')).toBeUndefined();
    expect(await db.token_lexeme_links.get('pA-stray-link')).toBeUndefined();
    expect(await db.token_lexeme_links.get('pA-foreign-lex-link')).toBeUndefined();
    await expectNoOrphansIn('pA');
  });
});
