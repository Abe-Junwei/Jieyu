import { newId } from '../../utils/transcriptionFormatters';
import type {
  LanguageCatalogHistoryAction,
  LanguageCatalogHistoryDocType,
  LanguageCatalogSourceType,
} from '../../db';
import type { LanguageCatalogEntry } from './languageCatalogTypes';

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeComparableValue(nestedValue)]),
    );
  }
  return value ?? null;
}

function isMeaningfulPatchValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function buildComparableHistoryPatch(entry: LanguageCatalogEntry | null): Record<string, unknown> {
  if (!entry) {
    return {};
  }

  const normalizedDisplayNames = entry.displayNames
    .map((row) => ({
      locale: row.locale,
      role: row.role,
      value: row.value,
      isPreferred: Boolean(row.isPreferred),
      sourceType: row.sourceType,
      ...(row.reviewStatus ? { reviewStatus: row.reviewStatus } : {}),
      persisted: row.persisted,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const normalizedAliases = [...entry.aliases].sort((left, right) => left.localeCompare(right));
  const normalizedNotes = entry.notes
    ? Object.fromEntries(
        Object.entries(entry.notes).sort(([left], [right]) => left.localeCompare(right)),
      )
    : undefined;

  return {
    languageCode: entry.languageCode,
    canonicalTag: entry.canonicalTag ?? null,
    iso6391: entry.iso6391 ?? null,
    iso6392B: entry.iso6392B ?? null,
    iso6392T: entry.iso6392T ?? null,
    iso6393: entry.iso6393 ?? null,
    glottocode: entry.glottocode ?? null,
    wikidataId: entry.wikidataId ?? null,
    englishName: entry.englishName,
    localName: entry.localName,
    nativeName: entry.nativeName ?? null,
    aliases: normalizedAliases,
    scope: entry.scope ?? null,
    genus: entry.genus ?? null,
    subfamily: entry.subfamily ?? null,
    branch: entry.branch ?? null,
    classificationPath: entry.classificationPath ?? null,
    macrolanguage: entry.macrolanguage ?? null,
    languageType: entry.languageType ?? null,
    modality: entry.modality ?? null,
    dialects: entry.dialects ?? null,
    vernaculars: entry.vernaculars ?? null,
    countries: entry.countries?.length
      ? [...entry.countries].sort((left, right) => left.localeCompare(right))
      : null,
    countriesOfficial: entry.countriesOfficial?.length
      ? [...entry.countriesOfficial].sort((left, right) => left.localeCompare(right))
      : null,
    reviewStatus: entry.reviewStatus ?? null,
    visibility: entry.visibility,
    ...(normalizedNotes ? { notes: normalizedNotes } : {}),
    ...(normalizedDisplayNames.length > 0 ? { displayNames: normalizedDisplayNames } : {}),
  };
}

export function computeHistoryDiff(
  beforeEntry: LanguageCatalogEntry | null,
  afterEntry: LanguageCatalogEntry | null,
): {
  changedFields: string[];
  beforePatch?: Record<string, unknown>;
  afterPatch?: Record<string, unknown>;
} {
  const beforePatchSource = buildComparableHistoryPatch(beforeEntry);
  const afterPatchSource = buildComparableHistoryPatch(afterEntry);
  const fieldNames = Array.from(
    new Set([...Object.keys(beforePatchSource), ...Object.keys(afterPatchSource)]),
  ).sort((left, right) => left.localeCompare(right));
  const changedFields: string[] = [];
  const beforePatch: Record<string, unknown> = {};
  const afterPatch: Record<string, unknown> = {};

  fieldNames.forEach((fieldName) => {
    const beforeValue = normalizeComparableValue(beforePatchSource[fieldName]);
    const afterValue = normalizeComparableValue(afterPatchSource[fieldName]);
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      return;
    }

    changedFields.push(fieldName);
    if (isMeaningfulPatchValue(beforeValue)) {
      beforePatch[fieldName] = beforeValue;
    }
    if (isMeaningfulPatchValue(afterValue)) {
      afterPatch[fieldName] = afterValue;
    }
  });

  return {
    changedFields,
    ...(Object.keys(beforePatch).length > 0 ? { beforePatch } : {}),
    ...(Object.keys(afterPatch).length > 0 ? { afterPatch } : {}),
  };
}

export function buildHistoryRecord(input: {
  languageId: string;
  action: LanguageCatalogHistoryAction;
  summary: string;
  changedFields?: string[];
  reason?: string;
  reasonCode?: string;
  sourceType?: LanguageCatalogSourceType;
  beforePatch?: Record<string, unknown>;
  afterPatch?: Record<string, unknown>;
  sourceRef?: string;
  snapshot?: Record<string, unknown>;
}): LanguageCatalogHistoryDocType {
  return {
    id: newId('langhist'),
    languageId: input.languageId,
    action: input.action,
    summary: input.summary,
    ...(input.changedFields && input.changedFields.length > 0
      ? { changedFields: input.changedFields }
      : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.beforePatch ? { beforePatch: input.beforePatch } : {}),
    ...(input.afterPatch ? { afterPatch: input.afterPatch } : {}),
    ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
    actorType: 'human',
    createdAt: new Date().toISOString(),
  };
}
