import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, isLexemeEntry } from '../../db';
import { createImportedTokenGraphWriter } from './persistImportedTokenGraph';

const TEXT_ID = 'text-graph';
const OTHER_PROJECT = 'other-project';

async function clearGraph(): Promise<void> {
  const tokens = await db.unit_tokens.where('textId').equals(TEXT_ID).toArray();
  const morphs = await db.unit_morphemes.where('textId').equals(TEXT_ID).toArray();
  const linkTargets = [
    ...tokens.map((row) => ['token', row.id] as [string, string]),
    ...morphs.map((row) => ['morpheme', row.id] as [string, string]),
  ];
  if (linkTargets.length > 0) {
    await db.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).delete();
  }
  await db.unit_tokens.where('textId').equals(TEXT_ID).delete();
  await db.unit_morphemes.where('textId').equals(TEXT_ID).delete();
  await db.lexemes.where('textId').equals(TEXT_ID).delete();
  await db.lexemes.where('textId').equals(OTHER_PROJECT).delete();
}

describe('createImportedTokenGraphWriter', () => {
  beforeEach(async () => {
    await clearGraph();
  });

  it('replaces a host graph, then leaves it when the next write is empty', async () => {
    const writer = createImportedTokenGraphWriter({ textId: TEXT_ID });
    await writer.write({
      hostUnitId: 'host-1',
      now: '2026-10-15T00:00:00.000Z',
      language: 'eng',
      tokens: [
        {
          form: { default: 'pine' },
          morphemes: [{ form: { default: 'pine' } }],
        },
      ],
    });
    await writer.write({
      hostUnitId: 'host-1',
      now: '2026-10-15T00:00:01.000Z',
      language: 'eng',
      tokens: [{ form: { default: 'cone' } }],
    });

    const tokens = await db.unit_tokens.where('unitId').equals('host-1').toArray();
    expect(tokens.map((row) => row.form.default)).toEqual(['cone']);
    expect(await db.unit_morphemes.where('unitId').equals('host-1').toArray()).toEqual([]);
    const links = await db.token_lexeme_links
      .where('[targetType+targetId]')
      .anyOf([['token', tokens[0]?.id ?? '']])
      .toArray();
    expect(links).toHaveLength(1);

    await writer.write({
      hostUnitId: 'host-1',
      now: '2026-10-15T00:00:02.000Z',
      tokens: [],
    });
    const afterEmpty = await db.unit_tokens.where('unitId').equals('host-1').toArray();
    expect(afterEmpty.map((row) => row.form.default)).toEqual(['cone']);
  });

  it('does not reuse an explicit lexeme from another project', async () => {
    await db.lexemes.put({
      id: 'lex-other',
      entry: {
        id: 'lex-other',
        headword: 'pine',
        senses: [
          {
            id: 'sense-other',
            headwordTranslations: [{ text: 'pine', langCode: 'eng' }],
          },
        ],
      },
      textId: OTHER_PROJECT,
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z',
    });
    const writer = createImportedTokenGraphWriter({ textId: TEXT_ID });
    await writer.write({
      hostUnitId: 'host-1',
      now: '2026-10-15T00:00:00.000Z',
      language: 'eng',
      tokens: [{ form: { default: 'pine' }, lexemeId: 'lex-other' }],
    });
    const [token] = await db.unit_tokens.where('unitId').equals('host-1').toArray();
    expect(token?.lexemeId).not.toBe('lex-other');
    const owned = await db.lexemes.get(token?.lexemeId ?? '');
    expect(owned?.textId).toBe(TEXT_ID);
  });

  it('creates one lexeme when two hosts share a surface in one writer', async () => {
    const writer = createImportedTokenGraphWriter({ textId: TEXT_ID });
    const token = { form: { default: 'pine' } };
    await writer.write({
      hostUnitId: 'host-1',
      now: '2026-10-15T00:00:00.000Z',
      language: 'eng',
      tokens: [token],
    });
    await writer.write({
      hostUnitId: 'host-2',
      now: '2026-10-15T00:00:00.000Z',
      language: 'eng',
      tokens: [token],
    });
    const rows = await db.unit_tokens.where('textId').equals(TEXT_ID).toArray();
    expect(rows.map((row) => row.lexemeId)).toEqual([rows[0]?.lexemeId, rows[0]?.lexemeId]);
    const lexemes = (await db.lexemes.where('textId').equals(TEXT_ID).toArray()).filter(
      (row) => isLexemeEntry(row) && row.entry.headword === 'pine',
    );
    expect(lexemes).toHaveLength(1);
  });
});
