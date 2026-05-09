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

  const firstPart = parts[0];
  if (typeof firstPart === 'string' && firstPart.length > 0 && /^[A-Za-z]{4}$/.test(firstPart)) {
    script = toTitleCaseSubtag(parts.shift() ?? '');
  }

  const secondPart = parts[0];
  if (
    typeof secondPart === 'string' &&
    secondPart.length > 0 &&
    /^(?:[A-Za-z]{2}|\d{3})$/.test(secondPart)
  ) {
    const nextRegion = parts.shift() ?? '';
    region = /^[A-Za-z]{2}$/.test(nextRegion) ? nextRegion.toUpperCase() : nextRegion;
  }

  const variants = parts.map((part) => part.toLowerCase()).filter((part) => part.length > 0);

  return {
    language,
    ...(script !== undefined ? { script } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(variants.length > 0 ? { variant: variants.join('-') } : {}),
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
  if (normalizedInput.length === 0) {
    return {};
  }

  try {
    const canonicalLocaleTag = new Intl.Locale(normalizedInput).toString();
    const parsed = parseCanonicalLocaleParts(canonicalLocaleTag);
    return {
      localeTag: canonicalLocaleTag,
      language: parsed.language,
      ...(parsed.script !== undefined ? { script: parsed.script } : {}),
      ...(parsed.region !== undefined ? { region: parsed.region } : {}),
      ...(parsed.variant !== undefined ? { variant: parsed.variant } : {}),
    };
  } catch {
    throw new Error(`localeTag 无效：${localeTag}`);
  }
}

function canonicalizeScriptTag(scriptTag: string | undefined): string | undefined {
  const normalizedInput = normalizeTagInput(scriptTag ?? '');
  if (normalizedInput.length === 0) {
    return undefined;
  }

  if (/^[A-Za-z]{4}$/.test(normalizedInput)) {
    return toTitleCaseSubtag(normalizedInput);
  }

  try {
    const localeSource = normalizedInput.includes('-') ? normalizedInput : `und-${normalizedInput}`;
    const parsed = parseCanonicalLocaleParts(new Intl.Locale(localeSource).toString());
    if (parsed.script !== undefined) {
      return parsed.script;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(`scriptTag 无效：${scriptTag}`);
}

function canonicalizeRegionTag(regionTag: string | undefined): string | undefined {
  const normalizedInput = normalizeTagInput(regionTag ?? '');
  if (normalizedInput.length === 0) {
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
    if (parsed.region !== undefined) {
      return parsed.region;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(`regionTag 无效：${regionTag}`);
}

function canonicalizeVariantTag(variantTag: string | undefined): string | undefined {
  const normalizedInput = normalizeTagInput(variantTag ?? '');
  if (normalizedInput.length === 0) {
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
  return normalizedInput !== undefined && normalizedInput.length > 0 ? normalizedInput : undefined;
}

function resolveLocaleLanguageId(localeLanguage: string | undefined): string | undefined {
  if (localeLanguage === undefined || localeLanguage.length === 0) {
    return undefined;
  }

  const mapped = toIso639_3(localeLanguage);
  if (mapped !== undefined) {
    return mapped;
  }
  if (/^[a-z]{3}$/.test(localeLanguage)) {
    return localeLanguage;
  }
  return undefined;
}

export function normalizeOrthographyIdentity(
  input: OrthographyIdentityInput,
): OrthographyIdentityInput {
  const normalizedLanguageId = canonicalizeLanguageId(input.languageId);
  const localeMetadata = canonicalizeLocaleTag(input.localeTag);
  const localeLanguageId = resolveLocaleLanguageId(localeMetadata.language);
  if (
    normalizedLanguageId !== undefined &&
    localeLanguageId !== undefined &&
    normalizedLanguageId !== localeLanguageId
  ) {
    throw new Error(
      `localeTag ${localeMetadata.localeTag} 与 languageId ${normalizedLanguageId} 不一致`,
    );
  }

  const explicitScriptTag = canonicalizeScriptTag(input.scriptTag);
  if (
    explicitScriptTag !== undefined &&
    localeMetadata.script !== undefined &&
    explicitScriptTag !== localeMetadata.script
  ) {
    throw new Error(
      `scriptTag ${explicitScriptTag} 与 localeTag ${localeMetadata.localeTag} 不一致`,
    );
  }

  const explicitRegionTag = canonicalizeRegionTag(input.regionTag);
  if (
    explicitRegionTag !== undefined &&
    localeMetadata.region !== undefined &&
    explicitRegionTag !== localeMetadata.region
  ) {
    throw new Error(
      `regionTag ${explicitRegionTag} 与 localeTag ${localeMetadata.localeTag} 不一致`,
    );
  }

  const explicitVariantTag = canonicalizeVariantTag(input.variantTag);
  if (
    explicitVariantTag !== undefined &&
    localeMetadata.variant !== undefined &&
    explicitVariantTag !== localeMetadata.variant
  ) {
    throw new Error(
      `variantTag ${explicitVariantTag} 与 localeTag ${localeMetadata.localeTag} 不一致`,
    );
  }

  const normalizedScriptTag = explicitScriptTag ?? localeMetadata.script;
  const normalizedRegionTag = explicitRegionTag ?? localeMetadata.region;
  const normalizedVariantTag = explicitVariantTag ?? localeMetadata.variant;

  return {
    ...(normalizedLanguageId !== undefined ? { languageId: normalizedLanguageId } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(normalizedScriptTag !== undefined ? { scriptTag: normalizedScriptTag } : {}),
    ...(localeMetadata.localeTag !== undefined ? { localeTag: localeMetadata.localeTag } : {}),
    ...(normalizedRegionTag !== undefined ? { regionTag: normalizedRegionTag } : {}),
    ...(normalizedVariantTag !== undefined ? { variantTag: normalizedVariantTag } : {}),
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
