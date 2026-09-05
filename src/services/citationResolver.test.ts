import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';
import {
  CITATION_BROKEN_CODE,
  presentTokenLexemeLink,
  resolveUnitCitation,
} from './citationResolver';

const NOW = '2026-09-05T00:00:00.000Z';

describe('resolveUnitCitation', () => {
  beforeEach(async () => {
    await db.layer_units.clear();
  });

  it('returns ok when the canonical unit row exists', async () => {
    await db.layer_units.put({
      id: 'utt_live',
      textId: 'text_cite',
      mediaId: 'media_cite',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await expect(resolveUnitCitation('utt_live')).resolves.toEqual({
      kind: 'ok',
      type: 'unit',
      unitId: 'utt_live',
    });
  });

  it('returns CITATION_UNIT_NOT_FOUND after removeUnit, even with a leftover segment row', async () => {
    await db.layer_units.put({
      id: 'utt_gone',
      textId: 'text_cite',
      mediaId: 'media_cite',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await LinguisticService.cleanup.removeUnit('utt_gone');
    await db.layer_units.put({
      id: 'segv2_layer_utt_gone',
      textId: 'text_cite',
      mediaId: 'media_cite',
      unitType: 'segment',
      parentUnitId: 'utt_gone',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(resolveUnitCitation('utt_gone')).resolves.toEqual({
      kind: 'broken',
      type: 'unit',
      code: CITATION_BROKEN_CODE.unitNotFound,
    });
    await expect(resolveUnitCitation('segv2_layer_utt_gone')).resolves.toEqual({
      kind: 'broken',
      type: 'unit',
      code: CITATION_BROKEN_CODE.unitNotFound,
    });
  });
});

describe('presentTokenLexemeLink', () => {
  it('marks a dangling lexeme id as CITATION_LEXEME_NOT_FOUND instead of using the id as lemma', () => {
    expect(presentTokenLexemeLink({ linkId: 'tll-1', lexemeId: 'lex-missing' })).toEqual({
      linkId: 'tll-1',
      lexemeId: 'lex-missing',
      lemma: '',
      brokenCode: CITATION_BROKEN_CODE.lexemeNotFound,
    });
  });

  it('keeps a live lemma', () => {
    expect(
      presentTokenLexemeLink({ linkId: 'tll-2', lexemeId: 'lex-hello', lemma: 'hello' }),
    ).toEqual({
      linkId: 'tll-2',
      lexemeId: 'lex-hello',
      lemma: 'hello',
    });
  });
});
