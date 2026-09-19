import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { listPendingAnalysisGraphCandidates } from '../../annotation/analysisGraphConfirmation';
import {
  applyAnnotationRetokenize,
  previewAnnotationRetokenize,
  proposeAnnotationTokenForms,
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
});
