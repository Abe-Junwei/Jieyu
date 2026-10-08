/**
 * T4 / T5（rev5 4.2-9；切片 2B-B）：目录行写入时必须带项目归属；读操作不产生写入。
 * T4 / T5 (rev5 4.2-9; slice 2B-B): catalog writes need an owning project; reads never write.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../annotation/structuralRuleProfile';
import { LinguisticService } from '../services/LinguisticService';
import { CatalogProjectRequiredError } from '../services/projectCatalogScope';
import { entryDoc } from '../utils/dmlexEntry';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import { assertCatalogRowOwnership, CatalogOwnershipError } from './catalogOwnership';
import { db, getDb, importDatabaseFromJson, JIEYU_DEXIE_DB_NAME } from './index';
import { JIEYU_TABLE_VALIDATORS } from './engine';
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuMainTableName } from './tableRegistry';
import { JieyuWriteValidationError } from './writeValidationMiddleware';

const NOW = '2026-10-09T00:00:00.000Z';
const OWNER = 'text-owner';

type Row = Record<string, unknown> & { id: string };

/** 每张目录表一行合法数据（归属字段齐全）| One valid row per catalog table, owner included */
function validCatalogRows(): Record<string, Row> {
  return {
    speakers: { id: 'spk-1', textId: OWNER, name: 'Ada', createdAt: NOW, updatedAt: NOW },
    lexemes: {
      ...entryDoc({ id: 'lex-1', headword: 'dog', createdAt: NOW, updatedAt: NOW, textId: OWNER }),
    },
    lexeme_assets: {
      id: 'asset-1',
      textId: OWNER,
      kind: 'image',
      mimeType: 'image/png',
      displayName: 'dog.png',
      byteSize: 3,
      refCount: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    lexeme_asset_links: {
      id: 'link-1',
      textId: OWNER,
      lexemeId: 'lex-1',
      assetId: 'asset-1',
      createdAt: NOW,
    },
    languages: {
      id: 'user:demo',
      textId: OWNER,
      name: { eng: 'Demo' },
      languageCode: 'demo',
      createdAt: NOW,
      updatedAt: NOW,
    },
    language_display_names: {
      id: 'ldn-1',
      textId: OWNER,
      languageId: 'user:demo',
      locale: 'zh-CN',
      role: 'preferred',
      value: '示例',
      sourceType: 'user-custom',
      createdAt: NOW,
      updatedAt: NOW,
    },
    language_aliases: {
      id: 'lal-1',
      textId: OWNER,
      languageId: 'user:demo',
      alias: 'demo',
      normalizedAlias: 'demo',
      aliasType: 'search',
      sourceType: 'user-custom',
      createdAt: NOW,
      updatedAt: NOW,
    },
    language_catalog_history: {
      id: 'lch-1',
      textId: OWNER,
      languageId: 'user:demo',
      action: 'create',
      summary: 'created',
      createdAt: NOW,
    },
    custom_field_definitions: {
      id: 'cfd-1',
      textId: OWNER,
      name: { 'zh-CN': '字段' },
      fieldType: 'text',
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    orthographies: {
      id: 'orth-1',
      textId: OWNER,
      name: { eng: 'Practical' },
      languageId: 'user:demo',
      createdAt: NOW,
      updatedAt: NOW,
    },
    orthography_bridges: {
      id: 'bridge-1',
      textId: OWNER,
      sourceOrthographyId: 'orth-1',
      targetOrthographyId: 'orth-2',
      engine: 'table-map',
      rules: { mappings: [{ from: 'a', to: 'á' }] },
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
    locations: { id: 'loc-1', textId: OWNER, name: { eng: 'Village' }, createdAt: NOW },
    bibliographic_sources: { id: 'src-1', textId: OWNER, title: 'Grammar', createdAt: NOW },
    grammar_docs: {
      id: 'gd-1',
      textId: OWNER,
      title: 'Intro',
      content: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    },
    abbreviations: {
      id: 'abbr-1',
      textId: OWNER,
      abbreviation: 'PL',
      name: { eng: 'plural' },
      createdAt: NOW,
    },
    phonemes: {
      id: 'ph-1',
      textId: OWNER,
      languageId: 'user:demo',
      ipa: 'a',
      type: 'vowel',
      createdAt: NOW,
      updatedAt: NOW,
    },
    tag_definitions: {
      id: 'tag-1',
      textId: OWNER,
      key: 'todo',
      name: { eng: 'Todo' },
      createdAt: NOW,
    },
    structural_rule_profiles: {
      id: 'srp-1',
      scope: 'project',
      projectId: OWNER,
      enabled: true,
      priority: 0,
      profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'project.demo', scope: 'project' },
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

const catalogTables = (Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[]).filter(
  (name) => JIEYU_MAIN_TABLE_REGISTRY[name].dataClass === 'project_catalog',
);

function ownerFieldOf(table: JieyuMainTableName): string {
  return JIEYU_MAIN_TABLE_REGISTRY[table].ownerField ?? 'textId';
}

function withoutOwner(table: JieyuMainTableName, row: Row): Row {
  const copy = { ...row };
  delete copy[ownerFieldOf(table)];
  return copy;
}

function dexieTable(table: string) {
  return db.table(table);
}

async function clearCatalogTables(): Promise<void> {
  await db.open();
  await Promise.all(catalogTables.map((table) => dexieTable(table).clear()));
}

describe('T4 catalog ownership is required on every write', () => {
  beforeEach(clearCatalogTables);

  it('has a valid fixture for every catalog table in the registry', () => {
    const rows = validCatalogRows();
    expect(Object.keys(rows).sort()).toEqual([...catalogTables].sort());
    for (const table of catalogTables) {
      const validate = JIEYU_TABLE_VALIDATORS[table] as (row: unknown) => void;
      expect(() => validate(rows[table]), table).not.toThrow();
      expect(() => assertCatalogRowOwnership(table, rows[table]), table).not.toThrow();
    }
  });

  it.each(catalogTables)('%s: rule rejects an empty owner and a system.* id', (table) => {
    const row = validCatalogRows()[table]!;
    expect(() => assertCatalogRowOwnership(table, withoutOwner(table, row))).toThrow(
      CatalogOwnershipError,
    );
    expect(() => assertCatalogRowOwnership(table, { ...row, [ownerFieldOf(table)]: '  ' })).toThrow(
      CatalogOwnershipError,
    );
    expect(() => assertCatalogRowOwnership(table, { ...row, id: 'system.anything' })).toThrow(
      /code-only/,
    );
  });

  it.each(catalogTables)('%s: put / bulkPut without owner are rejected', async (table) => {
    const row = validCatalogRows()[table]!;
    await expect(dexieTable(table).put(withoutOwner(table, row))).rejects.toBeInstanceOf(
      JieyuWriteValidationError,
    );
    await expect(
      dexieTable(table).bulkPut([row, withoutOwner(table, { ...row, id: `${row.id}-b` })]),
    ).rejects.toBeTruthy();
    expect(await dexieTable(table).get(`${row.id}-b`)).toBeUndefined();
  });

  it.each(catalogTables)('%s: update / modify cannot clear the owner', async (table) => {
    const row = validCatalogRows()[table]!;
    await dexieTable(table).put(row);
    const field = ownerFieldOf(table);
    await expect(dexieTable(table).update(row.id, { [field]: '' })).rejects.toBeInstanceOf(
      JieyuWriteValidationError,
    );
    await expect(
      dexieTable(table)
        .where('id')
        .equals(row.id)
        .modify((stored: Row) => {
          delete stored[field];
        }),
    ).rejects.toBeTruthy();
    expect((await dexieTable(table).get(row.id))?.[field]).toBe(OWNER);
  });

  it('rejects a snapshot import whose catalog rows have no owner, and writes nothing', async () => {
    const rows = validCatalogRows();
    const snapshot = {
      schemaVersion: 4,
      exportedAt: NOW,
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        speakers: [withoutOwner('speakers', rows.speakers!)],
        tag_definitions: [rows.tag_definitions],
      },
    };
    await expect(importDatabaseFromJson(snapshot, { strategy: 'upsert' })).rejects.toBeTruthy();
    expect(await db.speakers.count()).toBe(0);
    expect(await db.tag_definitions.count()).toBe(0);
  });

  it('service writes without a project fail with a clear error', async () => {
    clearActiveProjectTextId();
    await expect(
      LinguisticService.speakers.create({ name: 'Ada', textId: '' }),
    ).rejects.toBeInstanceOf(CatalogProjectRequiredError);
    await expect(
      LinguisticService.lexemes.save(
        entryDoc({ id: 'lex-x', headword: 'x', createdAt: NOW, updatedAt: NOW, textId: '' }),
      ),
    ).rejects.toThrow(/project/i);
    await expect(
      LinguisticService.orthography.create({
        name: { eng: 'X' },
        languageId: 'user:demo',
      } as never),
    ).rejects.toBeInstanceOf(CatalogProjectRequiredError);
    for (const table of catalogTables) {
      expect(await dexieTable(table).count(), table).toBe(0);
    }
  });
});

describe('T5 catalog reads never write', () => {
  const writes: string[] = [];
  const unhooks: Array<() => void> = [];

  beforeEach(async () => {
    await clearCatalogTables();
    // 先写一些本项目数据，再挂钩子计数写入 | Seed project rows first, then count writes
    const rows = validCatalogRows();
    for (const table of catalogTables) {
      await dexieTable(table).put(rows[table]);
    }
    writes.length = 0;
    await getDb();
    for (const table of catalogTables) {
      const t = dexieTable(table);
      const onCreate = () => {
        writes.push(`${table}:create`);
      };
      const onUpdate = () => {
        writes.push(`${table}:update`);
      };
      const onDelete = () => {
        writes.push(`${table}:delete`);
      };
      t.hook('creating', onCreate);
      t.hook('updating', onUpdate);
      t.hook('deleting', onDelete);
      unhooks.push(() => {
        t.hook('creating').unsubscribe(onCreate);
        t.hook('updating').unsubscribe(onUpdate);
        t.hook('deleting').unsubscribe(onDelete);
      });
    }
  });

  afterEach(() => {
    for (const unhook of unhooks.splice(0)) unhook();
    clearActiveProjectTextId();
  });

  async function runAllReads(): Promise<void> {
    await LinguisticService.lexemes.list();
    await LinguisticService.lexemes.search('dog');
    await LinguisticService.lexemes.getResource();
    await LinguisticService.speakers.listForProject(OWNER);
    await LinguisticService.speakers.listForProject('');
    await LinguisticService.orthography.list({});
    await LinguisticService.orthography.listBridges({});
    await LinguisticService.languageCatalog.listEntries({ locale: 'zh-CN', includeHidden: true });
    await LinguisticService.languageCatalog.listHistory('user:demo');
    await LinguisticService.languageCatalog.listCustomFieldDefinitions();
    await LinguisticService.structuralProfiles.listAssets({
      projectId: OWNER,
      includeDisabled: true,
    });
    await LinguisticService.structuralProfiles.listAssets({});
  }

  it('without an active project: empty results and no writes', async () => {
    clearActiveProjectTextId();
    await runAllReads();
    expect(await LinguisticService.lexemes.list()).toEqual([]);
    expect(await LinguisticService.languageCatalog.listCustomFieldDefinitions()).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('with an active project: owned rows only and no writes', async () => {
    publishActiveProjectTextId(OWNER);
    await runAllReads();
    expect((await LinguisticService.lexemes.list()).map((row) => row.id)).toEqual(['lex-1']);
    publishActiveProjectTextId('text-other');
    expect(await LinguisticService.lexemes.list()).toEqual([]);
    expect(await LinguisticService.orthography.list({})).not.toContainEqual(
      expect.objectContaining({ id: 'orth-1' }),
    );
    expect(writes).toEqual([]);
  });

  it('control: the write counter does see real writes', async () => {
    publishActiveProjectTextId(OWNER);
    await LinguisticService.speakers.create({ name: 'Counted', textId: OWNER });
    expect(writes).toContain('speakers:create');
  });
});
