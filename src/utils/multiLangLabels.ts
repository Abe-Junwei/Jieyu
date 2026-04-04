import type { MultiLangString } from '../db';

type DisplayLocale = 'zh-CN' | 'en-US';

type MultiLangLike = Record<string, string | undefined> | undefined | null;

export type MultiLangLabelEntry = {
  languageTag: string;
  label: string;
};

const PRIMARY_LABEL_KEYS = ['und', 'mul', 'zho', 'zh', 'cmn'] as const;
const ENGLISH_FALLBACK_KEYS = ['eng', 'en'] as const;
const CANONICAL_LABEL_KEYS = new Set<string>([...PRIMARY_LABEL_KEYS, ...ENGLISH_FALLBACK_KEYS]);

function readTrimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function listUniqueNonEmptyValues(input: MultiLangLike): string[] {
  if (!input) return [];
  return Array.from(new Set(
    Object.values(input)
      .map((value) => readTrimmedValue(value))
      .filter((value): value is string => Boolean(value)),
  ));
}

function readByPriority(input: MultiLangLike, keys: readonly string[]): string | undefined {
  if (!input) return undefined;
  for (const key of keys) {
    const resolved = readTrimmedValue(input[key]);
    if (resolved) return resolved;
  }
  return undefined;
}

function normalizeLanguageTag(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function appendAdditionalLabels(target: MultiLangString, labels: readonly MultiLangLabelEntry[]): void {
  labels.forEach(({ languageTag, label }) => {
    const normalizedTag = normalizeLanguageTag(languageTag);
    const normalizedLabel = readTrimmedValue(label);
    if (!normalizedTag || !normalizedLabel || CANONICAL_LABEL_KEYS.has(normalizedTag)) return;
    target[normalizedTag] = normalizedLabel;
  });
}

export function listUniqueNonEmptyMultiLangLabels(input: MultiLangLike): string[] {
  return listUniqueNonEmptyValues(input);
}

export function listAdditionalMultiLangLabelEntries(input: MultiLangLike): MultiLangLabelEntry[] {
  if (!input) return [];
  return Object.entries(input)
    .map(([languageTag, label]) => ({
      languageTag: normalizeLanguageTag(languageTag) ?? '',
      label: readTrimmedValue(label) ?? '',
    }))
    .filter((entry) => entry.languageTag && entry.label && !CANONICAL_LABEL_KEYS.has(entry.languageTag));
}

export function readPrimaryMultiLangLabel(input: MultiLangLike): string | undefined {
  return readByPriority(input, [...PRIMARY_LABEL_KEYS, ...ENGLISH_FALLBACK_KEYS])
    ?? listUniqueNonEmptyValues(input)[0];
}

export function readEnglishFallbackMultiLangLabel(input: MultiLangLike): string | undefined {
  return readByPriority(input, [...ENGLISH_FALLBACK_KEYS, ...PRIMARY_LABEL_KEYS])
    ?? listUniqueNonEmptyValues(input)[0];
}

export function buildPrimaryAndEnglishLabels(input: {
  primaryLabel?: string;
  englishFallbackLabel?: string;
  existing?: MultiLangLike;
  additionalLabels?: readonly MultiLangLabelEntry[];
}): MultiLangString {
  const nextLabels: MultiLangString = {};

  if (input.additionalLabels !== undefined) {
    appendAdditionalLabels(nextLabels, input.additionalLabels);
  } else {
    appendAdditionalLabels(nextLabels, listAdditionalMultiLangLabelEntries(input.existing));
  }

  const primaryLabel = readTrimmedValue(input.primaryLabel);
  const englishFallbackLabel = readTrimmedValue(input.englishFallbackLabel);

  if (primaryLabel) nextLabels.und = primaryLabel;
  if (englishFallbackLabel) nextLabels.eng = englishFallbackLabel;

  return nextLabels;
}

export function readLocalizedMultiLangLabel(input: MultiLangLike, locale?: DisplayLocale): string | undefined {
  if (!input) return undefined;

  const preferredKeys = locale === 'zh-CN'
    ? ['zho', 'zh', 'cmn', 'und', 'mul', 'eng', 'en']
    : ['eng', 'en', 'und', 'mul', 'zho', 'zh', 'cmn'];

  for (const key of preferredKeys) {
    const resolved = readTrimmedValue(input[key]);
    if (resolved) return resolved;
  }

  return listUniqueNonEmptyValues(input)[0];
}

export function readAnyMultiLangLabel(input: MultiLangLike): string | undefined {
  return readPrimaryMultiLangLabel(input);
}