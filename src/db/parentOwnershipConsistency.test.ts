// @vitest-environment jsdom
/**
 * GAP-1：token / morpheme / 词条链接不能挂到别的项目的父行上；级联删除不越过项目。
 * GAP-1: tokens / morphemes / lexeme links cannot reference another project's parents, and
 * cascade deletes stay inside the unit's project.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LayerDocType, type LayerUnitDocType } from '.';
import { exportDatabaseAsJson, importDatabaseFromJson } from './io';
import { JieyuParentOwnershipMismatchError } from './ownershipImmutabilityMiddleware';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { LinguisticService } from '../services/LinguisticService';
import { removeUnitCascade, removeUnitsBatchCascade } from '../services/LinguisticService.cleanup';
import { removeToken } from '../services/linguisticServiceUnitTokenOps';

const NOW = '2026-10-09T00:00:00.000Z';
const A = 'proj-A';
const B = 'proj-B';

function layer(id: string, textId: string): LayerDocType {
  return {
    id,
    textId,
    key: `trc_${id}`,
    name: { eng: id },
    layerType: 'transcription',
    languageId: 'eng',
    modality: 'text',
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
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
  } as LayerUnitDocType;
}
function token(id: string, textId: string, unitId: string) {
  return {
    id,
    textId,
    unitId,
    form: { default: id },
    tokenIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
function morpheme(id: string, textId: string, unitId: string, tokenId: string) {
  return {
    id,
    textId,
    unitId,
    tokenId,
    form: { default: id },
    morphemeIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
function lexeme(id: string, textId: string) {
  return {
    id,
    textId,
    createdAt: NOW,
    updatedAt: NOW,
    entry: { headword: id, senses: [] },
  };
}
function link(id: string, targetId: string, lexemeId: string) {
  return { id, targetType: 'token', targetId, lexemeId, createdAt: NOW, updatedAt: NOW };
}

const MISMATCH = /references (layer_units|unit_tokens|lexemes) .* of project/;

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  for (const id of [A, B]) {
    await db.texts.put({ id, title: { default: id }, createdAt: NOW, updatedAt: NOW } as never);
  }
  await LayerTierUnifiedService.createLayer(layer('L-A', A));
  await LayerTierUnifiedService.createLayer(layer('L-B', B));
  await db.layer_units.bulkPut([unit('unit-A', A, 'L-A'), unit('unit-B', B, 'L-B')]);
  await db.unit_tokens.bulkPut([token('tok-A', A, 'unit-A'), token('tok-B', B, 'unit-B')] as never);
  await db.lexemes.bulkPut([lexeme('lex-A', A), lexeme('lex-B', B)] as never);
});

describe('GAP-1 write paths reject cross-project parents', () => {
  it('JSON import (upsert) refuses a token whose unit belongs to another project', async () => {
    const snapshot = JSON.parse(JSON.stringify(await exportDatabaseAsJson())) as {
      collections: Record<string, unknown[]>;
    };
    snapshot.collections.unit_tokens = [token('tok-evil', B, 'unit-A')];
    await expect(importDatabaseFromJson(snapshot, { strategy: 'upsert' })).rejects.toThrow(
      MISMATCH,
    );
    expect(await db.unit_tokens.get('tok-evil')).toBeUndefined();
  });

  it('JSON import checks parents that arrive in the same snapshot, even when listed after children', async () => {
    const snapshot = JSON.parse(JSON.stringify(await exportDatabaseAsJson())) as {
      collections: Record<string, unknown[]>;
    };
    const { unit_tokens: tokens, ...rest } = snapshot.collections;
    // 子表在前、父表在后 | children listed before their parents
    snapshot.collections = {
      unit_tokens: [...(tokens ?? []), token('tok-evil', B, 'unit-new')],
      ...rest,
      layer_units: [...(rest.layer_units ?? []), unit('unit-new', A, 'L-A')],
    };
    await expect(importDatabaseFromJson(snapshot, { strategy: 'replace-all' })).rejects.toThrow(
      MISMATCH,
    );
  });

  it('JSON import (replace-all) accepts a unit that moved project together with its tokens', async () => {
    const snapshot = JSON.parse(JSON.stringify(await exportDatabaseAsJson())) as {
      collections: Record<string, unknown[]>;
    };
    snapshot.collections.unit_tokens = [token('tok-A', B, 'unit-A'), token('tok-B', B, 'unit-B')];
    snapshot.collections.layer_units = [unit('unit-A', B, 'L-B'), unit('unit-B', B, 'L-B')];
    await importDatabaseFromJson(snapshot, { strategy: 'replace-all' });
    expect((await db.unit_tokens.get('tok-A'))?.textId).toBe(B);
  });

  it('direct saveToken / saveTokensBatch / saveMorpheme refuse cross-project parents', async () => {
    await expect(
      LinguisticService.units.saveToken(token('tok-x', B, 'unit-A') as never),
    ).rejects.toBeInstanceOf(JieyuParentOwnershipMismatchError);
    await expect(
      LinguisticService.units.saveTokensBatch([token('tok-y', B, 'unit-A')] as never),
    ).rejects.toThrow(MISMATCH);
    await expect(
      LinguisticService.units.saveMorpheme(morpheme('m-x', A, 'unit-A', 'tok-B') as never),
    ).rejects.toThrow(MISMATCH);
    expect(await db.unit_tokens.bulkGet(['tok-x', 'tok-y'])).toEqual([undefined, undefined]);
    expect(await db.unit_morphemes.get('m-x')).toBeUndefined();
    // 同项目仍可写 | same-project writes still pass
    await LinguisticService.units.saveToken(token('tok-ok', A, 'unit-A') as never);
    await LinguisticService.units.saveMorpheme(morpheme('m-ok', A, 'unit-A', 'tok-A') as never);
  });

  it('Table.update cannot repoint a token at another project unit', async () => {
    await expect(db.unit_tokens.update('tok-B', { unitId: 'unit-A' })).rejects.toThrow(MISMATCH);
    expect((await db.unit_tokens.get('tok-B'))?.unitId).toBe('unit-B');
  });

  it('Table.bulkUpdate cannot repoint tokens at another project unit', async () => {
    await expect(
      db.unit_tokens.bulkUpdate([{ key: 'tok-B', changes: { unitId: 'unit-A' } }]),
    ).rejects.toThrow();
    expect((await db.unit_tokens.get('tok-B'))?.unitId).toBe('unit-B');
  });

  it('Collection.modify (function and object form) cannot repoint tokens', async () => {
    await expect(
      db.unit_tokens
        .where('id')
        .equals('tok-B')
        .modify((row) => {
          row.unitId = 'unit-A';
        }),
    ).rejects.toThrow();
    await expect(
      db.unit_tokens.where('unitId').equals('unit-B').modify({ unitId: 'unit-A' }),
    ).rejects.toThrow();
    expect((await db.unit_tokens.get('tok-B'))?.unitId).toBe('unit-B');
  });

  it('explicit transactions that do not declare the parent table are still checked', async () => {
    await expect(
      db.transaction('rw', db.unit_tokens, async () => {
        await db.unit_tokens.put(token('tok-z', B, 'unit-A') as never);
      }),
    ).rejects.toThrow(MISMATCH);
  });

  it('lexeme links refuse a token and a lexeme of different projects', async () => {
    await expect(
      LinguisticService.units.saveTokenLexemeLink(link('ln-x', 'tok-B', 'lex-A') as never),
    ).rejects.toThrow(MISMATCH);
    await expect(
      db.token_lexeme_links.put(link('ln-y', 'tok-A', 'lex-B') as never),
    ).rejects.toThrow(MISMATCH);
    await LinguisticService.units.saveTokenLexemeLink(link('ln-ok', 'tok-A', 'lex-A') as never);
    await expect(db.token_lexeme_links.update('ln-ok', { lexemeId: 'lex-B' })).rejects.toThrow(
      MISMATCH,
    );
    expect((await db.token_lexeme_links.get('ln-ok'))?.lexemeId).toBe('lex-A');
  });

  it('same-project repointing still works', async () => {
    await db.layer_units.put(unit('unit-A2', A, 'L-A'));
    await db.unit_tokens.update('tok-A', { unitId: 'unit-A2' });
    expect((await db.unit_tokens.get('tok-A'))?.unitId).toBe('unit-A2');
  });
});

describe('GAP-1 cascade deletes stay inside the project', () => {
  async function plantForeignChildren(): Promise<void> {
    // 模拟修复前已写入的坏数据：绕过中间件不可能，所以在没有父行时先写子行，再补父行
    // Simulate pre-fix bad data: write children while their parent is absent, then the parent
    await db.layer_units.delete('unit-A');
    await db.unit_tokens.put(token('tok-B-stray', B, 'unit-A') as never);
    await db.unit_morphemes.put(morpheme('m-B-stray', B, 'unit-A', 'tok-B-stray') as never);
    await db.layer_units.put(unit('unit-A', A, 'L-A'));
    await db.unit_morphemes.put(morpheme('m-A', A, 'unit-A', 'tok-A') as never);
    await db.token_lexeme_links.put(link('ln-B-stray', 'tok-B-stray', 'lex-B') as never);
    await db.token_lexeme_links.put(link('ln-A', 'tok-A', 'lex-A') as never);
  }

  it('removeUnitCascade deletes the unit own children but not another project rows', async () => {
    await plantForeignChildren();
    await removeUnitCascade('unit-A');
    expect(await db.unit_tokens.get('tok-A')).toBeUndefined();
    expect(await db.unit_morphemes.get('m-A')).toBeUndefined();
    expect(await db.token_lexeme_links.get('ln-A')).toBeUndefined();
    expect(await db.unit_tokens.get('tok-B-stray')).toBeDefined();
    expect(await db.unit_morphemes.get('m-B-stray')).toBeDefined();
    expect(await db.token_lexeme_links.get('ln-B-stray')).toBeDefined();
    expect(await db.unit_tokens.get('tok-B')).toBeDefined();
  });

  it('removeUnitsBatchCascade does the same', async () => {
    await plantForeignChildren();
    await removeUnitsBatchCascade(['unit-A']);
    expect(await db.unit_tokens.get('tok-A')).toBeUndefined();
    expect(await db.unit_tokens.get('tok-B-stray')).toBeDefined();
    expect(await db.unit_morphemes.get('m-B-stray')).toBeDefined();
    expect(await db.token_lexeme_links.get('ln-B-stray')).toBeDefined();
  });

  it('removeToken keeps morphemes of another project that point at the token', async () => {
    await db.unit_tokens.delete('tok-A');
    await db.unit_morphemes.put(morpheme('m-B-on-A', B, 'unit-B', 'tok-A') as never);
    await db.unit_tokens.put(token('tok-A', A, 'unit-A') as never);
    await db.unit_morphemes.put(morpheme('m-A', A, 'unit-A', 'tok-A') as never);
    await removeToken('tok-A');
    expect(await db.unit_morphemes.get('m-A')).toBeUndefined();
    expect(await db.unit_morphemes.get('m-B-on-A')).toBeDefined();
  });
});
