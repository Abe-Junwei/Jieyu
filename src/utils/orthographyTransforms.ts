import type { OrthographyTransformDocType } from '../db';

export type OrthographyTransformRules = OrthographyTransformDocType['rules'];
export type OrthographyTransformEngine = OrthographyTransformDocType['engine'];
export type OrthographyTransformSampleCase = NonNullable<OrthographyTransformDocType['sampleCases']>[number];

type ParsedTransformMapping = {
  from: string;
  to: string;
  raw: string;
  hasSeparator: boolean;
};

export type OrthographyTransformSampleCaseResult = OrthographyTransformSampleCase & {
  actualOutput: string;
  matchesExpectation?: boolean;
};

function splitTransformRuleText(ruleText: string): string[] {
  return ruleText
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));
}

function parseTransformMappingsDetailed(ruleText: string): ParsedTransformMapping[] {
  return splitTransformRuleText(ruleText)
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

export function parseTransformMappings(ruleText: string): Array<{ from: string; to: string }> {
  return parseTransformMappingsDetailed(ruleText).map(({ from, to }) => ({ from, to }));
}

export function parseTransformSampleCases(sampleText: string): OrthographyTransformSampleCase[] {
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

export function buildTransformRulesFromRuleText(
  ruleText: string,
  input?: Partial<OrthographyTransformRules>,
): OrthographyTransformRules {
  return {
    ...input,
    ruleText,
    mappings: parseTransformMappings(ruleText),
  };
}

export function validateOrthographyTransform(input: {
  engine: OrthographyTransformEngine;
  rules: OrthographyTransformRules;
}): { issues: string[] } {
  const issues: string[] = [];
  const ruleText = input.rules.ruleText?.trim() ?? '';
  const mappingsDetailed = ruleText.length > 0
    ? parseTransformMappingsDetailed(ruleText)
    : (input.rules.mappings ?? []).map((mapping) => ({
      from: mapping.from,
      to: mapping.to,
      raw: `${mapping.from} => ${mapping.to}`,
      hasSeparator: true,
    }));

  if (input.engine === 'manual') {
    return { issues };
  }

  if (mappingsDetailed.length === 0) {
    issues.push(input.engine === 'icu-rule' ? '请至少填写一条 ICU 规则或映射规则。' : '请至少填写一条映射规则。');
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

function normalizeByForm(value: string, form?: OrthographyTransformRules['normalizeInput']): string {
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

export function previewOrthographyTransform(input: {
  engine: OrthographyTransformEngine;
  rules: OrthographyTransformRules;
  text: string;
}): string {
  const normalizedInput = normalizeByForm(input.text, input.rules.normalizeInput);
  if (input.engine === 'manual') {
    return normalizeByForm(normalizedInput, input.rules.normalizeOutput);
  }

  const mappings = (input.rules.mappings && input.rules.mappings.length > 0)
    ? input.rules.mappings
    : parseTransformMappings(input.rules.ruleText ?? '');
  const transformed = replaceWithMappings(
    normalizedInput,
    mappings,
    input.rules.caseSensitive ?? true,
  );
  return normalizeByForm(transformed, input.rules.normalizeOutput);
}

export function evaluateOrthographyTransformSampleCases(input: {
  engine: OrthographyTransformEngine;
  rules: OrthographyTransformRules;
  sampleCases: OrthographyTransformSampleCase[];
}): OrthographyTransformSampleCaseResult[] {
  return input.sampleCases.map((sampleCase) => {
    const actualOutput = previewOrthographyTransform({
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
