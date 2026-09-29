import { getLanguageCatalogEntry, isKnownIso639_3Code, resolveLanguageQuery } from './langMapping';
import { readFlexTierName } from './eafTierPick';

export type EafLanguageRecord = {
  label?: string;
  def?: string;
};

const OBJECT_LANGUAGE_STEMS = new Set(['tx', 'wd', 'mb', 'ph']);

const TIER_ROLE_TOKENS = new Set([
  'cf',
  'comment',
  'fn',
  'free',
  'ft',
  'ge',
  'gl',
  'gloss',
  'gls',
  'hn',
  'lit',
  'mb',
  'morph',
  'msa',
  'note',
  'notes',
  'nt',
  'original',
  'ph',
  'phrase',
  'pos',
  'ps',
  'punct',
  'ref',
  'segnum',
  'source',
  'text',
  'title',
  'translation',
  'txt',
  'tx',
  'type',
  'wd',
  'word',
]);

/**
 * Project language ids are ISO 639-3. A BCP 47 tag contributes its primary
 * subtag only: `zh-CN` → the catalog code for `zh`, `mvm-fonipa-x-emic` → `mvm`.
 * A mixed-case name such as `Nuu` is not a code (`nuu` is Ngbundu).
 * `und` and the private-use block `qaa`–`qtz` are not languages.
 */
export function canonicalizeImportedLanguageCode(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? '';
  if (!isLanguageTag(raw)) return undefined;
  const primary = primaryToken(raw).toLowerCase();
  if (!/^[a-z]{2,3}$/.test(primary) || isNonLanguageCode(primary)) return undefined;
  const entry = getLanguageCatalogEntry(primary);
  if (entry !== undefined && entry.iso6393.length > 0) {
    const iso = entry.iso6393.toLowerCase();
    return isNonLanguageCode(iso) ? undefined : iso;
  }
  if (isKnownIso639_3Code(primary)) return primary;
  if (/[-_]/.test(raw) && primary.length === 3) return primary;
  return undefined;
}

/** ISO 639-3 when the tag is a code; otherwise the written tag, never `und` or `qaa`. */
export function normalizeImportedLanguageTag(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? '';
  if (raw.length === 0) return undefined;
  const code = canonicalizeImportedLanguageCode(raw);
  if (code !== undefined) return code;
  if (isNonLanguageCode(primaryToken(raw).toLowerCase())) return undefined;
  return raw;
}

function primaryToken(value: string): string {
  return value.split(/[-_]/)[0] ?? '';
}

function isLanguageTag(value: string): boolean {
  if (!/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/.test(value)) return false;
  const head = primaryToken(value);
  if (!/[-_]/.test(value) && head !== head.toLowerCase() && head !== head.toUpperCase()) {
    return false;
  }
  return true;
}

function isNonLanguageCode(code: string): boolean {
  if (code === 'und' || code === 'mul' || code === 'mis' || code === 'zxx') return true;
  return /^q[a-t][a-z]$/.test(code);
}

function lookupLanguage(
  languages: ReadonlyMap<string, EafLanguageRecord>,
  id: string,
): EafLanguageRecord | undefined {
  const direct = languages.get(id);
  if (direct) return direct;
  const lower = id.toLowerCase();
  for (const [key, record] of languages) {
    if (key.toLowerCase() === lower) return record;
  }
  return undefined;
}

function codeFromLanguageRecord(record: EafLanguageRecord | undefined): string | undefined {
  if (!record) return undefined;
  const fromDef = canonicalizeImportedLanguageCode(record.def);
  if (fromDef !== undefined) return fromDef;
  const label = record.label?.trim() ?? '';
  if (label.length === 0) return undefined;
  const fromLabelCode = canonicalizeImportedLanguageCode(label);
  if (fromLabelCode !== undefined) return fromLabelCode;
  if (!/\s/.test(label) && label.length <= 12) return undefined;
  return resolveLanguageQuery(label);
}

function languageName(token: string): string | undefined {
  const query = token.replace(/_/g, ' ').trim();
  if (query.length === 0 || /^[a-z]{2,3}$/i.test(query)) return undefined;
  const named = resolveLanguageQuery(query);
  if (named === undefined || isNonLanguageCode(named)) return undefined;
  return named;
}

function documentLanguageId(id: string, record: EafLanguageRecord): string | undefined {
  const fromDef = canonicalizeImportedLanguageCode(record.def);
  if (fromDef !== undefined) return fromDef;
  if (isLanguageTag(id)) {
    const code = canonicalizeImportedLanguageCode(id);
    if (code !== undefined) return code;
    if (isNonLanguageCode(primaryToken(id).toLowerCase())) return undefined;
    return id;
  }
  const rawLabel = record.label?.trim() ?? '';
  const label = (rawLabel.length > 0 ? rawLabel : id).replace(/_/g, ' ');
  if (/^[A-Za-z]{2,3}$/.test(label) && !isLanguageTag(label)) return id;
  const named = languageName(label);
  return named ?? id;
}

function soleDocumentLanguage(
  languages: ReadonlyMap<string, EafLanguageRecord>,
): string | undefined {
  const ids = new Set<string>();
  for (const [id, record] of languages) {
    const languageId = documentLanguageId(id, record);
    if (languageId !== undefined) ids.add(languageId);
  }
  if (ids.size !== 1) return undefined;
  return [...ids][0];
}

function tierStem(tierId: string): string {
  return (tierId.split('@')[0] ?? tierId).trim();
}

function isObjectLanguageTier(tierId: string): boolean {
  return OBJECT_LANGUAGE_STEMS.has(tierStem(tierId).toLowerCase());
}

function resolveExplicitTag(token: string): string | undefined {
  return canonicalizeImportedLanguageCode(token) ?? languageName(token);
}

function languageFromTierId(tierId: string): string | undefined {
  const flex = readFlexTierName(tierId);
  if (flex !== undefined && flex.lang !== undefined && flex.lang.length > 0) {
    const fromSlot = resolveExplicitTag(flex.lang);
    if (fromSlot !== undefined) return fromSlot;
    if (flex.itemType !== 'txt') return undefined;
  }

  const stem = tierStem(tierId);
  if (!TIER_ROLE_TOKENS.has(stem.toLowerCase())) {
    const whole = canonicalizeImportedLanguageCode(stem);
    if (whole !== undefined) return whole;
  }

  const parts = stem.split(/[-_\s]+/).filter((part) => part.length > 0);
  let index = parts.length - 1;
  while (index >= 0 && TIER_ROLE_TOKENS.has(parts[index]!.toLowerCase())) index -= 1;
  if (index < 0) return undefined;
  if (parts.length === 1) return languageName(parts[0]!);
  return resolveExplicitTag(parts[index]!);
}

/**
 * Language comes from a tag: `LANG_REF`, the FLEx slot in the tier name,
 * or a language token in that name (`gls-fr`, `FT-SWA`, `Translation-ENG`).
 * `DEFAULT_LOCALE` is ignored. A tier with no tag stays unset, except
 * `tx` / `wd` / `mb` / `ph`, which use the file's one real `<LANGUAGE>`.
 */
export function resolveImportedEafTierLanguage(input: {
  tierId: string;
  langRef?: string;
  defaultLocale?: string;
  languages: ReadonlyMap<string, EafLanguageRecord>;
}): string | undefined {
  const langRef = input.langRef?.trim() ?? '';
  if (langRef.length > 0) {
    const fromRef =
      canonicalizeImportedLanguageCode(langRef) ??
      codeFromLanguageRecord(lookupLanguage(input.languages, langRef));
    if (fromRef !== undefined) return fromRef;
    if (!isNonLanguageCode(primaryToken(langRef).toLowerCase())) return langRef;
  }

  const fromTierId = languageFromTierId(input.tierId);
  if (fromTierId !== undefined) return fromTierId;

  if (isObjectLanguageTier(input.tierId)) return soleDocumentLanguage(input.languages);
  return undefined;
}
