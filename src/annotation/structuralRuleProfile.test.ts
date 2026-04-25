import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
  parseGlossStructure,
  validateStructuralRuleProfile,
  type StructuralRuleProfile,
} from './structuralRuleProfile';

describe('structural rule profile', () => {
  it('accepts the built-in Leipzig structural profile', () => {
    expect(validateStructuralRuleProfile(DEFAULT_LEIPZIG_STRUCTURAL_PROFILE)).toMatchObject({
      id: 'system.leipzig-structural.v1',
      scope: 'system',
      symbols: {
        morphemeBoundary: '-',
        featureSeparator: '.',
        cliticBoundary: '=',
      },
    });
  });

  it('rejects profiles that reuse structural markers', () => {
    const invalidProfile: StructuralRuleProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      symbols: {
        ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.symbols,
        cliticBoundary: DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.symbols.morphemeBoundary,
      },
    };

    expect(() => validateStructuralRuleProfile(invalidProfile)).toThrow('is reused by');
  });
});

describe('profile-driven gloss structure parser', () => {
  it('parses morpheme, feature, and clitic boundaries from the default Leipzig profile', () => {
    const result = parseGlossStructure('1SG=COP dog-PL');

    expect(result.profileId).toBe(DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.id);
    expect(result.boundaries.map((boundary) => boundary.type)).toEqual(['clitic', 'morpheme']);
    expect(result.segments.map((segment) => [segment.text, segment.kind])).toEqual([
      ['1SG', 'feature'],
      ['COP', 'feature'],
      ['dog', 'lexical'],
      ['PL', 'feature'],
    ]);
    expect(result.features.map((feature) => feature.label)).toEqual(['1SG', 'COP', 'PL']);
    expect(result.projectionDiagnostics.every((diagnostic) => diagnostic.status === 'complete')).toBe(true);
  });

  it('parses infix and supplied zero markers as structure, not plain text', () => {
    const result = parseGlossStructure('touch<PRS> sheep-[ZERO]');

    expect(result.boundaries.map((boundary) => boundary.type)).toEqual(['infix', 'infix', 'morpheme', 'supplied', 'supplied']);
    expect(result.segments.map((segment) => [segment.text, segment.kind])).toEqual([
      ['touch', 'lexical'],
      ['PRS', 'infix'],
      ['sheep', 'lexical'],
      ['ZERO', 'zero'],
    ]);
    expect(result.features.map((feature) => feature.label)).toEqual(['PRS', 'ZERO']);
  });

  it('keeps alternation as a reviewable structural boundary', () => {
    const result = parseGlossStructure('go\\PST');

    expect(result.boundaries.map((boundary) => boundary.type)).toEqual(['alternation']);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: 'alternation_marker',
        severity: 'info',
      }),
    ]);
    expect(result.projectionDiagnostics.every((diagnostic) => diagnostic.status === 'complete')).toBe(true);
  });

  it('classifies configured reduplication markers before generic features', () => {
    const result = parseGlossStructure('REDUP-dog');

    expect(result.segments.map((segment) => [segment.text, segment.kind])).toEqual([
      ['REDUP', 'reduplication'],
      ['dog', 'lexical'],
    ]);
  });

  it('treats non-ASCII uppercase gloss labels as feature segments when unambiguous', () => {
    const result = parseGlossStructure('ΑΒ-ΓΔ');
    expect(result.segments.map((segment) => [segment.text, segment.kind])).toEqual([
      ['ΑΒ', 'feature'],
      ['ΓΔ', 'feature'],
    ]);
  });

  it('marks unmatched wrappers as needsReview diagnostics', () => {
    const result = parseGlossStructure('touch<PRS');

    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: 'unmatched_wrapper',
        severity: 'warning',
      }),
    ]);
    expect(result.projectionDiagnostics.every((diagnostic) => diagnostic.status === 'needsReview')).toBe(true);
  });

  it('respects user-editable language asset profiles', () => {
    const customProfile: StructuralRuleProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      id: 'language.custom-structural.v1',
      label: 'Custom language structural profile',
      scope: 'language',
      symbols: {
        morphemeBoundary: '_',
        featureSeparator: ':',
        cliticBoundary: '+',
        infixStart: '{',
        infixEnd: '}',
        suppliedStart: '(',
        suppliedEnd: ')',
        alternationMarker: '~',
      },
      zeroMarkers: ['Ø'],
      reduplicationMarkers: ['DUP'],
    };

    const result = parseGlossStructure('root{PRS}_Ø+COP', customProfile);

    expect(result.profileId).toBe('language.custom-structural.v1');
    expect(result.boundaries.map((boundary) => [boundary.type, boundary.marker])).toEqual([
      ['infix', '{'],
      ['infix', '}'],
      ['morpheme', '_'],
      ['clitic', '+'],
    ]);
    expect(result.segments.map((segment) => [segment.text, segment.kind])).toEqual([
      ['root', 'lexical'],
      ['PRS', 'infix'],
      ['Ø', 'zero'],
      ['COP', 'feature'],
    ]);
  });
});
