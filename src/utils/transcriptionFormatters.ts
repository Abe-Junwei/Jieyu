import type { LayerDocType } from '../db';
import type { LanguageSearchLocale } from './langMapping';
import { getLanguageCatalogEntry, getLanguageDisplayName } from './langMapping';
import { listUniqueNonEmptyMultiLangLabels, readAnyMultiLangLabel, readLocalizedMultiLangLabel } from './multiLangLabels';

export const LANGUAGE_NAME_MAP: Record<string, string> = {
  cmn: '\u666e\u901a\u8bdd',
  zho: '\u4e2d\u6587',
  yue: '\u7ca4\u8bed',
  eng: '\u82f1\u8bed',
  jpn: '\u65e5\u8bed',
  kor: '\u97e9\u8bed',
  fra: '\u6cd5\u8bed',
  deu: '\u5fb7\u8bed',
  spa: '\u897f\u73ed\u7259\u8bed',
  rus: '\u4fc4\u8bed',
  ara: '\u963f\u62c9\u4f2f\u8bed',
};

/** BCP 47 \u5df2\u77e5\u53d8\u4f53\u6807\u7b7e\u7684\u4eba\u7c7b\u53ef\u8bfb\u540d | Human-readable names for well-known BCP 47 variant subtags */
const VARIANT_LABEL_MAP: Record<string, string> = {
  fonipa: 'IPA',
  fonupa: 'UPA',
  fonxsamp: 'X-SAMPA',
  pinyin: '\u62fc\u97f3',
  wadegile: '\u5a01\u59a5\u739b',
  jyutping: '\u7ca4\u62fc',
};

/**
 * \u89e3\u6790 BCP 47 \u8bed\u8a00\u6807\u7b7e | Parse a BCP 47 language tag into constituent subtags.
 * \u4f8b: "mvm-fonipa-x-emc" → { primary: 'mvm', variants: ['fonipa'], privateUse: 'x-emc' }
 */
export function parseBcp47(tag: string): {
  primary: string;
  script?: string;
  region?: string;
  variants: string[];
  extensions: string[];
  privateUse?: string;
  full: string;
} {
  const full = tag.trim();
  if (!full) return { primary: '', variants: [], extensions: [], full: '' };

  // \u79c1\u7528\u6269\u5c55 x-... \u5728\u6700\u540e | Private-use extension comes last
  const xIdx = full.search(/\b(x-)/i);
  const mainPart = xIdx >= 0 ? full.slice(0, xIdx).replace(/-$/, '') : full;
  const privateUse = xIdx >= 0 ? full.slice(xIdx) : undefined;

  const subtags = mainPart.split('-');
  const primary = (subtags[0] ?? '').toLowerCase();
  let script: string | undefined;
  let region: string | undefined;
  const variants: string[] = [];
  const extensions: string[] = [];

  for (let i = 1; i < subtags.length; i++) {
    const st = subtags[i]!;
    if (st.length === 4 && /^[A-Za-z]{4}$/.test(st) && !script) {
      // \u811a\u672c\u5b50\u6807\u7b7e（4 \u5b57\u6bcd） | Script subtag (4 letters)
      script = st;
    } else if (st.length === 2 && /^[A-Za-z]{2}$/.test(st) && !region) {
      // \u533a\u57df\u5b50\u6807\u7b7e（2 \u5b57\u6bcd） | Region subtag (2 letters)
      region = st.toUpperCase();
    } else if (st.length === 3 && /^[0-9]{3}$/.test(st) && !region) {
      // \u533a\u57df\u5b50\u6807\u7b7e（3 \u6570\u5b57） | Region subtag (3 digits)
      region = st;
    } else if (st.length >= 5 || (st.length === 4 && /^[0-9]/.test(st))) {
      // \u53d8\u4f53\u5b50\u6807\u7b7e | Variant subtag
      variants.push(st.toLowerCase());
    } else if (st.length === 1) {
      // \u6269\u5c55\u524d\u7f00 | Extension prefix singleton — collect rest until next singleton/end
      const extParts = [st];
      while (i + 1 < subtags.length && subtags[i + 1]!.length > 1) {
        extParts.push(subtags[++i]!);
      }
      extensions.push(extParts.join('-'));
    }
  }

  return {
    primary,
    ...(script ? { script } : {}),
    ...(region ? { region } : {}),
    variants,
    extensions,
    ...(privateUse ? { privateUse } : {}),
    full,
  };
}

/**
 * \u4ece BCP 47 \u6807\u7b7e\u751f\u6210\u4eba\u7c7b\u53ef\u8bfb\u7684\u5c55\u793a\u540d | Generate a human-readable display name from a BCP 47 tag.
 * \u4f8b: "mvm-fonipa-x-emc" → "mvm (IPA, x-emc)"
 * \u4f8b: "cmn" → "\u666e\u901a\u8bdd cmn"
 */
export function formatBcp47Label(tag: string, locale: LanguageSearchLocale = 'zh-CN'): string {
  const parsed = parseBcp47(tag);
  if (!parsed.primary) {
    return locale === 'zh-CN' ? '\u672a\u8bbe\u7f6e\u8bed\u8a00' : 'Language not set';
  }

  const catalogEntry = getLanguageCatalogEntry(parsed.primary);
  const canonicalCode = catalogEntry?.iso6393 ?? parsed.primary;
  const baseName = catalogEntry
    ? getLanguageDisplayName(canonicalCode, locale)
    : (LANGUAGE_NAME_MAP[canonicalCode]
      ?? COMMON_LANGUAGES.find((l) => l.code === canonicalCode)?.label);

  const extras: string[] = [];
  for (const v of parsed.variants) {
    extras.push(VARIANT_LABEL_MAP[v] ?? v);
  }
  if (parsed.privateUse) extras.push(parsed.privateUse);

  const base = baseName ? `${baseName} ${canonicalCode}` : canonicalCode;
  return extras.length > 0 ? `${base} (${extras.join(', ')})` : base;
}

/**
 * \u5224\u65ad tier \u540d\u79f0\u662f\u5426\u50cf BCP 47 \u6807\u7b7e，\u5982\u679c\u662f\u5219\u751f\u6210\u4eba\u7c7b\u53ef\u8bfb\u540d | Detect if a tier name looks like a BCP 47 tag and humanize it.
 * \u4f8b: "mvm-fonipa-x-emc" → "mvm (IPA, x-emc)"  (\u662f BCP 47 → \u8f6c\u6362)
 * \u4f8b: "English translation" → "English translation"  (\u666e\u901a\u540d\u79f0 → \u4fdd\u6301\u539f\u6837)
 * \u4f8b: "default" → "default"  (\u5355\u8bcd → \u4fdd\u6301\u539f\u6837)
 */
export function humanizeTierName(tierName: string): string {
  const trimmed = tierName.trim();
  if (!trimmed) return 'Transcription';
  // \u542b\u7a7a\u683c\u7684\u4e00\u5b9a\u4e0d\u662f BCP 47 \u6807\u7b7e | Contains space → not a BCP 47 tag
  if (/\s/.test(trimmed)) return trimmed;
  const parsed = parseBcp47(trimmed);
  // \u4e3b\u8bed\u8a00\u5b50\u6807\u7b7e 2-3 \u5b57\u6bcd + \u81f3\u5c11\u6709\u53ef\u89e3\u6790\u7684\u5b50\u6807\u8bb0 → \u89c6\u4e3a BCP 47 | Primary is 2-3 letters with subtags → BCP 47
  const isPrimary = /^[a-z]{2,3}$/.test(parsed.primary);
  const hasSubtags = parsed.variants.length > 0 || parsed.extensions.length > 0
    || parsed.script !== undefined || parsed.region !== undefined || parsed.privateUse !== undefined;
  if (isPrimary && hasSubtags) {
    return formatBcp47Label(trimmed);
  }
  return trimmed;
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const ss = (safe % 60).toFixed(1).padStart(4, '0');
  return `${mm}:${ss}`;
}

export function normalizeSingleLine(value: string): string {
  return value.replace(/\r\n|\r|\n/g, ' ');
}

export function formatLanguageLabel(code?: string): string {
  const normalized = (code ?? '').trim();
  if (!normalized) {
    return '\u672a\u8bbe\u7f6e\u8bed\u8a00';
  }
  return formatBcp47Label(normalized);
}

export function formatLayerLanguageLabel(layer: LayerDocType): string {
  const preferredName = readAnyMultiLangLabel(layer.name);
  const code = (layer.languageId ?? '').trim().toLowerCase();
  if (!preferredName) {
    return formatLanguageLabel(code);
  }
  if (!code) {
    return preferredName;
  }
  return `${preferredName} (${code})`;
}

export function formatSidePaneLayerLabel(layer: LayerDocType): string {
  const { type, lang } = getLayerLabelParts(layer);
  return lang ? `${type} · ${lang}` : type;
}

function resolveLayerAlias(layer: LayerDocType): string {
  const alias = readAnyMultiLangLabel(layer.name)
    ?? listUniqueNonEmptyMultiLangLabels(layer.name)[0]
    ?? '';
  const hasAutoPrefix = alias.startsWith('\u8f6c\u5199') || alias.startsWith('\u7ffb\u8bd1');
  return hasAutoPrefix ? '' : alias;
}

export function getLayerHeaderLanguageLine(layer: LayerDocType, locale: LanguageSearchLocale = 'zh-CN'): string {
  const code = (layer.languageId ?? '').trim();
  if (!code) return '';
  return formatBcp47Label(code, locale) || code;
}

export function getLayerHeaderLanguageName(layer: LayerDocType, locale: LanguageSearchLocale = 'zh-CN'): string {
  const code = (layer.languageId ?? '').trim().toLowerCase();
  if (!code) return '';
  const parsed = parseBcp47(code);
  const primary = (parsed.primary || code).toLowerCase();
  const catalogEntry = getLanguageCatalogEntry(primary);
  if (catalogEntry) {
    return getLanguageDisplayName(catalogEntry.iso6393, locale);
  }
  return LANGUAGE_NAME_MAP[primary]
    ?? COMMON_LANGUAGES.find((language) => language.code === primary)?.label
    ?? primary;
}

export function getLayerHeaderVarietyOrAliasLine(layer: LayerDocType): string {
  const explicitVarietyParts = [layer.dialect?.trim(), layer.vernacular?.trim()]
    .filter((part): part is string => Boolean(part));
  if (explicitVarietyParts.length > 0) {
    return explicitVarietyParts.join(' · ');
  }

  const code = (layer.languageId ?? '').trim();
  if (!code) return resolveLayerAlias(layer);
  const parsed = parseBcp47(code);
  const varietyParts: string[] = [];
  if (parsed.region) {
    varietyParts.push(parsed.region);
  }
  for (const variant of parsed.variants) {
    varietyParts.push(VARIANT_LABEL_MAP[variant] ?? variant);
  }
  if (parsed.privateUse) {
    varietyParts.push(parsed.privateUse);
  }
  if (varietyParts.length > 0) {
    return varietyParts.join(' · ');
  }
  return resolveLayerAlias(layer);
}

export function getOrthographyHeaderLine(
  orthography: {
    name?: Record<string, string>;
    abbreviation?: string;
  } | null | undefined,
  locale?: 'zh-CN' | 'en-US',
): string {
  if (!orthography) return '';
  return readLocalizedMultiLangLabel(orthography.name, locale)
    ?? orthography.abbreviation?.trim()
    ?? '';
}

const ORTHOGRAPHY_HEADER_LOCALE_BY_SEARCH: Record<LanguageSearchLocale, 'zh-CN' | 'en-US'> = {
  'zh-CN': 'zh-CN',
  'en-US': 'en-US',
  'fr-FR': 'zh-CN',
  'es-ES': 'zh-CN',
  'de-DE': 'zh-CN',
};

/**
 * 与波形/纯文本层头信息一致，但压成单行并以「·」串联（用于纵向对照列标题等）| Same lane header facts as stacked headers, one line with middle dots
 */
export function buildLaneHeaderInlineDotSeparatedLabel(
  layer: LayerDocType,
  locale: LanguageSearchLocale,
  orthographies: ReadonlyArray<{ id: string; name?: Record<string, string>; abbreviation?: string }>,
): string {
  const languageLine = getLayerHeaderLanguageLine(layer, locale);
  const varietyOrAliasLine = getLayerHeaderVarietyOrAliasLine(layer);
  const targetOrthography = layer.orthographyId
    ? orthographies.find((o) => o.id === layer.orthographyId)
    : undefined;
  const orthographyLocale = ORTHOGRAPHY_HEADER_LOCALE_BY_SEARCH[locale] ?? 'zh-CN';
  const orthographyLine = getOrthographyHeaderLine(targetOrthography, orthographyLocale);
  const parts = [languageLine, varietyOrAliasLine, orthographyLine]
    .map((line) => normalizeSingleLine(line).trim())
    .filter((line) => line.length > 0);
  return parts.join(' · ');
}

export function getLayerLabelParts(layer: LayerDocType, locale: LanguageSearchLocale = 'zh-CN'): { type: string; lang: string; alias: string } {
  const code = (layer.languageId ?? '').trim();
  const typeLabel = layer.layerType === 'translation' ? '\u7ffb\u8bd1' : '\u8f6c\u5199';
  const langLabel = formatBcp47Label(code, locale) || code;
  const alias = resolveLayerAlias(layer);
  if (!alias) {
    return { type: typeLabel, lang: langLabel, alias: '' };
  }
  // Legacy manually named layers — show alias as third line
  return { type: typeLabel, lang: langLabel, alias };
}

export const COMMON_LANGUAGES = [
  { code: 'cmn', label: '\u666e\u901a\u8bdd' },
  { code: 'zho', label: '\u4e2d\u6587' },
  { code: 'yue', label: '\u7ca4\u8bed' },
  { code: 'wuu', label: '\u5434\u8bed' },
  { code: 'nan', label: '\u95fd\u5357\u8bed' },
  { code: 'hak', label: '\u5ba2\u5bb6\u8bdd' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: '\u65e5\u672c\u8a9e' },
  { code: 'kor', label: '한국어' },
  { code: 'fra', label: 'Français' },
  { code: 'deu', label: 'Deutsch' },
  { code: 'spa', label: 'Español' },
  { code: 'rus', label: 'Русский' },
  { code: 'ara', label: 'العربية' },
  { code: 'por', label: 'Português' },
  { code: 'hin', label: 'हिन्दी' },
  { code: 'vie', label: 'Tiếng Việt' },
  { code: 'tha', label: 'ภาษาไทย' },
  { code: 'msa', label: 'Bahasa Melayu' },
  { code: 'ind', label: 'Bahasa Indonesia' },
] as const;

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract a single displayable transcription string from a multi-key
 * transcription record (e.g. `{ default: "...", eng: "..." }`).
 * Returns the `default` key first, then falls back to any non-empty value.
 */
export function pickDefaultTranscriptionText(transcription: unknown): string {
  if (!transcription || typeof transcription !== 'object') return '';
  const record = transcription as Record<string, unknown>;
  const direct = typeof record.default === 'string' ? record.default.trim() : '';
  if (direct.length > 0) return direct;
  for (const value of Object.values(record)) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next.length > 0) return next;
  }
  return '';
}
