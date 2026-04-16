import { describe, expect, it } from 'vitest';
import { extractUnitIdFromNote, getPdfPageFromHash, isDirectPdfCitationRef, splitPdfCitationRef } from './citationJumpUtils';

describe('citationJumpUtils', () => {
  it('extracts unit id from unit note target', () => {
    expect(extractUnitIdFromNote({
      targetType: 'unit',
      targetId: 'utt_1',
    })).toBe('utt_1');
  });

  it('extracts unit id from tier annotation target', () => {
    expect(extractUnitIdFromNote({
      targetType: 'tier_annotation',
      targetId: 'utt_2::anno_1',
    })).toBe('utt_2');
  });

  it('extracts unit id from token target with parent fallback', () => {
    expect(extractUnitIdFromNote({
      targetType: 'token',
      targetId: 'utt_3::w1',
      parentTargetId: 'utt_3',
    })).toBe('utt_3');
  });

  it('splits pdf citation ref into base and hash', () => {
    expect(splitPdfCitationRef('doc.pdf#page=12')).toEqual({
      baseRef: 'doc.pdf',
      hashSuffix: '#page=12',
    });
  });

  it('detects direct pdf citation refs', () => {
    expect(isDirectPdfCitationRef('https://example.com/a.pdf')).toBe(true);
    expect(isDirectPdfCitationRef('blob:https://example.com/id')).toBe(true);
    expect(isDirectPdfCitationRef('media_123')).toBe(false);
  });

  it('parses page index from hash suffix', () => {
    expect(getPdfPageFromHash('#page=12')).toBe(12);
    expect(getPdfPageFromHash('#12')).toBe(12);
    expect(getPdfPageFromHash('#section=1')).toBeNull();
  });
});
