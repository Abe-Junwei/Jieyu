import { describe, expect, it } from 'vitest';
import { LeipzigValidator } from './LeipzigValidator';

describe('LeipzigValidator', () => {
  const validator = new LeipzigValidator();

  // ── isStandardAbbreviation ──

  it('recognizes standard person markers', () => {
    expect(validator.isStandardAbbreviation('1')).toBe(true);
    expect(validator.isStandardAbbreviation('2')).toBe(true);
    expect(validator.isStandardAbbreviation('3')).toBe(true);
  });

  it('recognizes standard number markers', () => {
    expect(validator.isStandardAbbreviation('SG')).toBe(true);
    expect(validator.isStandardAbbreviation('PL')).toBe(true);
    expect(validator.isStandardAbbreviation('DU')).toBe(true);
  });

  it('recognizes standard case markers', () => {
    for (const abbr of ['NOM', 'ACC', 'GEN', 'DAT', 'ERG', 'ABS']) {
      expect(validator.isStandardAbbreviation(abbr)).toBe(true);
    }
  });

  it('recognizes standard tense/aspect/mood markers', () => {
    for (const abbr of ['PST', 'PRS', 'FUT', 'IPFV', 'PFV', 'PROG', 'PERF', 'IND', 'SBJV', 'IMP']) {
      expect(validator.isStandardAbbreviation(abbr)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(validator.isStandardAbbreviation('sg')).toBe(true);
    expect(validator.isStandardAbbreviation('Pst')).toBe(true);
  });

  it('rejects unknown abbreviations', () => {
    expect(validator.isStandardAbbreviation('XYZ')).toBe(false);
    expect(validator.isStandardAbbreviation('PASTREL')).toBe(false);
  });

  // ── isKnownAbbreviation with custom set ──

  it('recognizes custom abbreviations', () => {
    const custom = new LeipzigValidator(['CUST1', 'MYTAG']);
    expect(custom.isKnownAbbreviation('CUST1')).toBe(true);
    expect(custom.isKnownAbbreviation('MYTAG')).toBe(true);
    expect(custom.isKnownAbbreviation('SG')).toBe(true); // still standard
  });

  // ── validateGloss: valid inputs ──

  it('validates standard gloss "3.SG.PST" as valid', () => {
    const result = validator.validateGloss('3.SG.PST');
    expect(result.valid).toBe(true);
    expect(result.recognizedAbbreviations).toEqual(expect.arrayContaining(['3', 'SG', 'PST']));
    expect(result.unknownAbbreviations).toEqual([]);
  });

  it('validates pure lexical gloss "dog" as valid', () => {
    const result = validator.validateGloss('dog');
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('validates mixed gloss "dog-PL" as valid', () => {
    const result = validator.validateGloss('dog-PL');
    expect(result.valid).toBe(true);
    expect(result.recognizedAbbreviations).toContain('PL');
  });

  it('validates empty string as valid', () => {
    const result = validator.validateGloss('');
    expect(result.valid).toBe(true);
  });

  // ── validateGloss: non-standard abbreviations ──

  it('warns about non-standard abbreviation "PASTREL"', () => {
    const result = validator.validateGloss('3.SG.PASTREL');
    expect(result.valid).toBe(false);
    expect(result.unknownAbbreviations).toContain('PASTREL');
    expect(result.warnings.some((w) => w.type === 'non_standard_abbreviation')).toBe(true);
  });

  it('warns about non-standard "MASC" (standard is M)', () => {
    const result = validator.validateGloss('MASC.SG');
    expect(result.valid).toBe(false);
    expect(result.unknownAbbreviations).toContain('MASC');
  });

  // ── validateGloss: separator issues ──

  it('warns about non-standard separator (colon)', () => {
    const result = validator.validateGloss('3:SG');
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.type === 'separator_inconsistency')).toBe(true);
  });

  it('hints when hyphen joins two grammar labels', () => {
    const result = validator.validateGloss('SG-PST');
    // 两个标准缩写用 - 连接 → info 级提示 | Two standard abbrs joined by - → info hint
    expect(result.warnings.some((w) =>
      w.type === 'separator_inconsistency' && w.severity === 'info'
    )).toBe(true);
  });

  // ── validateGloss: mixed case ──

  it('hints about mixed case "Nom" (prefer uppercase)', () => {
    // "Nom" 含大写但非全大写 → 属于 mixed_case 提示 | mixed case hint
    const result = validator.validateGloss('Nom');
    expect(result.warnings.some((w) => w.type === 'mixed_case')).toBe(true);
  });

  // ── getStandardByCategory ──

  it('returns correct abbreviations for "person" category', () => {
    expect(LeipzigValidator.getStandardByCategory('person')).toEqual(['1', '2', '3']);
  });

  it('returns empty for unknown category', () => {
    expect(LeipzigValidator.getStandardByCategory('nonexistent')).toEqual([]);
  });

  // ── getAllStandard ──

  it('returns a non-empty set of standard abbreviations', () => {
    const all = LeipzigValidator.getAllStandard();
    expect(all.size).toBeGreaterThan(50);
    expect(all.has('SG')).toBe(true);
  });

  // ── validateBatch ──

  it('validates multiple glosses in batch', () => {
    const results = validator.validateBatch(['3.SG', 'UNKN.TAG', 'dog']);
    expect(results.get('3.SG')?.valid).toBe(true);
    expect(results.get('UNKN.TAG')?.valid).toBe(false);
    expect(results.get('dog')?.valid).toBe(true);
  });
});
