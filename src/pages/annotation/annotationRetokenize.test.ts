import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  listPendingAnalysisGraphCandidates,
  rejectAnalysisGraphCandidate,
  submitAnalysisGraphCandidate,
} from '../../annotation/analysisGraphConfirmation';
import {
  applyAnnotationRetokenize,
  previewAnnotationRetokenize,
  proposeAnnotationTokenForms,
  restoreAnnotationRetokenize,
  type AnnotationRetokenizeDeps,
} from './annotationRetokenize';

describe('annotationRetokenize', () => {
  const now = '2026-09-14T12:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.token_lexeme_links.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('splits Latin surface on word boundaries', () => {
    expect(proposeAnnotationTokenForms('hello world')).toEqual(['hello', 'world']);
    expect(proposeAnnotationTokenForms('   ')).toEqual([]);
  });

  it('previews without writing tokens', async () => {
    await db.unit_tokens.put({
      id: 'tok-whole',
      textId: 'text-rt-1',
      unitId: 'unit-rt-1',
      form: { default: 'hello world' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const preview = previewAnnotationRetokenize({
      unitId: 'unit-rt-1',
      surface: 'hello world',
      currentForms: ['hello world'],
    });
    expect(preview.proposedForms).toEqual(['hello', 'world']);
    expect(preview.unchanged).toBe(false);
    expect(await db.unit_tokens.count()).toBe(1);
  });

  it('writes tokens when the unit has no manual annotation', async () => {
    await db.unit_tokens.put({
      id: 'tok-whole',
      textId: 'text-rt-1',
      unitId: 'unit-rt-1',
      form: { default: 'hello world' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-1',
      unitId: 'unit-rt-1',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
    });
    expect(result.kind).toBe('tokens');
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-rt-1']);
    expect(
      [...requery].sort((a, b) => a.tokenIndex - b.tokenIndex).map((token) => token.form.default),
    ).toEqual(['hello', 'world']);
    expect(await listPendingAnalysisGraphCandidates('unit-rt-1')).toHaveLength(0);
  });

  it('stores a pending alternativeAnalysis when gloss already exists', async () => {
    await db.unit_tokens.put({
      id: 'tok-glossed',
      textId: 'text-rt-2',
      unitId: 'unit-rt-2',
      form: { default: 'hello world' },
      gloss: { default: 'greeting' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-2',
      unitId: 'unit-rt-2',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
    });
    expect(result.kind).toBe('candidate');
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-rt-2']);
    expect(requery).toHaveLength(1);
    expect(requery[0]?.form.default).toBe('hello world');
    const pending = await listPendingAnalysisGraphCandidates('unit-rt-2');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.analysisGraphStatus).toBe('pending');
    expect(pending[0]?.analysisGraphCandidate.relations[0]?.type).toBe('alternativeAnalysis');
  });

  it('does not write when the proposal matches current tokens', async () => {
    await db.unit_tokens.put({
      id: 'tok-hello',
      textId: 'text-rt-3',
      unitId: 'unit-rt-3',
      form: { default: 'hello' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_tokens.put({
      id: 'tok-world',
      textId: 'text-rt-3',
      unitId: 'unit-rt-3',
      form: { default: 'world' },
      tokenIndex: 1,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-3',
      unitId: 'unit-rt-3',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
    });
    expect(result.kind).toBe('unchanged');
    expect(await db.unit_tokens.count()).toBe(2);
    expect(await listPendingAnalysisGraphCandidates('unit-rt-3')).toHaveLength(0);
  });

  it('stores a pending candidate when a token draft is dirty', async () => {
    await db.unit_tokens.put({
      id: 'tok-draft',
      textId: 'text-rt-4',
      unitId: 'unit-rt-4',
      form: { default: 'hello world' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-4',
      unitId: 'unit-rt-4',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
      draftTokenIds: new Set(['tok-draft']),
    });
    expect(result.kind).toBe('candidate');
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-rt-4']);
    expect(requery).toHaveLength(1);
    expect(requery[0]?.form.default).toBe('hello world');
    expect(await listPendingAnalysisGraphCandidates('unit-rt-4')).toHaveLength(1);
  });

  it('does not write when the proposed forms are empty', async () => {
    await db.unit_tokens.put({
      id: 'tok-empty',
      textId: 'text-rt-5',
      unitId: 'unit-rt-5',
      form: { default: 'hello' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-5',
      unitId: 'unit-rt-5',
      surface: '   ',
      proposedForms: [],
    });
    expect(result.kind).toBe('unchanged');
    expect(await db.unit_tokens.count()).toBe(1);
  });

  it('overwrites a glossed token after saving a snapshot, then restores gloss, morpheme, and link', async () => {
    await db.unit_tokens.put({
      id: 'tok-glossed',
      textId: 'text-rt-6',
      unitId: 'unit-rt-6',
      form: { default: 'hello world', eng: 'hello world' },
      gloss: { default: 'greeting', eng: 'greeting' },
      pos: 'intj',
      languageId: 'eng',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.put({
      id: 'morph-1',
      textId: 'text-rt-6',
      unitId: 'unit-rt-6',
      tokenId: 'tok-glossed',
      form: { default: 'hello', eng: 'hello' },
      gloss: { default: 'hi', eng: 'hi' },
      pos: 'intj',
      lexemeId: 'lex-morph',
      surfaceParts: [{ startOffset: 0, endOffset: 5 }],
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.put({
      id: 'link-1',
      targetType: 'token',
      targetId: 'tok-glossed',
      lexemeId: 'lex-hello',
      senseId: 'sense-hello',
      confidence: 0.6,
      role: 'manual',
      createdAt: now,
      updatedAt: now,
    });
    const forced = await applyAnnotationRetokenize({
      textId: 'text-rt-6',
      unitId: 'unit-rt-6',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
      mode: 'force',
    });
    expect(forced.kind).toBe('forced');
    const split = [...(await LinguisticService.units.listTokensByUnitIds(['unit-rt-6']))].sort(
      (a, b) => a.tokenIndex - b.tokenIndex,
    );
    expect(split.map((token) => token.form.default)).toEqual(['hello', 'world']);
    expect(split.every((token) => token.gloss === undefined)).toBe(true);
    expect(await db.unit_morphemes.count()).toBe(0);
    expect(await db.token_lexeme_links.count()).toBe(0);
    const pending = await listPendingAnalysisGraphCandidates('unit-rt-6');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.analysisGraphCandidate.relations[0]?.role).toBe('retokenize-snapshot');

    const restored = await restoreAnnotationRetokenize({
      textId: 'text-rt-6',
      unitId: 'unit-rt-6',
    });
    expect(restored.restored).toBe(true);
    const readback = await LinguisticService.units.listTokensByUnitIds(['unit-rt-6']);
    expect(readback).toHaveLength(1);
    expect(readback[0]?.id).toBe('tok-glossed');
    expect(readback[0]?.form).toEqual({ default: 'hello world', eng: 'hello world' });
    expect(readback[0]?.gloss).toEqual({ default: 'greeting', eng: 'greeting' });
    expect(readback[0]?.pos).toBe('intj');
    expect(readback[0]?.languageId).toBe('eng');
    const morphs = await LinguisticService.units.listMorphemesByTokenIds(['tok-glossed']);
    expect(morphs.map((morph) => morph.form.default)).toEqual(['hello']);
    expect(morphs[0]?.form.eng).toBe('hello');
    expect(morphs[0]?.gloss).toEqual({ default: 'hi', eng: 'hi' });
    expect(morphs[0]?.pos).toBe('intj');
    expect(morphs[0]?.lexemeId).toBe('lex-morph');
    expect(morphs[0]?.surfaceParts).toEqual([{ startOffset: 0, endOffset: 5 }]);
    expect(readback[0]?.form.default?.slice(0, 5)).toBe('hello');
    const links = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-glossed');
    expect(links.map((link) => link.lexemeId)).toEqual(['lex-hello']);
    expect(links[0]?.senseId).toBe('sense-hello');
    expect(links[0]?.confidence).toBe(0.6);
    expect(await listPendingAnalysisGraphCandidates('unit-rt-6')).toHaveLength(0);
  });

  it('refuses to overwrite while a token draft is dirty', async () => {
    await db.unit_tokens.put({
      id: 'tok-draft-force',
      textId: 'text-rt-7',
      unitId: 'unit-rt-7',
      form: { default: 'hello world' },
      gloss: { default: 'greeting' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-7',
      unitId: 'unit-rt-7',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
      draftTokenIds: new Set(['tok-draft-force']),
      mode: 'force',
    });
    expect(result.kind).toBe('candidate');
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-rt-7']);
    expect(requery).toHaveLength(1);
    expect(requery[0]?.form.default).toBe('hello world');
    expect(await listPendingAnalysisGraphCandidates('unit-rt-7')).toHaveLength(0);
  });

  it('keeps a language-only token instead of overwriting it', async () => {
    await db.unit_tokens.put({
      id: 'tok-lang',
      textId: 'text-rt-8',
      unitId: 'unit-rt-8',
      form: { default: 'hello world' },
      languageId: 'eng',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const result = await applyAnnotationRetokenize({
      textId: 'text-rt-8',
      unitId: 'unit-rt-8',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
    });
    expect(result.kind).toBe('candidate');
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-rt-8']);
    expect(requery).toHaveLength(1);
    expect(requery[0]?.form.default).toBe('hello world');
    expect(requery[0]?.languageId).toBe('eng');
  });

  it('does not report restored when languageId, spans, or morpheme lexemeId are missing', async () => {
    await db.unit_tokens.put({
      id: 'tok-partial',
      textId: 'text-rt-9',
      unitId: 'unit-rt-9',
      form: { default: 'hello world' },
      languageId: 'eng',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.put({
      id: 'morph-partial',
      textId: 'text-rt-9',
      unitId: 'unit-rt-9',
      tokenId: 'tok-partial',
      form: { default: 'hello' },
      lexemeId: 'lex-morph',
      surfaceParts: [{ startOffset: 0, endOffset: 5 }],
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await applyAnnotationRetokenize({
      textId: 'text-rt-9',
      unitId: 'unit-rt-9',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
      mode: 'force',
    });
    const deps: AnnotationRetokenizeDeps = {
      listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
      listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
      listMorphemesByTokenIds: (tokenIds) =>
        LinguisticService.units.listMorphemesByTokenIds(tokenIds),
      listTokenLexemeLinks: (targetType, targetId) =>
        LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
      saveToken: (data) => {
        const { languageId: _languageId, ...rest } = data;
        return LinguisticService.units.saveToken(rest);
      },
      removeToken: (tokenId) => LinguisticService.units.removeToken(tokenId),
      saveMorpheme: (data) => {
        const { surfaceParts: _surfaceParts, lexemeId: _lexemeId, ...rest } = data;
        return LinguisticService.units.saveMorpheme(rest);
      },
      saveTokenLexemeLink: (data) => LinguisticService.units.saveTokenLexemeLink(data),
      submitCandidate: submitAnalysisGraphCandidate,
      listPendingCandidates: listPendingAnalysisGraphCandidates,
      rejectCandidate: rejectAnalysisGraphCandidate,
    };
    await expect(
      restoreAnnotationRetokenize({ textId: 'text-rt-9', unitId: 'unit-rt-9' }, deps),
    ).rejects.toThrow(/readback mismatch/);
  });

  it('keeps the current tokens when replacement creation fails', async () => {
    await db.unit_tokens.put({
      id: 'tok-rt-fail',
      textId: 'text-rt-fail',
      unitId: 'unit-rt-fail',
      form: { default: 'hello world' },
      gloss: { default: 'greeting' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const fail = () => {
      throw new Error('injected retokenize failure');
    };
    db.unit_tokens.hook('creating', fail);
    try {
      await expect(
        applyAnnotationRetokenize({
          textId: 'text-rt-fail',
          unitId: 'unit-rt-fail',
          surface: 'hello world',
          proposedForms: ['hello', 'world'],
          mode: 'force',
        }),
      ).rejects.toThrow('injected retokenize failure');
    } finally {
      db.unit_tokens.hook('creating').unsubscribe(fail);
    }
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-rt-fail']);
    expect(requery.map((token) => token.form.default)).toEqual(['hello world']);
    expect(requery[0]?.gloss?.default).toBe('greeting');
    expect(await listPendingAnalysisGraphCandidates('unit-rt-fail')).not.toHaveLength(0);
  });

  it('keeps the current tokens and the snapshot when restore creation fails', async () => {
    await db.unit_tokens.put({
      id: 'tok-rt-restore',
      textId: 'text-rt-restore',
      unitId: 'unit-rt-restore',
      form: { default: 'hello world' },
      gloss: { default: 'greeting' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await applyAnnotationRetokenize({
      textId: 'text-rt-restore',
      unitId: 'unit-rt-restore',
      surface: 'hello world',
      proposedForms: ['hello', 'world'],
      mode: 'force',
    });
    const before = [...(await LinguisticService.units.listTokensByUnitIds(['unit-rt-restore']))]
      .sort((a, b) => a.tokenIndex - b.tokenIndex)
      .map((token) => token.form.default);
    expect(before).toEqual(['hello', 'world']);
    expect(await listPendingAnalysisGraphCandidates('unit-rt-restore')).not.toHaveLength(0);
    const fail = () => {
      throw new Error('injected restore failure');
    };
    db.unit_tokens.hook('creating', fail);
    try {
      await expect(
        restoreAnnotationRetokenize({ textId: 'text-rt-restore', unitId: 'unit-rt-restore' }),
      ).rejects.toThrow('injected restore failure');
    } finally {
      db.unit_tokens.hook('creating').unsubscribe(fail);
    }
    const requery = [...(await LinguisticService.units.listTokensByUnitIds(['unit-rt-restore']))]
      .sort((a, b) => a.tokenIndex - b.tokenIndex)
      .map((token) => token.form.default);
    expect(requery).toEqual(['hello', 'world']);
    expect(await listPendingAnalysisGraphCandidates('unit-rt-restore')).not.toHaveLength(0);

    const restored = await restoreAnnotationRetokenize({
      textId: 'text-rt-restore',
      unitId: 'unit-rt-restore',
    });
    expect(restored.restored).toBe(true);
    const readback = await LinguisticService.units.listTokensByUnitIds(['unit-rt-restore']);
    expect(readback.map((token) => token.form.default)).toEqual(['hello world']);
    expect(readback[0]?.gloss?.default).toBe('greeting');
    expect(await listPendingAnalysisGraphCandidates('unit-rt-restore')).toHaveLength(0);
  });
});
