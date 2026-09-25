import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { listPendingAnalysisGraphCandidates } from '../../annotation/analysisGraphConfirmation';
import {
  applyAnnotationRetokenize,
  previewAnnotationRetokenize,
  proposeAnnotationTokenForms,
  restoreAnnotationRetokenize,
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
      form: { default: 'hello world' },
      gloss: { default: 'greeting' },
      pos: 'intj',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.put({
      id: 'morph-1',
      textId: 'text-rt-6',
      unitId: 'unit-rt-6',
      tokenId: 'tok-glossed',
      form: { default: 'hello' },
      gloss: { default: 'hi' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.put({
      id: 'link-1',
      targetType: 'token',
      targetId: 'tok-glossed',
      lexemeId: 'lex-hello',
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
    expect(readback[0]?.gloss?.default).toBe('greeting');
    expect(readback[0]?.pos).toBe('intj');
    const morphs = await LinguisticService.units.listMorphemesByTokenIds(['tok-glossed']);
    expect(morphs.map((morph) => morph.form.default)).toEqual(['hello']);
    expect(morphs[0]?.gloss?.default).toBe('hi');
    const links = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-glossed');
    expect(links.map((link) => link.lexemeId)).toEqual(['lex-hello']);
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
});
