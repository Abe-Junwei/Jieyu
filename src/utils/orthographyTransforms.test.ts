import { describe, expect, it } from 'vitest';
import {
  buildTransformRulesFromRuleText,
  evaluateOrthographyTransformSampleCases,
  parseTransformMappings,
  parseTransformSampleCases,
  previewOrthographyTransform,
  validateOrthographyTransform,
} from './orthographyTransforms';

describe('orthographyTransforms', () => {
  it('parses mapping rules from free-form text', () => {
    expect(parseTransformMappings('aa => a\nsh -> s\n# comment\nŋ = ng')).toEqual([
      { from: 'aa', to: 'a' },
      { from: 'sh', to: 's' },
      { from: 'ŋ', to: 'ng' },
    ]);
  });

  it('applies table-map preview in longest-match order', () => {
    const rules = buildTransformRulesFromRuleText('aa => a\na => aa\nsh => s');
    expect(previewOrthographyTransform({ engine: 'table-map', rules, text: 'shaam' })).toBe('sam');
  });

  it('supports normalization and manual pass-through preview', () => {
    const result = previewOrthographyTransform({
      engine: 'manual',
      rules: {
        normalizeInput: 'NFC',
        normalizeOutput: 'NFC',
      },
      text: 'e\u0301',
    });
    expect(result).toBe('é');
  });

  it('validates invalid and duplicate transform rules', () => {
    const result = validateOrthographyTransform({
      engine: 'table-map',
      rules: buildTransformRulesFromRuleText('sh\nsh => s\nsh => x'),
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('缺少分隔符'),
      expect.stringContaining('重复来源规则'),
    ]));
  });

  it('parses and evaluates transform sample cases', () => {
    const sampleCases = parseTransformSampleCases('shaa => saa\nnga');
    const results = evaluateOrthographyTransformSampleCases({
      engine: 'table-map',
      rules: buildTransformRulesFromRuleText('sh => s\naa => a'),
      sampleCases,
    });

    expect(sampleCases).toEqual([
      { input: 'shaa', expectedOutput: 'saa' },
      { input: 'nga' },
    ]);
    expect(results[0]).toEqual(expect.objectContaining({
      input: 'shaa',
      actualOutput: 'sa',
      matchesExpectation: false,
    }));
    expect(results[1]).toEqual(expect.objectContaining({
      input: 'nga',
      actualOutput: 'nga',
    }));
  });
});
