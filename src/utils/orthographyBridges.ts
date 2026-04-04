import type { OrthographyBridgeDocType } from '../db';

export type OrthographyBridgeRules = OrthographyBridgeDocType['rules'];
export type OrthographyBridgeEngine = OrthographyBridgeDocType['engine'];
export type OrthographyBridgeSampleCase = NonNullable<OrthographyBridgeDocType['sampleCases']>[number];
type OrthographyNormalizationForm = NonNullable<OrthographyBridgeRules['normalizeInput']>;

type ParsedBridgeMapping = {
  from: string;
  to: string;
  raw: string;
  hasSeparator: boolean;
};

type ParsedIcuReplaceRule = {
  kind: 'replace';
  raw: string;
  source: string;
  replacement: string;
  mode: 'text' | 'regex';
  hasSeparator: boolean;
  regex?: RegExp;
  error?: string;
};

export type OrthographyBridgeSampleCaseResult = OrthographyBridgeSampleCase & {
  actualOutput: string;
  matchesExpectation?: boolean;
};

type ParsedIcuRule =
  | { kind: 'normalize'; form: OrthographyNormalizationForm; raw: string }
  | ParsedIcuReplaceRule;

const SUPPORTED_NORMALIZATION_FORMS = new Set<OrthographyNormalizationForm>(['NFC', 'NFD', 'NFKC', 'NFKD']);

function splitBridgeRuleText(ruleText: string): string[] {
  return ruleText
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));
}

function parseBridgeMappingsDetailed(ruleText: string): ParsedBridgeMapping[] {
  return splitBridgeRuleText(ruleText)
    .map((line) => {
      const separator = line.includes('=>')
        ? '=>'
        : line.includes('->')
        ? '->'
        : line.includes('>')
        ? '>'
        : line.includes('=')
        ? '='
        : line.includes('\t')
        ? '\t'
        : '';
      if (!separator) {
        return { from: line, to: '', raw: line, hasSeparator: false };
      }
      const [from, ...rest] = line.split(separator);
      return {
        from: (from ?? '').trim(),
        to: rest.join(separator).trim(),
        raw: line,
        hasSeparator: true,
      };
    })
    .filter((mapping) => mapping.from.length > 0)
    .sort((left, right) => right.from.length - left.from.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureGlobalFlag(flags: string): string {
  return flags.includes('g') ? flags : `${flags}g`;
}

function parseIcuReplacementRule(
  line: string,
  caseSensitive: boolean,
): ParsedIcuRule {
  const regexMatch = line.match(/^\/((?:\\\/|[^/])+)\/([dgimsuvy]*)\s*(=>|->|>|=)\s*(.*)$/u);
  if (regexMatch) {
    const patternSource = regexMatch[1] ?? '';
    const flagsSource = regexMatch[2] ?? '';
    const replacement = regexMatch[4] ?? '';
    const nextFlags = ensureGlobalFlag(caseSensitive ? flagsSource : `${flagsSource}i`);
    try {
      return {
        kind: 'replace',
        raw: line,
        source: patternSource,
        replacement,
        mode: 'regex',
        hasSeparator: true,
        regex: new RegExp(patternSource, nextFlags),
      };
    } catch (error) {
      return {
        kind: 'replace',
        raw: line,
        source: patternSource,
        replacement,
        mode: 'regex',
        hasSeparator: true,
        error: error instanceof Error ? error.message : 'invalid regex',
      };
    }
  }

  const mapping = parseBridgeMappingsDetailed(line)[0];
  if (!mapping) {
    return {
      kind: 'replace',
      raw: line,
      source: line,
      replacement: '',
      mode: 'text',
      hasSeparator: false,
    };
  }

  return {
    kind: 'replace',
    raw: line,
    source: mapping.from,
    replacement: mapping.to,
    mode: 'text',
    hasSeparator: mapping.hasSeparator,
  };
}

function parseIcuRules(ruleText: string, caseSensitive: boolean): ParsedIcuRule[] {
  return splitBridgeRuleText(ruleText).map((line) => {
    if (line.startsWith('::')) {
      const directive = line.slice(2).trim().toUpperCase();
      if (SUPPORTED_NORMALIZATION_FORMS.has(directive as OrthographyNormalizationForm)) {
        return { kind: 'normalize', form: directive as OrthographyNormalizationForm, raw: line };
      }
      return {
        kind: 'replace',
        raw: line,
        source: directive,
        replacement: '',
        mode: 'text',
        hasSeparator: false,
        error: `unsupported directive: ${directive}`,
      };
    }

    return parseIcuReplacementRule(line, caseSensitive);
  });
}

export function parseBridgeMappings(ruleText: string): Array<{ from: string; to: string }> {
  return parseBridgeMappingsDetailed(ruleText).map(({ from, to }) => ({ from, to }));
}

export function parseBridgeSampleCases(sampleText: string): OrthographyBridgeSampleCase[] {
  return sampleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'))
    .map((line) => {
      const separator = line.includes('=>')
        ? '=>'
        : line.includes('->')
        ? '->'
        : line.includes('\t')
        ? '\t'
        : '';
      if (!separator) {
        return { input: line };
      }
      const [input, ...rest] = line.split(separator);
      const expectedOutput = rest.join(separator).trim();
      return {
        input: (input ?? '').trim(),
        ...(expectedOutput ? { expectedOutput } : {}),
      };
    })
    .filter((sampleCase) => sampleCase.input.length > 0);
}

export function buildBridgeRulesFromRuleText(
  ruleText: string,
  input?: Partial<OrthographyBridgeRules>,
): OrthographyBridgeRules {
  return {
    ...input,
    ruleText,
    mappings: parseBridgeMappings(ruleText),
  };
}

export function validateOrthographyBridge(input: {
  engine: OrthographyBridgeEngine;
  rules: OrthographyBridgeRules;
}): { issues: string[] } {
  const issues: string[] = [];
  const ruleText = input.rules.ruleText?.trim() ?? '';
  const mappingsDetailed = ruleText.length > 0
    ? parseBridgeMappingsDetailed(ruleText)
    : (input.rules.mappings ?? []).map((mapping) => ({
      from: mapping.from,
      to: mapping.to,
      raw: `${mapping.from} => ${mapping.to}`,
      hasSeparator: true,
    }));

  if (input.engine === 'manual') {
    return { issues };
  }

  if (input.engine === 'icu-rule') {
    const icuRules: ParsedIcuRule[] = ruleText.length > 0
      ? parseIcuRules(ruleText, input.rules.caseSensitive ?? true)
      : (input.rules.mappings ?? []).map((mapping) => ({
        kind: 'replace' as const,
        raw: `${mapping.from} => ${mapping.to}`,
        source: mapping.from,
        replacement: mapping.to,
        mode: 'text' as const,
        hasSeparator: true,
      }));

    if (icuRules.length === 0) {
      issues.push('请至少填写一条 ICU 规则、正则规则或规范化指令。');
      return { issues };
    }

    const replaceRules = icuRules.filter((rule): rule is ParsedIcuReplaceRule => rule.kind === 'replace');
    const malformedRules = replaceRules.filter((rule) => !rule.hasSeparator && !rule.error);
    if (malformedRules.length > 0) {
      issues.push(`以下 ICU 规则缺少分隔符：${malformedRules.slice(0, 3).map((rule) => rule.raw).join('；')}`);
    }

    const invalidRules = replaceRules.filter((rule) => rule.error);
    if (invalidRules.length > 0) {
      issues.push(`以下 ICU 规则无效：${invalidRules.slice(0, 3).map((rule) => `${rule.raw}（${rule.error}）`).join('；')}`);
    }

    return { issues };
  }

  if (mappingsDetailed.length === 0) {
    issues.push('请至少填写一条映射规则。');
    return { issues };
  }

  const invalidMappings = mappingsDetailed.filter((mapping) => !mapping.hasSeparator);
  if (invalidMappings.length > 0) {
    issues.push(`以下规则缺少分隔符：${invalidMappings.slice(0, 3).map((mapping) => mapping.raw).join('；')}`);
  }

  const duplicatedSources = new Set<string>();
  const seenSources = new Set<string>();
  for (const mapping of mappingsDetailed) {
    const sourceKey = input.rules.caseSensitive === false ? mapping.from.toLocaleLowerCase() : mapping.from;
    if (seenSources.has(sourceKey)) {
      duplicatedSources.add(mapping.from);
      continue;
    }
    seenSources.add(sourceKey);
  }
  if (duplicatedSources.size > 0) {
    issues.push(`存在重复来源规则：${Array.from(duplicatedSources).join('、')}`);
  }

  return { issues };
}

function normalizeByForm(value: string, form?: OrthographyBridgeRules['normalizeInput']): string {
  return form ? value.normalize(form) : value;
}

function replaceWithMappings(
  input: string,
  mappings: Array<{ from: string; to: string }>,
  caseSensitive = true,
): string {
  if (mappings.length === 0) return input;

  let index = 0;
  let output = '';
  const normalizedInput = caseSensitive ? input : input.toLocaleLowerCase();
  const normalizedMappings = mappings.map((mapping) => ({
    ...mapping,
    fromMatch: caseSensitive ? mapping.from : mapping.from.toLocaleLowerCase(),
  }));

  while (index < input.length) {
    const matched = normalizedMappings.find((mapping) => normalizedInput.startsWith(mapping.fromMatch, index));
    if (!matched) {
      output += input[index] ?? '';
      index += 1;
      continue;
    }
    output += matched.to;
    index += matched.from.length;
  }

  return output;
}

function replaceTextSequentially(
  input: string,
  source: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  if (!source) return input;
  return input.replace(new RegExp(escapeRegExp(source), caseSensitive ? 'g' : 'gi'), replacement);
}

function applyIcuRules(input: string, rules: OrthographyBridgeRules): string {
  const caseSensitive = rules.caseSensitive ?? true;
  const operations: ParsedIcuRule[] = rules.ruleText?.trim()
    ? parseIcuRules(rules.ruleText, caseSensitive)
    : (rules.mappings ?? []).map((mapping) => ({
      kind: 'replace' as const,
      raw: `${mapping.from} => ${mapping.to}`,
      source: mapping.from,
      replacement: mapping.to,
      mode: 'text' as const,
      hasSeparator: true,
    }));

  return operations.reduce((value, operation) => {
    if (operation.kind === 'normalize') {
      return value.normalize(operation.form);
    }
    if (!operation.hasSeparator || operation.error) {
      return value;
    }
    if (operation.mode === 'regex') {
      return value.replace(operation.regex!, operation.replacement);
    }
    return replaceTextSequentially(value, operation.source, operation.replacement, caseSensitive);
  }, input);
}

export function previewOrthographyBridge(input: {
  engine: OrthographyBridgeEngine;
  rules: OrthographyBridgeRules;
  text: string;
}): string {
  const normalizedInput = normalizeByForm(input.text, input.rules.normalizeInput);
  if (input.engine === 'manual') {
    return normalizeByForm(normalizedInput, input.rules.normalizeOutput);
  }

  if (input.engine === 'icu-rule') {
    const bridgedText = applyIcuRules(normalizedInput, input.rules);
    return normalizeByForm(bridgedText, input.rules.normalizeOutput);
  }

  const mappings = (input.rules.mappings && input.rules.mappings.length > 0)
    ? input.rules.mappings
    : parseBridgeMappings(input.rules.ruleText ?? '');
  const bridgedText = replaceWithMappings(
    normalizedInput,
    mappings,
    input.rules.caseSensitive ?? true,
  );
  return normalizeByForm(bridgedText, input.rules.normalizeOutput);
}

export function evaluateOrthographyBridgeSampleCases(input: {
  engine: OrthographyBridgeEngine;
  rules: OrthographyBridgeRules;
  sampleCases: OrthographyBridgeSampleCase[];
}): OrthographyBridgeSampleCaseResult[] {
  return input.sampleCases.map((sampleCase) => {
    const actualOutput = previewOrthographyBridge({
      engine: input.engine,
      rules: input.rules,
      text: sampleCase.input,
    });
    return {
      ...sampleCase,
      actualOutput,
      ...(sampleCase.expectedOutput !== undefined
        ? { matchesExpectation: actualOutput === sampleCase.expectedOutput }
        : {}),
    };
  });
}
