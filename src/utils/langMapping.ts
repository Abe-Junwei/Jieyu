/**
 * langMapping — ISO 639-3 → BCP-47 映射
 *
 * 用于将语料库的 ISO 639-3 语言标签转换为 Web Speech API 所需的 BCP-47 格式。
 * 覆盖 ~30 高频田野语言学语种 + 中国少数民族语言。
 *
 * @see 解语-语音智能体架构设计方案 §4.3
 */

import languageTags from 'language-tags';
import { listIso639_3Seeds } from '../data/iso6393Seed';
import { getLanguageAliasCodeFromCatalog, getLanguageAliasesForCodeFromCatalog, getLanguageEnglishDisplayNameFromCatalog, getLanguageLocalDisplayNameFromCatalog, getLanguageNativeDisplayNameFromCatalog, getLanguageQueryEntriesFromCatalog } from '../data/languageNameCatalog';
import { normalizeLanguageCatalogRuntimeLookupKey, readLanguageCatalogRuntimeCache } from '../data/languageCatalogRuntimeCache';
import type { LanguageCatalogSearchSuggestion } from '../services/LanguageCatalogSearchService';

/**
 * ISO 639-3 → BCP-47 静态映射表。
 * 仅包含 Web Speech API / Whisper 有对应支持的语种。
 * 映射不存在时 toBcp47() 回退到直接使用输入值。
 */
const ISO639_3_TO_BCP47: Readonly<Record<string, string>> = {
  // ── 汉语族 ──
  cmn: 'zh-CN',     // 普通话
  yue: 'zh-HK',     // 粤语
  wuu: 'zh-CN',     // 吴语 (fallback 普通话)
  nan: 'zh-TW',     // 闽南语

  // ── 中国少数民族语言 ──
  bod: 'bo',         // 藏语
  uig: 'ug',         // 维吾尔语
  mon: 'mn',         // 蒙古语
  zha: 'za',         // 壮语
  kor: 'ko-KR',      // 朝鲜语

  // ── 东亚/东南亚 ──
  jpn: 'ja-JP',      // 日语
  tha: 'th-TH',      // 泰语
  vie: 'vi-VN',      // 越南语
  khm: 'km-KH',      // 高棉语
  mya: 'my-MM',      // 缅甸语
  ind: 'id-ID',      // 印尼语
  msa: 'ms-MY',      // 马来语
  tgl: 'tl-PH',      // 他加禄语

  // ── 南亚 ──
  hin: 'hi-IN',      // 印地语
  ben: 'bn-IN',      // 孟加拉语
  tam: 'ta-IN',      // 泰米尔语
  urd: 'ur-PK',      // 乌尔都语
  nep: 'ne-NP',      // 尼泊尔语

  // ── 欧洲 ──
  eng: 'en-US',      // 英语
  fra: 'fr-FR',      // 法语
  deu: 'de-DE',      // 德语
  spa: 'es-ES',      // 西班牙语
  por: 'pt-BR',      // 葡萄牙语
  rus: 'ru-RU',      // 俄语
  ita: 'it-IT',      // 意大利语
  nld: 'nl-NL',      // 荷兰语
  pol: 'pl-PL',      // 波兰语
  tur: 'tr-TR',      // 土耳其语

  // ── 其他 ──
  ara: 'ar-SA',      // 阿拉伯语
  heb: 'he-IL',      // 希伯来语
  swa: 'sw-KE',      // 斯瓦希里语
  amh: 'am-ET',      // 阿姆哈拉语
};

/**
 * 语言选项列表 — 用于语音语言选择下拉菜单。
 * 按地区分组，带人类可读名称。
 */
export const SUPPORTED_VOICE_LANGS: {
  group: string;
  langs: { code: string; label: string; bcp47: string }[];
}[] = [
  {
    group: '自动检测',
    langs: [{ code: '__auto__', label: '自动检测', bcp47: '' }],
  },
  {
    group: '汉语族',
    langs: [
      { code: 'cmn', label: '普通话', bcp47: 'zh-CN' },
      { code: 'yue', label: '粤语', bcp47: 'zh-HK' },
      { code: 'wuu', label: '吴语', bcp47: 'zh-CN' },
      { code: 'nan', label: '闽南语', bcp47: 'zh-TW' },
    ],
  },
  {
    group: '中国少数民族语言',
    langs: [
      { code: 'bod', label: '藏语', bcp47: 'bo' },
      { code: 'uig', label: '维吾尔语', bcp47: 'ug' },
      { code: 'mon', label: '蒙古语', bcp47: 'mn' },
      { code: 'zha', label: '壮语', bcp47: 'za' },
      { code: 'kor', label: '朝鲜语 / 韩语', bcp47: 'ko-KR' },
    ],
  },
  {
    group: '东亚',
    langs: [
      { code: 'jpn', label: '日语', bcp47: 'ja-JP' },
      { code: 'tha', label: '泰语', bcp47: 'th-TH' },
      { code: 'vie', label: '越南语', bcp47: 'vi-VN' },
      { code: 'mya', label: '缅甸语', bcp47: 'my-MM' },
    ],
  },
  {
    group: '东南亚',
    langs: [
      { code: 'khm', label: '高棉语', bcp47: 'km-KH' },
      { code: 'ind', label: '印尼语', bcp47: 'id-ID' },
      { code: 'msa', label: '马来语', bcp47: 'ms-MY' },
      { code: 'tgl', label: '他加禄语', bcp47: 'tl-PH' },
    ],
  },
  {
    group: '南亚',
    langs: [
      { code: 'hin', label: '印地语', bcp47: 'hi-IN' },
      { code: 'ben', label: '孟加拉语', bcp47: 'bn-IN' },
      { code: 'tam', label: '泰米尔语', bcp47: 'ta-IN' },
      { code: 'urd', label: '乌尔都语', bcp47: 'ur-PK' },
      { code: 'nep', label: '尼泊尔语', bcp47: 'ne-NP' },
    ],
  },
  {
    group: '欧洲',
    langs: [
      { code: 'eng', label: '英语', bcp47: 'en-US' },
      { code: 'fra', label: '法语', bcp47: 'fr-FR' },
      { code: 'deu', label: '德语', bcp47: 'de-DE' },
      { code: 'spa', label: '西班牙语', bcp47: 'es-ES' },
      { code: 'por', label: '葡萄牙语', bcp47: 'pt-BR' },
      { code: 'ita', label: '意大利语', bcp47: 'it-IT' },
      { code: 'rus', label: '俄语', bcp47: 'ru-RU' },
      { code: 'nld', label: '荷兰语', bcp47: 'nl-NL' },
      { code: 'pol', label: '波兰语', bcp47: 'pl-PL' },
      { code: 'tur', label: '土耳其语', bcp47: 'tr-TR' },
    ],
  },
  {
    group: '其他',
    langs: [
      { code: 'ara', label: '阿拉伯语', bcp47: 'ar-SA' },
      { code: 'heb', label: '希伯来语', bcp47: 'he-IL' },
      { code: 'swa', label: '斯瓦希里语', bcp47: 'sw-KE' },
      { code: 'amh', label: '阿姆哈拉语', bcp47: 'am-ET' },
    ],
  },
];

/** 扁平的所有语言代码列表（不含 __auto__）。 */
export const ALL_VOICE_LANG_CODES: readonly string[] =
  SUPPORTED_VOICE_LANGS.flatMap((g) => g.langs)
    .filter((l) => l.code !== '__auto__')
    .map((l) => l.code);

const ISO639_3_SEEDS = listIso639_3Seeds();

// ── ISO 639-3 数据库索引 | ISO 639-3 database indexes ──

const ISO639_3_DB_CODE_SET: ReadonlySet<string> = new Set(
  ISO639_3_SEEDS
    .map((entry) => entry.iso6393.toLowerCase())
    .filter((code) => code.length > 0),
);

const ISO639_3_DB_NAME_TO_CODE: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of ISO639_3_SEEDS) {
    const code = entry.iso6393.toLowerCase();
    if (!code) continue;

    const refs = [entry.name, entry.invertedName]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().toLowerCase());

    for (const refName of refs) {
      // 若同名映射冲突，保留首次出现，保证行为稳定 | Keep first hit on conflicts for stable behavior.
      if (!(refName in map)) map[refName] = code;
    }
  }
  return map;
})();

/**
 * 将 ISO 639-3 代码转换为 BCP-47 格式。
 *
 * - 精确匹配: `cmn` → `zh-CN`
 * - 未知语种: 原样返回 (Web Speech API 可能仍能识别)
 *
 * @param iso639_3 ISO 639-3 三字母代码，e.g. 'cmn', 'jpn'
 * @returns BCP-47 标签，e.g. 'zh-CN', 'ja-JP'
 */
export function toBcp47(iso639_3: string): string {
  return ISO639_3_TO_BCP47[iso639_3.toLowerCase()] ?? iso639_3;
}

/**
 * 反向查找：BCP-47 → ISO 639-3。
 * 用于从 STT 结果的 lang 字段反推语料库语种。
 *
 * @returns ISO 639-3 代码或 undefined（无匹配时）
 */
export function toIso639_3(bcp47: string): string | undefined {
  const normalized = bcp47.toLowerCase();
  for (const [iso, bcp] of Object.entries(ISO639_3_TO_BCP47)) {
    if (bcp.toLowerCase() === normalized) return iso;
  }
  // Try prefix match: 'zh-CN' matches 'zh'
  const prefix = normalized.split('-')[0];
  if (prefix) {
    for (const [iso, bcp] of Object.entries(ISO639_3_TO_BCP47)) {
      if (bcp.toLowerCase().startsWith(prefix)) return iso;
    }
  }
  return undefined;
}

/**
 * 获取所有已知的 ISO 639-3 代码列表。
 */
export function knownIso639_3Codes(): readonly string[] {
  return Array.from(new Set([
    ...Object.keys(ISO639_3_TO_BCP47),
    ...ISO639_3_DB_CODE_SET,
  ])).sort();
}

export function isKnownIso639_3Code(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 3 && (ISO639_3_DB_CODE_SET.has(normalized) || normalized in ISO639_3_TO_BCP47);
}

/**
 * 模糊解析用户输入的语言名称为 ISO 639-3 代码。
 * Fuzzy-resolve a human language query to an ISO 639-3 code.
 *
 * 匹配优先级：
 *   1. 精确匹配 ISO 639-3 代码本身（如 "eng"、"jpn"）
 *   2. 精确匹配常见别名（如 "英文"、"English"）
 *   3. 精确匹配 SUPPORTED_VOICE_LANGS 中的 label（如 "英语"）
 *   4. label 包含查询 或 查询包含 label（如 "韩语" 匹配 "朝鲜语 / 韩语"）
 *
 * @param query 用户输入的语言名称（可为中文或英文）
 * @returns ISO 639-3 代码，或 undefined（无法识别时）
 */
export function resolveLanguageQuery(query: string): string | undefined {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return undefined;
  const visibleCatalogByCode = getMergedLanguageCatalogByCode();
  const directRuntimeCode = resolveRuntimeLanguageCode(q);

  // 1. 本身就是已知 ISO 639-3 代码 | Direct ISO 639-3 code
  if (directRuntimeCode && visibleCatalogByCode[directRuntimeCode]) {
    return directRuntimeCode;
  }
  if ((ISO639_3_DB_CODE_SET.has(q) || q in ISO639_3_TO_BCP47) && visibleCatalogByCode[q]) return q;

  // 歧义词必须进入澄清，不应静默落到某个具体语种 | Ambiguous queries must be clarified instead of silently resolving.
  if ((AMBIGUOUS_QUERY_PRESETS[q]?.length ?? 0) > 1) return undefined;

  // 2. 常见别名 | Common alias
  const alias = getLanguageAliasCodeFromCatalog(q);
  if (alias) return alias;

  // 3. ISO 639-3 名称库（英文）精确匹配 | Exact match against ISO 639-3 name database
  const dbExact = ISO639_3_DB_NAME_TO_CODE[q];
  if (dbExact && visibleCatalogByCode[dbExact]) return dbExact;

  // 4 & 5. 走统一语言目录检索，保证 runtime 资产与 hidden 语义一致 | Use unified catalog search so runtime assets and hidden visibility stay consistent.
  const searchLocales: readonly LanguageSearchLocale[] = ['zh-CN', 'en-US', 'fr-FR', 'es-ES', 'de-DE'];

  for (const locale of searchLocales) {
    const exactMatch = searchLanguageCatalog(query, locale, 8)
      .find((match) => match.matchSource === 'alias-exact' || match.matchSource === 'name-exact');
    if (exactMatch) {
      return exactMatch.entry.iso6393;
    }
  }

  const visibleVoiceLangs = SUPPORTED_VOICE_LANGS.flatMap((group) => group.langs)
    .filter((language) => language.code !== '__auto__' && Boolean(visibleCatalogByCode[language.code]));

  for (const lang of visibleVoiceLangs) {
    if (lang.label.toLowerCase() === q) return lang.code;
  }
  for (const lang of visibleVoiceLangs) {
    if (lang.label.toLowerCase().includes(q) || q.includes(lang.label.toLowerCase())) {
      return lang.code;
    }
  }

  return undefined;
}

export type LanguageSearchLocale = 'zh-CN' | 'en-US' | 'fr-FR' | 'es-ES' | 'de-DE';

export type LanguageCatalogMatchedLabelKind = 'local' | 'native' | 'english' | 'alias' | 'code';
export type LanguageDisplayMode = 'locale-first' | 'input-first';

export type LanguageDisplayNames = {
  local: string;
  english: string;
  native?: string;
};

export type LanguageCatalogEntry = {
  languageId: string;
  iso6393: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  name: string;
  invertedName?: string;
  displayNameZh?: string;
  aliases: string[];
  scope: 'individual' | 'macrolanguage' | 'collection' | 'special' | 'private-use';
  type: 'living' | 'historical' | 'extinct' | 'ancient' | 'constructed' | 'special';
  descriptions: string[];
  deprecated: boolean;
  preferredIso6393?: string;
  suppressScript?: string;
  macrolanguage?: string;
  /** From runtime cache / LinguisticService projection (Glottolog baseline) */
  baselineDistributionCountryCodes?: string[];
  /** From runtime cache / LinguisticService projection (CLDR baseline) */
  baselineOfficialCountryCodes?: string[];
  /** User override for official countries (Dexie) */
  countriesOfficial?: string[];
};

export type LanguageCatalogMatchSource =
  | 'iso6393-exact'
  | 'iso6391-exact'
  | 'iso6392-exact'
  | 'alias-exact'
  | 'name-exact'
  | 'bcp47-primary'
  | 'prefix'
  | 'contains'
  | 'ambiguous-preset';

export type LanguageCatalogMatch = {
  entry: LanguageCatalogEntry;
  score: number;
  matchSource: LanguageCatalogMatchSource;
  matchedLabel: string;
  matchedLabelKind: LanguageCatalogMatchedLabelKind;
  warnings: string[];
};

export type ResolvedLanguageCodeInput = {
  status: 'empty' | 'resolved' | 'invalid';
  languageId?: string;
  languageName?: string;
  localeTag?: string;
  scriptTag?: string;
  regionTag?: string;
  variantTag?: string;
  warnings: string[];
};

export type LanguageCodeInputChangeState = {
  sanitizedInput: string;
  keepsDraft: boolean;
  status: 'empty' | 'deferred' | 'resolved' | 'invalid';
  resolution: ResolvedLanguageCodeInput;
};

const COMMON_LANGUAGE_INPUT_CODES = [
  'cmn', 'zho', 'yue', 'wuu', 'nan', 'hak',
  'eng', 'jpn', 'kor', 'fra', 'deu', 'spa', 'rus', 'ara', 'por', 'hin', 'vie', 'tha', 'msa', 'ind', 'bod',
] as const;

const AMBIGUOUS_QUERY_PRESETS: Readonly<Record<string, readonly string[]>> = {
  '中文': ['cmn', 'zho', 'yue', 'wuu', 'nan', 'hak'],
  '汉语': ['cmn', 'zho', 'yue', 'wuu', 'nan', 'hak'],
  '漢語': ['cmn', 'zho', 'yue', 'wuu', 'nan', 'hak'],
  'chinese': ['cmn', 'zho', 'yue', 'wuu', 'nan', 'hak'],
  'arabic': ['ara', 'arb'],
  '阿拉伯语': ['ara', 'arb'],
};

const ISO639_1_TO_3: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of ISO639_3_SEEDS) {
    const code = entry.iso6393.toLowerCase();
    const iso6391 = entry.iso6391?.trim().toLowerCase();
    if (code && iso6391 && !(iso6391 in map)) {
      map[iso6391] = code;
    }
  }
  return map;
})();

const ISO639_2_TO_3: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of ISO639_3_SEEDS) {
    const code = entry.iso6393.toLowerCase();
    const iso6392B = entry.iso6392B?.trim().toLowerCase();
    const iso6392T = entry.iso6392T?.trim().toLowerCase();
    if (code && iso6392B && !(iso6392B in map)) {
      map[iso6392B] = code;
    }
    if (code && iso6392T && !(iso6392T in map)) {
      map[iso6392T] = code;
    }
  }
  return map;
})();

const MACROLANGUAGE_BY_CODE: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of ISO639_3_SEEDS) {
    const subtag = languageTags.language(entry.iso6393) ?? languageTags.type(entry.iso6393, 'extlang');
    if (!subtag || subtag.scope() !== 'macrolanguage') continue;
    const macroCode = entry.iso6393.toLowerCase();
    try {
      for (const member of languageTags.languages(macroCode)) {
        const memberCode = member.format().toLowerCase();
        if (!(memberCode in map)) {
          map[memberCode] = macroCode;
        }
      }
    } catch {
      // noop
    }
  }
  return map;
})();

// 延迟构建语言目录映射，避免模块加载时同步遍历 7867 条 × readLanguageCatalogRuntimeCache | Lazy-init to avoid O(n²) blocking on module load
let _languageCatalogByCode: Readonly<Record<string, LanguageCatalogEntry>> | undefined;
function getLanguageCatalogByCode(): Readonly<Record<string, LanguageCatalogEntry>> {
  if (_languageCatalogByCode) return _languageCatalogByCode;
  const map: Record<string, LanguageCatalogEntry> = {};
  for (const entry of ISO639_3_SEEDS) {
    const code = entry.iso6393.toLowerCase();
    if (!code) continue;
    const subtag = languageTags.language(code) ?? languageTags.type(code, 'extlang');
    const preferred = subtag?.preferred()?.format().toLowerCase();
    const preferredIso6393 = preferred
      ? (ISO639_1_TO_3[preferred] ?? ISO639_2_TO_3[preferred] ?? (isKnownIso639_3Code(preferred) ? preferred : undefined))
      : undefined;
    map[code] = {
      languageId: code,
      iso6393: code,
      ...(entry.iso6391 ? { iso6391: entry.iso6391.toLowerCase() } : {}),
      ...(entry.iso6392B ? { iso6392B: entry.iso6392B.toLowerCase() } : {}),
      ...(entry.iso6392T ? { iso6392T: entry.iso6392T.toLowerCase() } : {}),
      name: entry.name,
      ...(entry.invertedName ? { invertedName: entry.invertedName } : {}),
      ...(() => { const zh = getLanguageLocalDisplayNameFromCatalog(code, 'zh-CN'); return zh ? { displayNameZh: zh } : {}; })(),
      aliases: [...getLanguageAliasesForCodeFromCatalog(code)],
      scope: ((subtag?.scope() ?? entry.scope ?? 'individual') as LanguageCatalogEntry['scope']),
      type: (entry.type as LanguageCatalogEntry['type']),
      descriptions: Array.from(new Set([
        entry.name,
        entry.invertedName,
        ...(subtag?.descriptions() ?? []),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))),
      deprecated: subtag?.deprecated() !== null,
      ...(preferredIso6393 && preferredIso6393 !== code ? { preferredIso6393 } : {}),
      ...(subtag?.script() ? { suppressScript: subtag.script()!.format() } : {}),
      ...(MACROLANGUAGE_BY_CODE[code] ? { macrolanguage: MACROLANGUAGE_BY_CODE[code] } : {}),
    };
  }
  _languageCatalogByCode = map;
  return _languageCatalogByCode;
}

type ParsedLanguageTag = {
  formattedTag: string;
  primaryLanguage: string;
  scriptTag?: string;
  regionTag?: string;
  variantTag?: string;
};

function parseLanguageTag(input: string): ParsedLanguageTag | undefined {
  try {
    const locale = new Intl.Locale(input);
    const formattedTag = locale.toString();
    const segments = formattedTag.split('-');
    const extlangSegment = segments[1];
    const usesExtlang = Boolean(extlangSegment && /^[a-z]{3}$/i.test(extlangSegment));
    const primaryLanguage = (extlangSegment && /^[a-z]{3}$/i.test(extlangSegment)
      ? extlangSegment
      : locale.language)?.trim().toLowerCase();

    if (!primaryLanguage) {
      return undefined;
    }

    const variantSegments = segments.filter((segment, index) => {
      if (index === 0) {
        return false;
      }
      if (usesExtlang && index === 1) {
        return false;
      }
      return /^(?:[0-9][a-z0-9]{3}|[a-z0-9]{5,8})$/i.test(segment);
    });
    const variantTag = variantSegments.length > 0
      ? variantSegments.join('-')
      : undefined;

    return {
      formattedTag,
      primaryLanguage,
      ...(locale.script ? { scriptTag: locale.script } : {}),
      ...(locale.region ? { regionTag: locale.region } : {}),
      ...(variantTag ? { variantTag } : {}),
    };
  } catch {
    return undefined;
  }
}

function resolveRuntimeLanguageCode(query: string | undefined): string | undefined {
  const normalizedQuery = normalizeLanguageCatalogRuntimeLookupKey(query);
  if (!normalizedQuery) {
    return undefined;
  }

  const cache = readLanguageCatalogRuntimeCache();
  const resolvedId = cache.entries[normalizedQuery]
    ? normalizedQuery
    : cache.lookupToId[normalizedQuery];
  if (!resolvedId) {
    return undefined;
  }

  const runtimeEntry = cache.entries[resolvedId];
  return runtimeEntry?.languageCode?.trim().toLowerCase()
    || runtimeEntry?.iso6393?.trim().toLowerCase()
    || resolvedId;
}

function buildRuntimeLanguageCatalogEntries(includeHidden = false): LanguageCatalogEntry[] {
  const cache = readLanguageCatalogRuntimeCache();

  return Object.entries(cache.entries)
    .map(([entryId, runtimeEntry]) => {
      if (!includeHidden && runtimeEntry.visibility === 'hidden') {
        return null;
      }

      const resolvedCode = runtimeEntry.languageCode?.trim().toLowerCase()
        || runtimeEntry.iso6393?.trim().toLowerCase()
        || entryId;
      if (!resolvedCode) {
        return null;
      }

      const baseEntry = getLanguageCatalogByCode()[resolvedCode];
      const descriptions = dedupeLanguageLabels([
        runtimeEntry.english,
        runtimeEntry.native,
        ...(runtimeEntry.byLocale ? Object.values(runtimeEntry.byLocale) : []),
        ...(baseEntry?.descriptions ?? []),
      ]);

      return {
        languageId: entryId,
        iso6393: resolvedCode,
        ...(runtimeEntry.iso6391?.trim() ? { iso6391: runtimeEntry.iso6391.trim().toLowerCase() } : baseEntry?.iso6391 ? { iso6391: baseEntry.iso6391 } : {}),
        ...(runtimeEntry.iso6392B?.trim() ? { iso6392B: runtimeEntry.iso6392B.trim().toLowerCase() } : baseEntry?.iso6392B ? { iso6392B: baseEntry.iso6392B } : {}),
        ...(runtimeEntry.iso6392T?.trim() ? { iso6392T: runtimeEntry.iso6392T.trim().toLowerCase() } : baseEntry?.iso6392T ? { iso6392T: baseEntry.iso6392T } : {}),
        name: runtimeEntry.english?.trim() || baseEntry?.name || resolvedCode,
        ...(baseEntry?.invertedName ? { invertedName: baseEntry.invertedName } : {}),
        ...(runtimeEntry.byLocale?.['zh-CN']?.trim() ? { displayNameZh: runtimeEntry.byLocale['zh-CN'].trim() } : baseEntry?.displayNameZh ? { displayNameZh: baseEntry.displayNameZh } : {}),
        aliases: dedupeLanguageLabels([
          ...(runtimeEntry.aliases ?? []),
          ...(baseEntry?.aliases ?? []),
        ]),
        scope: runtimeEntry.scope ?? baseEntry?.scope ?? 'individual',
        type: runtimeEntry.languageType ?? baseEntry?.type ?? 'living',
        descriptions,
        deprecated: baseEntry?.deprecated ?? false,
        ...(baseEntry?.preferredIso6393 ? { preferredIso6393: baseEntry.preferredIso6393 } : {}),
        ...(baseEntry?.suppressScript ? { suppressScript: baseEntry.suppressScript } : {}),
        ...(runtimeEntry.macrolanguage?.trim() ? { macrolanguage: runtimeEntry.macrolanguage.trim().toLowerCase() } : baseEntry?.macrolanguage ? { macrolanguage: baseEntry.macrolanguage } : {}),
        ...(runtimeEntry.baselineDistributionCountryCodes?.length
          ? { baselineDistributionCountryCodes: [...runtimeEntry.baselineDistributionCountryCodes] }
          : {}),
        ...(runtimeEntry.baselineOfficialCountryCodes?.length
          ? { baselineOfficialCountryCodes: [...runtimeEntry.baselineOfficialCountryCodes] }
          : {}),
        ...(runtimeEntry.countriesOfficial?.length
          ? { countriesOfficial: [...runtimeEntry.countriesOfficial] }
          : {}),
      };
    })
    .filter((entry): entry is LanguageCatalogEntry => Boolean(entry));
}

function buildLanguageCatalogRuntimeSignature(): string {
  const runtimeCache = readLanguageCatalogRuntimeCache();
  return [
    runtimeCache.updatedAt,
    Object.keys(runtimeCache.entries).length,
    Object.keys(runtimeCache.aliasToId).length,
    Object.keys(runtimeCache.lookupToId).length,
  ].join('|');
}

let _visibleMergedLanguageCatalogCache:
  | { signature: string; value: Readonly<Record<string, LanguageCatalogEntry>> }
  | undefined;
let _allMergedLanguageCatalogCache:
  | { signature: string; value: Readonly<Record<string, LanguageCatalogEntry>> }
  | undefined;

function getMergedLanguageCatalogByCode(includeHidden = false): Readonly<Record<string, LanguageCatalogEntry>> {
  const signature = buildLanguageCatalogRuntimeSignature();
  if (!includeHidden && _visibleMergedLanguageCatalogCache?.signature === signature) {
    return _visibleMergedLanguageCatalogCache.value;
  }
  if (includeHidden && _allMergedLanguageCatalogCache?.signature === signature) {
    return _allMergedLanguageCatalogCache.value;
  }

  const merged: Record<string, LanguageCatalogEntry> = { ...getLanguageCatalogByCode() };
  const runtimeEntries = buildRuntimeLanguageCatalogEntries(true);
  const cache = readLanguageCatalogRuntimeCache();

  runtimeEntries.forEach((entry) => {
    const runtimeState = cache.entries[entry.iso6393]
      ?? cache.entries[cache.lookupToId[normalizeLanguageCatalogRuntimeLookupKey(entry.iso6393)] ?? ''];
    if (!includeHidden && runtimeState?.visibility === 'hidden') {
      delete merged[entry.iso6393];
      return;
    }
    merged[entry.iso6393] = entry;
  });

  if (includeHidden) {
    _allMergedLanguageCatalogCache = { signature, value: merged };
  } else {
    _visibleMergedLanguageCatalogCache = { signature, value: merged };
  }

  return merged;
}

const INTL_LANGUAGE_DISPLAY_NAME_CACHE = new Map<string, string | null>();

const GENERIC_CHINESE_VARIETY_NATIVE_NAMES = new Set([
  '中文',
  'chinese',
  '中文(',
  '中文（',
  'chinese(',
  'chinese (',
  'chinese（',
]);

const LANGUAGE_NATIVE_DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  ind: 'Bahasa Indonesia',
  tgl: 'Tagalog',
};

function isGenericChineseVarietyNativeName(languageId: string, label: string): boolean {
  if (!['cmn', 'yue', 'wuu', 'nan', 'hak'].includes(languageId)) {
    return false;
  }
  const normalized = normalizeLanguageLabelKey(label);
  return GENERIC_CHINESE_VARIETY_NATIVE_NAMES.has(normalized)
    || normalized.startsWith('中文(')
    || normalized.startsWith('中文（')
    || normalized.startsWith('chinese(')
    || normalized.startsWith('chinese (')
    || normalized.startsWith('chinese（');
}

function getIntlLanguageDisplayName(locale: string, languageCode: string): string | undefined {
  const normalizedLocale = locale.trim();
  const normalizedLanguageCode = languageCode.trim();
  if (!normalizedLocale || !normalizedLanguageCode) {
    return undefined;
  }

  const cacheKey = `${normalizedLocale}::${normalizedLanguageCode}`;
  const cached = INTL_LANGUAGE_DISPLAY_NAME_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  try {
    if (Intl.DisplayNames.supportedLocalesOf([normalizedLocale]).length === 0) {
      INTL_LANGUAGE_DISPLAY_NAME_CACHE.set(cacheKey, null);
      return undefined;
    }
    const displayName = new Intl.DisplayNames([normalizedLocale], { type: 'language' }).of(normalizedLanguageCode)?.trim() ?? '';
    const resolved = displayName && displayName.toLowerCase() !== normalizedLanguageCode.toLowerCase()
      ? displayName
      : null;
    INTL_LANGUAGE_DISPLAY_NAME_CACHE.set(cacheKey, resolved);
    return resolved ?? undefined;
  } catch {
    INTL_LANGUAGE_DISPLAY_NAME_CACHE.set(cacheKey, null);
    return undefined;
  }
}

function buildLanguageCodeDisplayCandidates(entry: LanguageCatalogEntry): string[] {
  return Array.from(new Set([
    entry.iso6393,
    ...(entry.iso6391 ? [entry.iso6391] : []),
    toBcp47(entry.iso6393),
  ].filter((value) => value.trim().length > 0)));
}

function getEnglishDisplayName(entry: LanguageCatalogEntry): string {
  return getLanguageEnglishDisplayNameFromCatalog(entry.iso6393) ?? entry.descriptions[0] ?? entry.name;
}

function getNativeDisplayName(entry: LanguageCatalogEntry): string | undefined {
  const runtimeOverride = LANGUAGE_NATIVE_DISPLAY_NAME_OVERRIDES[entry.iso6393];
  if (runtimeOverride) {
    return runtimeOverride;
  }
  const generatedDisplayName = getLanguageNativeDisplayNameFromCatalog(entry.iso6393);
  if (generatedDisplayName && !isGenericChineseVarietyNativeName(entry.iso6393, generatedDisplayName)) {
    return generatedDisplayName;
  }
  for (const candidate of buildLanguageCodeDisplayCandidates(entry)) {
    const displayName = getIntlLanguageDisplayName(candidate, candidate);
    if (displayName && !isGenericChineseVarietyNativeName(entry.iso6393, displayName)) {
      return displayName;
    }
  }
  return undefined;
}

function normalizeLanguageLabelKey(label: string): string {
  return label.normalize('NFKC').trim().toLowerCase();
}

function dedupeLanguageLabels(labels: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const label of labels) {
    const trimmed = label?.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeLanguageLabelKey(trimmed);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

export function formatLanguageDisplayName(
  languageId: string | undefined,
  locale: LanguageSearchLocale = 'zh-CN',
  mode: LanguageDisplayMode = 'locale-first',
  preferredDisplayName?: string,
  preferredDisplayKind: LanguageCatalogMatchedLabelKind = 'local',
): string {
  const normalizedCode = languageId?.trim().toLowerCase();
  if (!normalizedCode) {
    return preferredDisplayName?.trim() ?? '';
  }

  const { local, native, english } = getLanguageDisplayNames(normalizedCode, locale);
  if (mode === 'locale-first') {
    return dedupeLanguageLabels([local, native, english]).join(' · ');
  }

  const normalizedPreferredLabel = normalizeLanguageLabelKey(preferredDisplayName ?? '');
  const normalizedLocal = normalizeLanguageLabelKey(local);
  const normalizedNative = normalizeLanguageLabelKey(native ?? '');
  const normalizedEnglish = normalizeLanguageLabelKey(english);
  const resolvedPreferredKind = normalizedPreferredLabel && normalizedPreferredLabel === normalizedEnglish
    ? 'english'
    : normalizedPreferredLabel && normalizedPreferredLabel === normalizedNative
      ? 'native'
      : normalizedPreferredLabel && normalizedPreferredLabel === normalizedLocal
        ? 'local'
        : preferredDisplayKind;

  const inputFirstLabels = resolvedPreferredKind === 'english'
    ? [preferredDisplayName, local, native]
    : resolvedPreferredKind === 'native'
      ? [preferredDisplayName, local, english]
      : [preferredDisplayName, native, english];

  return dedupeLanguageLabels(inputFirstLabels).slice(0, 3).join(' · ');
}

function getLocaleDisplayName(entry: LanguageCatalogEntry, locale: LanguageSearchLocale): string {
  const generatedDisplayName = getLanguageLocalDisplayNameFromCatalog(entry.iso6393, locale);
  if (generatedDisplayName) {
    return generatedDisplayName;
  }
  if (locale === 'zh-CN' && entry.displayNameZh) return entry.displayNameZh;
  for (const candidate of buildLanguageCodeDisplayCandidates(entry)) {
    const displayName = getIntlLanguageDisplayName(locale, candidate);
    if (displayName) {
      return displayName;
    }
  }
  return getEnglishDisplayName(entry);
}

function getMacrolanguageHint(entry: LanguageCatalogEntry, locale: LanguageSearchLocale): string | undefined {
  if (entry.scope !== 'macrolanguage') return undefined;
  const members = Object.values(getMergedLanguageCatalogByCode())
    .filter((candidate) => candidate.macrolanguage === entry.iso6393)
    .slice(0, 4)
    .map((candidate) => candidate.iso6393);
  if (members.length === 0) {
    return locale === 'zh-CN'
      ? '当前代码表示宏语言，必要时请确认是否应选择更具体语言。'
      : 'This code represents a macrolanguage. Confirm whether a more specific language is needed.';
  }
  return locale === 'zh-CN'
    ? `当前代码表示宏语言，可进一步细化为：${members.join('、')}。`
    : `This code represents a macrolanguage. More specific choices may include: ${members.join(', ')}.`;
}

function getDeprecatedHint(entry: LanguageCatalogEntry, locale: LanguageSearchLocale): string | undefined {
  if (!entry.deprecated || !entry.preferredIso6393) return undefined;
  return locale === 'zh-CN'
    ? `该代码已弃用，建议改用 ${entry.preferredIso6393}。`
    : `This code is deprecated. Prefer ${entry.preferredIso6393}.`;
}

function buildWarningsForEntry(entry: LanguageCatalogEntry, locale: LanguageSearchLocale): string[] {
  return [
    getDeprecatedHint(entry, locale),
    getMacrolanguageHint(entry, locale),
  ].filter((warning): warning is string => typeof warning === 'string' && warning.length > 0);
}

type IndexedLanguageSearchTerm = {
  label: string;
  normalizedLabel: string;
  kind: LanguageCatalogMatchedLabelKind;
};

type IndexedLanguageSearchEntry = {
  entry: LanguageCatalogEntry;
  searchTerms: IndexedLanguageSearchTerm[];
};

const SEARCH_LANGUAGE_INDEX_CACHE = new Map<string, IndexedLanguageSearchEntry[]>();
const SEARCH_LANGUAGE_RESULT_CACHE = new Map<string, LanguageCatalogMatch[]>();
const SEARCH_LANGUAGE_CACHE_LIMIT = 240;
let SEARCH_LANGUAGE_CACHE_SIGNATURE = '';

function trimSearchCache<T>(cache: Map<string, T>, maxSize: number): void {
  while (cache.size > maxSize) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) {
      return;
    }
    cache.delete(firstKey);
  }
}

function ensureSearchCacheFresh(): string {
  const signature = buildLanguageCatalogRuntimeSignature();
  if (signature !== SEARCH_LANGUAGE_CACHE_SIGNATURE) {
    SEARCH_LANGUAGE_CACHE_SIGNATURE = signature;
    SEARCH_LANGUAGE_INDEX_CACHE.clear();
    SEARCH_LANGUAGE_RESULT_CACHE.clear();
  }
  return signature;
}

function buildIndexedLanguageSearchTerms(
  entry: LanguageCatalogEntry,
  locale: LanguageSearchLocale,
  localDisplayName: string,
  nativeDisplayName: string | undefined,
): IndexedLanguageSearchTerm[] {
  const localeQueryEntries = getLanguageQueryEntriesFromCatalog(entry.iso6393, locale);
  const rawTerms: IndexedLanguageSearchTerm[] = [
    ...entry.aliases.map((label) => ({ label, normalizedLabel: normalizeLanguageLabelKey(label), kind: 'alias' as const })),
    ...localeQueryEntries.map((entryLabel) => ({
      label: entryLabel.label,
      normalizedLabel: normalizeLanguageLabelKey(entryLabel.label),
      kind: entryLabel.kind,
    })),
    { label: localDisplayName, normalizedLabel: normalizeLanguageLabelKey(localDisplayName), kind: 'local' as const },
    ...(nativeDisplayName
      ? [{ label: nativeDisplayName, normalizedLabel: normalizeLanguageLabelKey(nativeDisplayName), kind: 'native' as const }]
      : []),
    ...entry.descriptions.map((label) => ({ label, normalizedLabel: normalizeLanguageLabelKey(label), kind: 'english' as const })),
    { label: entry.iso6393, normalizedLabel: entry.iso6393, kind: 'code' as const },
    ...(entry.iso6391 ? [{ label: entry.iso6391, normalizedLabel: entry.iso6391, kind: 'code' as const }] : []),
    ...(entry.iso6392B ? [{ label: entry.iso6392B, normalizedLabel: entry.iso6392B, kind: 'code' as const }] : []),
    ...(entry.iso6392T ? [{ label: entry.iso6392T, normalizedLabel: entry.iso6392T, kind: 'code' as const }] : []),
  ];

  const dedupedTerms: IndexedLanguageSearchTerm[] = [];
  const seen = new Set<string>();
  rawTerms.forEach((term) => {
    if (!term.normalizedLabel) {
      return;
    }
    const dedupeKey = `${term.kind}::${term.normalizedLabel}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    dedupedTerms.push(term);
  });
  return dedupedTerms;
}

function getIndexedLanguageSearchEntries(locale: LanguageSearchLocale): IndexedLanguageSearchEntry[] {
  const signature = ensureSearchCacheFresh();
  const cacheKey = `${locale}::${signature}`;
  const cached = SEARCH_LANGUAGE_INDEX_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const entries = Object.values(getMergedLanguageCatalogByCode()).map((entry) => {
    const localDisplayName = getLocaleDisplayName(entry, locale);
    const nativeDisplayName = getNativeDisplayName(entry);
    return {
      entry,
      searchTerms: buildIndexedLanguageSearchTerms(entry, locale, localDisplayName, nativeDisplayName),
    };
  });

  SEARCH_LANGUAGE_INDEX_CACHE.set(cacheKey, entries);
  trimSearchCache(SEARCH_LANGUAGE_INDEX_CACHE, 8);
  return entries;
}

function buildLanguageSearchCacheKey(
  normalizedQuery: string,
  locale: LanguageSearchLocale,
  maxResults: number,
): string {
  const signature = ensureSearchCacheFresh();
  return `${signature}::${locale}::${maxResults}::${normalizedQuery}`;
}

function resolveAnyLanguageCode(input: string): { languageId?: string; matchSource?: LanguageCatalogMatchSource } {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return {};
  const mergedCatalog = getMergedLanguageCatalogByCode(true);
  const runtimeCode = resolveRuntimeLanguageCode(normalized);
  if (runtimeCode && mergedCatalog[runtimeCode]) {
    return {
      languageId: mergedCatalog[runtimeCode]!.languageId,
      matchSource: runtimeCode === normalized ? 'iso6393-exact' : 'bcp47-primary',
    };
  }
  if (normalized.length === 3 && mergedCatalog[normalized]) {
    return { languageId: mergedCatalog[normalized]!.languageId, matchSource: 'iso6393-exact' };
  }
  if (normalized.length === 2 && ISO639_1_TO_3[normalized]) {
    return { languageId: mergedCatalog[ISO639_1_TO_3[normalized]]?.languageId ?? ISO639_1_TO_3[normalized], matchSource: 'iso6391-exact' };
  }
  if (normalized.length === 3 && ISO639_2_TO_3[normalized]) {
    return { languageId: mergedCatalog[ISO639_2_TO_3[normalized]]?.languageId ?? ISO639_2_TO_3[normalized], matchSource: 'iso6392-exact' };
  }
  return {};
}

function rankLanguageCatalogEntry(entry: LanguageCatalogEntry): number {
  const commonIndex = COMMON_LANGUAGE_INPUT_CODES.indexOf(entry.iso6393 as (typeof COMMON_LANGUAGE_INPUT_CODES)[number]);
  return commonIndex >= 0 ? commonIndex : COMMON_LANGUAGE_INPUT_CODES.length + 100;
}

export function getLanguageCatalogEntry(languageId: string | undefined): LanguageCatalogEntry | undefined {
  const normalized = languageId?.trim().toLowerCase();
  if (!normalized) return undefined;
  const resolvedCode = resolveRuntimeLanguageCode(normalized)
    ?? (normalized.length === 2 ? ISO639_1_TO_3[normalized] : undefined)
    ?? (normalized.length === 3 ? ISO639_2_TO_3[normalized] : undefined)
    ?? normalized;
  return getMergedLanguageCatalogByCode()[resolvedCode];
}

export function getLanguageDisplayName(languageId: string | undefined, locale: LanguageSearchLocale = 'zh-CN'): string {
  const entry = getLanguageCatalogEntry(languageId);
  if (!entry) {
    return (languageId ?? '').trim() || (locale === 'zh-CN' ? '未设置语言' : 'Language not set');
  }
  return getLocaleDisplayName(entry, locale);
}

export function getNativeLanguageDisplayName(languageId: string | undefined): string | undefined {
  const entry = getLanguageCatalogEntry(languageId);
  if (!entry) {
    return undefined;
  }
  return getNativeDisplayName(entry);
}

export function getLanguageDisplayNames(
  languageId: string | undefined,
  locale: LanguageSearchLocale = 'zh-CN',
): LanguageDisplayNames {
  const entry = getLanguageCatalogEntry(languageId);
  if (!entry) {
    const fallback = (languageId ?? '').trim() || (locale === 'zh-CN' ? '未设置语言' : 'Language not set');
    return {
      local: fallback,
      english: fallback,
    };
  }

  const nativeLabel = getNativeDisplayName(entry);
  return {
    local: getLocaleDisplayName(entry, locale),
    english: getEnglishDisplayName(entry),
    ...(nativeLabel ? { native: nativeLabel } : {}),
  };
}

function formatLanguageDisplayLabels(
  entry: LanguageCatalogEntry,
  locale: LanguageSearchLocale,
  primaryLabel?: string,
): string {
  const displayNames = getLanguageDisplayNames(entry.iso6393, locale);
  return dedupeLanguageLabels([
    primaryLabel,
    displayNames.local,
    displayNames.native,
    displayNames.english,
  ]).join(' · ');
}

export function formatLanguageCatalogMatch(match: LanguageCatalogMatch, locale: LanguageSearchLocale = 'zh-CN'): string {
  const displayName = formatLanguageDisplayLabels(
    match.entry,
    locale,
    match.matchedLabelKind === 'code' ? undefined : match.matchedLabel,
  );
  const scopeLabel = match.entry.scope === 'macrolanguage'
    ? (locale === 'zh-CN' ? '宏语言' : 'macrolanguage')
    : match.entry.scope;
  return `${displayName} · ${match.entry.iso6393}${scopeLabel !== 'individual' ? ` · ${scopeLabel}` : ''}`;
}

function appendLanguageCatalogSearchCountrySuffix(
  base: string,
  suggestion: LanguageCatalogSearchSuggestion,
  locale: LanguageSearchLocale,
): string {
  const bits: string[] = [];
  if (suggestion.distributionCountriesUi) {
    bits.push(locale === 'zh-CN' ? `分布：${suggestion.distributionCountriesUi}` : `Distribution: ${suggestion.distributionCountriesUi}`);
  }
  if (suggestion.officialCountriesUi) {
    bits.push(locale === 'zh-CN' ? `官方：${suggestion.officialCountriesUi}` : `Official: ${suggestion.officialCountriesUi}`);
  }
  if (!bits.length) {
    return base;
  }
  return `${base} · ${bits.join(' · ')}`;
}

export function formatLanguageCatalogSearchSuggestion(
  suggestion: LanguageCatalogSearchSuggestion,
  locale: LanguageSearchLocale = 'zh-CN',
): string {
  const entry = getLanguageCatalogEntry(suggestion.id) ?? getLanguageCatalogEntry(suggestion.languageCode);
  if (!entry) {
    return appendLanguageCatalogSearchCountrySuffix(
      `${suggestion.primaryLabel} · ${suggestion.languageCode}`,
      suggestion,
      locale,
    );
  }

  return appendLanguageCatalogSearchCountrySuffix(
    formatLanguageCatalogMatch({
      entry,
      score: suggestion.rank,
      matchSource: suggestion.matchedLabelKind === 'code' ? 'iso6393-exact' : 'contains',
      matchedLabel: suggestion.matchedLabel,
      matchedLabelKind: suggestion.matchedLabelKind,
      warnings: [],
    }, locale),
    suggestion,
    locale,
  );
}

export function pickAutoFillLanguageMatch(
  query: string,
  locale: LanguageSearchLocale = 'zh-CN',
  maxResults = 5,
): LanguageCatalogMatch | undefined {
  const matches = searchLanguageCatalog(query, locale, maxResults);
  return pickAutoFillLanguageMatchFromSuggestions(matches);
}

export function pickAutoFillLanguageMatchFromSuggestions(
  matches: readonly LanguageCatalogMatch[],
): LanguageCatalogMatch | undefined {
  const exactMatch = matches.find((match) => match.matchSource === 'alias-exact' || match.matchSource === 'name-exact');
  if (exactMatch) return exactMatch;
  if (matches.length === 1 && matches[0]?.matchSource === 'prefix') {
    return matches[0];
  }
  return undefined;
}

export function sanitizeLanguageCodeInput(input: string): string {
  return input.replace(/[^A-Za-z0-9-]/g, '').slice(0, 24).toLowerCase();
}

export function isDeferredLanguageCodeDraft(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  // 1-2 字母主子标签仍处于输入中 | 1-2 letter primary subtags are still in-progress drafts
  if (/^[a-z]{1,2}$/.test(trimmed)) return true;
  // 以连字符结尾 或 连字符后末段仅 1 个字符 → BCP 47 标签仍在输入中 | trailing hyphen or single-char final subtag → still typing a BCP 47 tag
  if (/[-]$|[-][a-z0-9]$/i.test(trimmed)) return true;
  return false;
}

export function searchLanguageCatalog(
  query: string,
  locale: LanguageSearchLocale = 'zh-CN',
  maxResults = 8,
): LanguageCatalogMatch[] {
  ensureSearchCacheFresh();
  const catalogByCode = getMergedLanguageCatalogByCode();
  const normalized = query.trim().toLowerCase();
  const searchCacheKey = buildLanguageSearchCacheKey(normalized, locale, maxResults);
  const cachedMatches = SEARCH_LANGUAGE_RESULT_CACHE.get(searchCacheKey);
  if (cachedMatches) {
    return cachedMatches;
  }

  if (!normalized) {
    const defaultMatches = COMMON_LANGUAGE_INPUT_CODES
      .map((code, index) => catalogByCode[code])
      .filter((entry): entry is LanguageCatalogEntry => Boolean(entry))
      .map((entry, index) => ({
        entry,
        score: 80 - index,
        matchSource: 'prefix' as const,
        matchedLabel: getLocaleDisplayName(entry, locale),
        matchedLabelKind: 'local' as const,
        warnings: buildWarningsForEntry(entry, locale),
      }));
    SEARCH_LANGUAGE_RESULT_CACHE.set(searchCacheKey, defaultMatches);
    trimSearchCache(SEARCH_LANGUAGE_RESULT_CACHE, SEARCH_LANGUAGE_CACHE_LIMIT);
    return defaultMatches;
  }

  const preset = AMBIGUOUS_QUERY_PRESETS[normalized];
  if (preset) {
    const presetMatches = preset
      .map((code, index) => catalogByCode[code])
      .filter((entry): entry is LanguageCatalogEntry => Boolean(entry))
      .map((entry, index) => ({
        entry,
        score: 96 - index,
        matchSource: 'ambiguous-preset' as const,
        matchedLabel: getLocaleDisplayName(entry, locale),
        matchedLabelKind: 'local' as const,
        warnings: buildWarningsForEntry(entry, locale),
      }));
    SEARCH_LANGUAGE_RESULT_CACHE.set(searchCacheKey, presetMatches);
    trimSearchCache(SEARCH_LANGUAGE_RESULT_CACHE, SEARCH_LANGUAGE_CACHE_LIMIT);
    return presetMatches;
  }

  const matches = getIndexedLanguageSearchEntries(locale)
    .map((indexedEntry): LanguageCatalogMatch | null => {
      const { entry, searchTerms } = indexedEntry;
      let score = 0;
      let matchSource: LanguageCatalogMatchSource | null = null;
      let matchedLabel = '';
      let matchedLabelKind: LanguageCatalogMatchedLabelKind = 'english';

      const exactAliasTerm = searchTerms.find((term) => term.kind === 'alias' && term.normalizedLabel === normalized);
      const exactLocalTerm = searchTerms.find((term) => term.kind === 'local' && term.normalizedLabel === normalized);
      const exactNativeTerm = searchTerms.find((term) => term.kind === 'native' && term.normalizedLabel === normalized);
      const exactEnglishTerm = searchTerms.find((term) => term.kind === 'english' && term.normalizedLabel === normalized);

      if (entry.iso6393 === normalized) {
        score = 100;
        matchSource = 'iso6393-exact';
        matchedLabel = entry.iso6393;
        matchedLabelKind = 'code';
      } else if (entry.iso6391 === normalized) {
        score = 98;
        matchSource = 'iso6391-exact';
        matchedLabel = entry.iso6391;
        matchedLabelKind = 'code';
      } else if (entry.iso6392B === normalized || entry.iso6392T === normalized) {
        score = 97;
        matchSource = 'iso6392-exact';
        matchedLabel = entry.iso6392B === normalized ? entry.iso6392B : entry.iso6392T ?? normalized;
        matchedLabelKind = 'code';
      } else if (exactAliasTerm) {
        score = 94;
        matchSource = 'alias-exact';
        matchedLabel = exactAliasTerm.label;
        matchedLabelKind = 'alias';
      } else if (exactLocalTerm) {
        score = 92;
        matchSource = 'name-exact';
        matchedLabel = exactLocalTerm.label;
        matchedLabelKind = 'local';
      } else if (exactNativeTerm) {
        score = 91;
        matchSource = 'name-exact';
        matchedLabel = exactNativeTerm.label;
        matchedLabelKind = 'native';
      } else if (exactEnglishTerm) {
        score = 90;
        matchSource = 'name-exact';
        matchedLabel = exactEnglishTerm.label;
        matchedLabelKind = 'english';
      } else {
        const prefixHit = searchTerms.find((term) => term.normalizedLabel.startsWith(normalized));
        const containsHit = searchTerms.find((term) => normalized.length >= 2 && term.normalizedLabel.includes(normalized));

        if (prefixHit) {
          score = 76;
          matchSource = 'prefix';
          matchedLabel = prefixHit.label;
          matchedLabelKind = prefixHit.kind;
        } else if (containsHit) {
          score = 62;
          matchSource = 'contains';
          matchedLabel = containsHit.label;
          matchedLabelKind = containsHit.kind;
        }
      }

      if (!matchSource || score <= 0) return null;
      return {
        entry,
        score: score - rankLanguageCatalogEntry(entry) * 0.01,
        matchSource,
        matchedLabel,
        matchedLabelKind,
        warnings: buildWarningsForEntry(entry, locale),
      };
    })
    .filter((match): match is LanguageCatalogMatch => Boolean(match))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return rankLanguageCatalogEntry(left.entry) - rankLanguageCatalogEntry(right.entry);
    });

  const finalMatches = matches.slice(0, maxResults);
  SEARCH_LANGUAGE_RESULT_CACHE.set(searchCacheKey, finalMatches);
  trimSearchCache(SEARCH_LANGUAGE_RESULT_CACHE, SEARCH_LANGUAGE_CACHE_LIMIT);
  return finalMatches;
}

export function resolveLanguageCodeInput(
  input: string,
  locale: LanguageSearchLocale = 'zh-CN',
): ResolvedLanguageCodeInput {
  const catalogByCode = getMergedLanguageCatalogByCode();
  const normalized = input.trim();
  if (!normalized) {
    return { status: 'empty', warnings: [] };
  }

  const direct = resolveAnyLanguageCode(normalized);
  if (direct.languageId) {
    const entry = Object.values(catalogByCode).find((candidate) => candidate.languageId === direct.languageId);
    if (!entry) {
      return { status: 'invalid', warnings: [] };
    }
    const warnings = buildWarningsForEntry(entry, locale);
    if (direct.matchSource === 'iso6391-exact') {
      warnings.unshift(locale === 'zh-CN'
        ? `已将 ISO 639-1 代码 ${normalized.toLowerCase()} 规范化为 ${entry.iso6393}。`
        : `Normalized ISO 639-1 code ${normalized.toLowerCase()} to ${entry.iso6393}.`);
    }
    if (direct.matchSource === 'iso6392-exact') {
      warnings.unshift(locale === 'zh-CN'
        ? `已将 ISO 639-2 代码 ${normalized.toLowerCase()} 规范化为 ${entry.iso6393}。`
        : `Normalized ISO 639-2 code ${normalized.toLowerCase()} to ${entry.iso6393}.`);
    }
    return {
      status: 'resolved',
      languageId: entry.languageId,
      languageName: getLocaleDisplayName(entry, locale),
      warnings,
    };
  }

  const parsedTag = parseLanguageTag(normalized);
  if (!parsedTag) {
    return { status: 'invalid', warnings: [] };
  }

  const canonicalPrimary = parsedTag.primaryLanguage;
  const canonicalCode = canonicalPrimary
    ? (resolveAnyLanguageCode(canonicalPrimary).languageId ?? toIso639_3(canonicalPrimary))
    : undefined;

  if (!canonicalCode || !catalogByCode[canonicalCode]) {
    return { status: 'invalid', warnings: [] };
  }

  const entry = catalogByCode[canonicalCode]!;
  const formattedTag = parsedTag.formattedTag;
  const warnings = buildWarningsForEntry(entry, locale);
  if (formattedTag.toLowerCase() !== canonicalCode.toLowerCase()) {
    warnings.unshift(locale === 'zh-CN'
      ? '检测到语言标签，已提取主语言代码；请同时确认脚本、地区和变体字段。'
      : 'Detected a language tag. The primary language was extracted; confirm script, region, and variant fields as well.');
  }

  return {
    status: 'resolved',
    languageId: entry.languageId,
    languageName: getLocaleDisplayName(entry, locale),
    ...(formattedTag.toLowerCase() !== canonicalCode.toLowerCase() ? { localeTag: formattedTag } : {}),
    ...(parsedTag.scriptTag ? { scriptTag: parsedTag.scriptTag } : {}),
    ...(parsedTag.regionTag ? { regionTag: parsedTag.regionTag } : {}),
    ...(parsedTag.variantTag ? { variantTag: parsedTag.variantTag } : {}),
    warnings,
  };
}

export function resolveLanguageCodeInputChange(
  rawInput: string,
  previousDisplayedCode: string,
  locale: LanguageSearchLocale = 'zh-CN',
): LanguageCodeInputChangeState {
  const sanitizedInput = sanitizeLanguageCodeInput(rawInput);
  const normalizedPreviousCode = sanitizeLanguageCodeInput(previousDisplayedCode);
  const deferred = isDeferredLanguageCodeDraft(sanitizedInput);
  const resolution = resolveLanguageCodeInput(sanitizedInput, locale);

  return {
    sanitizedInput,
    keepsDraft: sanitizedInput.length < normalizedPreviousCode.length || deferred,
    status: deferred ? 'deferred' : resolution.status,
    resolution,
  };
}
