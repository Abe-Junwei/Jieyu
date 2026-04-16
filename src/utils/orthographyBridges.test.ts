import { describe, expect, it } from 'vitest';
import { buildBridgeRulesFromRuleText, evaluateOrthographyBridgeSampleCases, parseBridgeMappings, parseBridgeSampleCases, previewOrthographyBridge, validateOrthographyBridge } from './orthographyBridges';

describe('orthographyBridges', () => {
  it('parses mapping rules from free-form text', () => {
    expect(parseBridgeMappings('aa => a\nsh -> s\n# comment\nŋ = ng')).toEqual([
      { from: 'aa', to: 'a' },
      { from: 'sh', to: 's' },
      { from: 'ŋ', to: 'ng' },
    ]);
  });

  it('applies table-map preview in longest-match order', () => {
    const rules = buildBridgeRulesFromRuleText('aa => a\na => aa\nsh => s');
    expect(previewOrthographyBridge({ engine: 'table-map', rules, text: 'shaam' })).toBe('sam');
  });

  it('supports normalization and manual pass-through preview', () => {
    const result = previewOrthographyBridge({
      engine: 'manual',
      rules: {
        normalizeInput: 'NFC',
        normalizeOutput: 'NFC',
      },
      text: 'e\u0301',
    });
    expect(result).toBe('é');
  });

  it('applies icu-rule preview as an ordered regex chain', () => {
    const result = previewOrthographyBridge({
      engine: 'icu-rule',
      rules: {
        ruleText: '/(.)h/ => $1\naa => a',
      },
      text: 'shaakh',
    });

    expect(result).toBe('sak');
  });

  it('applies icu-rule normalization directives inline', () => {
    const result = previewOrthographyBridge({
      engine: 'icu-rule',
      rules: {
        ruleText: '::NFD\n/e\\u0301/g => e\n::NFC',
      },
      text: 'é',
    });

    expect(result).toBe('e');
  });

  it('validates invalid and duplicate transform rules', () => {
    const result = validateOrthographyBridge({
      engine: 'table-map',
      rules: buildBridgeRulesFromRuleText('sh\nsh => s\nsh => x'),
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('缺少分隔符'),
      expect.stringContaining('重复来源规则'),
    ]));
  });

  it('validates malformed icu-rule directives and regex rules', () => {
    const result = validateOrthographyBridge({
      engine: 'icu-rule',
      rules: {
        ruleText: '::lower\n/[a-/ => x\nplainrule',
      },
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('以下 ICU 规则无效'),
      expect.stringContaining('以下 ICU 规则缺少分隔符'),
    ]));
  });

  it('parses and evaluates transform sample cases', () => {
    const sampleCases = parseBridgeSampleCases('shaa => saa\nnga');
    const results = evaluateOrthographyBridgeSampleCases({
      engine: 'table-map',
      rules: buildBridgeRulesFromRuleText('sh => s\naa => a'),
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
