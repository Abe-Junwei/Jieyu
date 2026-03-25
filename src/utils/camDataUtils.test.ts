import { describe, expect, it } from 'vitest';
import {
  assertReviewProtection,
  assertStableId,
  createDefaultProvenance,
  normalizeTierAnnotationDocForStorage,
  normalizeUserNoteDocForStorage,
  normalizeUtteranceTextDocForStorage,
} from './camDataUtils';

describe('camDataUtils', () => {
  it('creates default provenance envelope', () => {
    const provenance = createDefaultProvenance({ actorType: 'human', method: 'manual' });
    expect(provenance.actorType).toBe('human');
    expect(provenance.method).toBe('manual');
    expect(typeof provenance.createdAt).toBe('string');
  });

  it('adds default provenance to utterance texts', () => {
    const normalized = normalizeUtteranceTextDocForStorage({
      id: 'utr_1',
      utteranceId: 'utt_1',
      layerId: 'layer_1',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    });

    expect(normalized.provenance).toBeDefined();
    expect(normalized.provenance!.actorType).toBe('human');
    expect(normalized.provenance!.method).toBe('manual');
  });

  it('adds default provenance to tier annotations', () => {
    const normalized = normalizeTierAnnotationDocForStorage({
      id: 'ann_1',
      tierId: 'tier_1',
      value: 'foo',
      isVerified: false,
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    });

    expect(normalized.provenance).toBeDefined();
    expect(normalized.provenance!.method).toBe('manual');
  });

  it('adds default provenance to user notes', () => {
    const normalized = normalizeUserNoteDocForStorage({
      id: 'note_1',
      targetType: 'utterance',
      targetId: 'utt_1',
      content: { zho: '备注' },
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    });

    expect(normalized.provenance).toBeDefined();
    expect(normalized.provenance!.actorType).toBe('human');
  });

  // ── M1 Write Contract Guards ──────────────────────────────────

  describe('assertStableId', () => {
    it('passes for a valid id', () => {
      expect(() => assertStableId('tok_123', 'token')).not.toThrow();
    });

    it('throws for undefined id', () => {
      expect(() => assertStableId(undefined, 'token')).toThrow(/稳定 id/);
    });

    it('throws for empty string id', () => {
      expect(() => assertStableId('', 'morpheme')).toThrow(/稳定 id/);
    });
  });

  describe('assertReviewProtection', () => {
    it('allows human to overwrite confirmed', () => {
      expect(() => assertReviewProtection('confirmed', 'human')).not.toThrow();
    });

    it('allows AI to write non-confirmed', () => {
      expect(() => assertReviewProtection('draft', 'ai')).not.toThrow();
      expect(() => assertReviewProtection('suggested', 'ai')).not.toThrow();
      expect(() => assertReviewProtection(undefined, 'ai')).not.toThrow();
    });

    it('blocks AI from overwriting confirmed', () => {
      expect(() => assertReviewProtection('confirmed', 'ai')).toThrow(/confirmed.*AI/);
    });
  });
});