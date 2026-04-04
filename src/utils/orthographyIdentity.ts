import type { OrthographyDocType } from '../db';
import { toIso639_3 } from './langMapping';

type OrthographyIdentityInput = Pick<
  OrthographyDocType,
  'languageId' | 'type' | 'scriptTag' | 'localeTag' | 'regionTag' | 'variantTag'
>;

type CanonicalLocaleParts = {
  language: string;
  script?: string;
  region?: string;
  variant?: string;
};

function normalizeTagInput(value: string): string {
  return value.trim().replace(/_/g, '-').replace(/-{2,}/g, '-');
}

function toTitleCaseSubtag(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function parseCanonicalLocaleParts(localeTag: string): CanonicalLocaleParts {
  const parts = localeTag.split('-').filter(Boolean);
  const language = (parts.shift() ?? '').toLowerCase();
  let script: string | undefined;
  let region: string | undefined;

  if (parts[0] && /^[A-Za-z]{4}$/.test(parts[0])) {
    script = toTitleCaseSubtag(parts.shift() ?? '');
  }
  if (parts[0] && /^(?:[A-Za-z]{2}|\d{3})$/.test(parts[0])) {
    const nextRegion = parts.shift() ?? '';
    region = /^[A-Za-z]{2}$/.test(nextRegion) ? nextRegion.toUpperCase() : nextRegion;
  }

  const variants = parts
    .map((part) => part.toLowerCase())
    .filter(Boolean);

  return {
    language,
    ...(script ? { script } : {}),
    ...(region ? { region } : {}),
    ...(variants.length ? { variant: variants.join('-') } : {}),
  };
}

function canonicalizeLocaleTag(localeTag: string | undefined): {
  localeTag?: string;
  language?: string;
  script?: string;
  region?: string;
  variant?: string;
} {
  const normalizedInput = normalizeTagInput(localeTag ?? '');
  if (!normalizedInput) {
    return {};
  }

  try {
    const canonicalLocaleTag = new Intl.Locale(normalizedInput).toString();
    const parsed = parseCanonicalLocaleParts(canonicalLocaleTag);
    return {
      localeTag: canonicalLocaleTag,
      language: parsed.language,
      ...(parsed.script ? { script: parsed.script } : {}),
      ...(parsed.region ? { region: parsed.region } : {}),
      ...(parsed.variant ? { variant: parsed.variant } : {}),
    };
  } catch {
    throw new Error(`localeTag 无效：${localeTag}`);
  }
}

function canonicalizeScriptTag(scriptTag: string | undefined): string | undefined {
  const normalizedInput = normalizeTagInput(scriptTag ?? '');
  if (!normalizedInput) {
    return undefined;
  }

  if (/^[A-Za-z]{4}$/.test(normalizedInput)) {
    return toTitleCaseSubtag(normalizedInput);
  }

  try {
    const localeSource = normalizedInput.includes('-') ? normalizedInput : `und-${normalizedInput}`;
    const parsed = parseCanonicalLocaleParts(new Intl.Locale(localeSource).toString());
    if (parsed.script) {
      return parsed.script;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(`scriptTag 无效：${scriptTag}`);
}

function canonicalizeRegionTag(regionTag: string | undefined): string | undefined {
  const normalizedInput = normalizeTagInput(regionTag ?? '');
  if (!normalizedInput) {
    return undefined;
  }

  if (/^[A-Za-z]{2}$/.test(normalizedInput)) {
    return normalizedInput.toUpperCase();
  }
  if (/^\d{3}$/.test(normalizedInput)) {
    return normalizedInput;
  }

  try {
    const localeSource = normalizedInput.includes('-') ? normalizedInput : `und-${normalizedInput}`;
    const parsed = parseCanonicalLocaleParts(new Intl.Locale(localeSource).toString());
    if (parsed.region) {
      return parsed.region;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(`regionTag 无效：${regionTag}`);
}

function canonicalizeVariantTag(variantTag: string | undefined): string | undefined {
  const normalizedInput = normalizeTagInput(variantTag ?? '');
  if (!normalizedInput) {
    return undefined;
  }

  const subtags = normalizedInput.split('-').filter(Boolean);
  if (subtags.length === 0) {
    return undefined;
  }

  const canonicalSubtags = subtags.map((subtag) => {
    const normalizedSubtag = subtag.toLowerCase();
    if (/^(?:[0-9][a-z0-9]{3}|[a-z0-9]{5,8})$/.test(normalizedSubtag)) {
      return normalizedSubtag;
    }
    throw new Error(`variantTag 无效：${variantTag}`);
  });

  return canonicalSubtags.join('-');
}

function canonicalizeLanguageId(languageId: string | undefined): string | undefined {
  const normalizedInput = languageId?.trim().toLowerCase();
  return normalizedInput ? normalizedInput : undefined;
}

function resolveLocaleLanguageId(localeLanguage: string | undefined): string | undefined {
  if (!localeLanguage) {
    return undefined;
  }

  const mapped = toIso639_3(localeLanguage);
  if (mapped) {
    return mapped;
  }
  if (/^[a-z]{3}$/.test(localeLanguage)) {
    return localeLanguage;
  }
  return undefined;
}

export function normalizeOrthographyIdentity(input: OrthographyIdentityInput): OrthographyIdentityInput {
  const normalizedLanguageId = canonicalizeLanguageId(input.languageId);
  const localeMetadata = canonicalizeLocaleTag(input.localeTag);
  const localeLanguageId = resolveLocaleLanguageId(localeMetadata.language);
  if (normalizedLanguageId && localeLanguageId && normalizedLanguageId !== localeLanguageId) {
    throw new Error(`localeTag ${localeMetadata.localeTag} 与 languageId ${normalizedLanguageId} 不一致`);
  }

  const explicitScriptTag = canonicalizeScriptTag(input.scriptTag);
  if (explicitScriptTag && localeMetadata.script && explicitScriptTag !== localeMetadata.script) {
    throw new Error(`scriptTag ${explicitScriptTag} 与 localeTag ${localeMetadata.localeTag} 不一致`);
  }

  const explicitRegionTag = canonicalizeRegionTag(input.regionTag);
  if (explicitRegionTag && localeMetadata.region && explicitRegionTag !== localeMetadata.region) {
    throw new Error(`regionTag ${explicitRegionTag} 与 localeTag ${localeMetadata.localeTag} 不一致`);
  }

  const explicitVariantTag = canonicalizeVariantTag(input.variantTag);
  if (explicitVariantTag && localeMetadata.variant && explicitVariantTag !== localeMetadata.variant) {
    throw new Error(`variantTag ${explicitVariantTag} 与 localeTag ${localeMetadata.localeTag} 不一致`);
  }

  const normalizedScriptTag = explicitScriptTag ?? localeMetadata.script;
  const normalizedRegionTag = explicitRegionTag ?? localeMetadata.region;
  const normalizedVariantTag = explicitVariantTag ?? localeMetadata.variant;

  return {
    ...(normalizedLanguageId ? { languageId: normalizedLanguageId } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(normalizedScriptTag ? { scriptTag: normalizedScriptTag } : {}),
    ...(localeMetadata.localeTag ? { localeTag: localeMetadata.localeTag } : {}),
    ...(normalizedRegionTag ? { regionTag: normalizedRegionTag } : {}),
    ...(normalizedVariantTag ? { variantTag: normalizedVariantTag } : {}),
  };
}

export function buildOrthographyIdentityKey(input: OrthographyIdentityInput): string {
  const normalized = normalizeOrthographyIdentity(input);
  return [
    normalized.languageId ?? '',
    normalized.type ?? 'practical',
    normalized.scriptTag ?? '',
    normalized.regionTag ?? '',
    normalized.variantTag ?? '',
  ].join('|');
}

export function hasSameOrthographyIdentity(
  left: OrthographyIdentityInput,
  right: OrthographyIdentityInput,
): boolean {
  return buildOrthographyIdentityKey(left) === buildOrthographyIdentityKey(right);
}