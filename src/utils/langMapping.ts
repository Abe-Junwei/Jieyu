/**
 * langMapping — ISO 639-3 → BCP-47 映射
 *
 * 用于将语料库的 ISO 639-3 语言标签转换为 Web Speech API 所需的 BCP-47 格式。
 * 覆盖 ~30 高频田野语言学语种 + 中国少数民族语言。
 *
 * @see 解语-语音智能体架构设计方案 §4.3
 */

import languageTags from 'language-tags';
import { iso6393 } from 'iso-639-3';

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

// ── ISO 639-3 数据库索引 | ISO 639-3 database indexes ──

const ISO639_3_DB_CODE_SET: ReadonlySet<string> = new Set(
  iso6393
    .map((entry) => entry.iso6393.toLowerCase())
    .filter((code) => code.length > 0),
);

const ISO639_3_DB_NAME_TO_CODE: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of iso6393) {
    const code = entry.iso6393.toLowerCase();
    if (!code) continue;

    const refs = [entry.name, (entry as { invertedName?: string }).invertedName]
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

// ── 中国语种中文别名（按业务高频补充）| Chinese aliases for languages used in China ──
const CHINA_LANGUAGE_ALIAS: Readonly<Record<string, string>> = {
  // 汉语及方言群 | Sinitic languages and topolects
  '汉语': 'cmn', '国语': 'cmn', '國語': 'cmn', '华语': 'cmn', '華語': 'cmn', '普通话': 'cmn',
  '官话': 'cmn', '北方话': 'cmn', '北方方言': 'cmn', '中文': 'cmn', '中文普通话': 'cmn',
  '粤语': 'yue', '广东话': 'yue', '廣東話': 'yue', '白话': 'yue', '白話': 'yue',
  '吴语': 'wuu', '上海话': 'wuu', '上海话方言': 'wuu',
  '闽南语': 'nan', '閩南語': 'nan', '台语': 'nan', '臺語': 'nan', '河洛话': 'nan', '河洛話': 'nan',
  '客家语': 'hak', '客家話': 'hak', '客家话': 'hak',
  '赣语': 'gan', '贛語': 'gan',
  '晋语': 'cjy', '晉語': 'cjy',
  '湘语': 'hsn', '湘語': 'hsn',

  // 中国少数民族语言（常见称呼）| Common names for ethnic minority languages in China
  '藏语': 'bod', '藏文': 'bod', '藏語': 'bod',
  '维语': 'uig', '維語': 'uig', '维吾尔语': 'uig', '維吾爾語': 'uig',
  '蒙古语': 'mon', '蒙古文': 'mon', '蒙古語': 'mon',
  '壮语': 'zha', '壮文': 'zha', '壯語': 'zha',
  '朝鲜语': 'kor', '朝鮮語': 'kor', '韩国语': 'kor', '韓國語': 'kor', '韩语': 'kor', '韓語': 'kor',
  '哈萨克语': 'kaz', '哈薩克語': 'kaz',
  '柯尔克孜语': 'kir', '柯爾克孜語': 'kir', '吉尔吉斯语': 'kir', '吉爾吉斯語': 'kir',
  '塔吉克语': 'tgk', '塔吉克語': 'tgk',
  '锡伯语': 'sjo', '錫伯語': 'sjo',
  '满语': 'mnc', '滿語': 'mnc',
  '彝语': 'iii', '彝文': 'iii', '彝語': 'iii',
  '苗语': 'hmn', '苗語': 'hmn',
  '傈僳语': 'lis', '傈僳語': 'lis',
  '拉祜语': 'lhu', '拉祜語': 'lhu',
};

// ── 常见别名映射（覆盖用户口语化表达）| Common aliases for colloquial language names ──
const LANG_ALIAS: Readonly<Record<string, string>> = {
  '英文': 'eng', '中文': 'cmn', '日文': 'jpn', '韩文': 'kor', '法文': 'fra',
  '德文': 'deu', '西文': 'spa', '俄文': 'rus', '泰文': 'tha', '越文': 'vie',
  'english': 'eng', 'chinese': 'cmn', 'mandarin': 'cmn', 'cantonese': 'yue',
  'japanese': 'jpn', 'korean': 'kor', 'french': 'fra', 'german': 'deu',
  'spanish': 'spa', 'portuguese': 'por', 'italian': 'ita', 'russian': 'rus',
  'arabic': 'ara', 'thai': 'tha', 'vietnamese': 'vie', 'indonesian': 'ind',
  'hindi': 'hin', 'turkish': 'tur', 'dutch': 'nld', 'polish': 'pol',
  'hebrew': 'heb', 'swahili': 'swa', 'malay': 'msa', 'burmese': 'mya',
  'khmer': 'khm', 'tibetan': 'bod', 'nepali': 'nep', 'bengali': 'ben',
  'tamil': 'tam', 'urdu': 'urd', 'tagalog': 'tgl', 'amharic': 'amh',
  '韩国语': 'kor', '朝鲜语': 'kor',
  ...CHINA_LANGUAGE_ALIAS,
};

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

  // 1. 本身就是已知 ISO 639-3 代码 | Direct ISO 639-3 code
  if (ISO639_3_DB_CODE_SET.has(q) || q in ISO639_3_TO_BCP47) return q;

  // 2. 常见别名 | Common alias
  const alias = LANG_ALIAS[q];
  if (alias) return alias;

  // 3. ISO 639-3 名称库（英文）精确匹配 | Exact match against ISO 639-3 name database
  const dbExact = ISO639_3_DB_NAME_TO_CODE[q];
  if (dbExact) return dbExact;

  // 4 & 5. 遍历 label 精确/模糊匹配 | Label exact / fuzzy match
  const allLangs = SUPPORTED_VOICE_LANGS.flatMap((g) => g.langs)
    .filter((l) => l.code !== '__auto__');

  for (const lang of allLangs) {
    if (lang.label.toLowerCase() === q) return lang.code;
  }
  for (const lang of allLangs) {
    if (lang.label.toLowerCase().includes(q) || q.includes(lang.label.toLowerCase())) {
      return lang.code;
    }
  }

  return undefined;
}

export type LanguageSearchLocale = 'zh-CN' | 'en-US';

export type LanguageCatalogEntry = {
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

const COMMON_LANGUAGE_INPUT_CODES = [
  'cmn', 'zho', 'yue', 'wuu', 'nan', 'hak',
  'eng', 'jpn', 'kor', 'fra', 'deu', 'spa', 'rus', 'ara', 'por', 'hin', 'vie', 'tha', 'msa', 'ind', 'bod',
] as const;

const ZH_DISPLAY_NAME_BY_CODE: Readonly<Record<string, string>> = {
  cmn: '普通话',
  zho: '中文',
  yue: '粤语',
  wuu: '吴语',
  nan: '闽南语',
  hak: '客家话',
  gan: '赣语',
  cjy: '晋语',
  hsn: '湘语',
  eng: '英语',
  jpn: '日语',
  kor: '韩语',
  fra: '法语',
  deu: '德语',
  spa: '西班牙语',
  rus: '俄语',
  ara: '阿拉伯语',
  por: '葡萄牙语',
  hin: '印地语',
  vie: '越南语',
  tha: '泰语',
  msa: '马来语',
  ind: '印尼语',
  bod: '藏语',
  uig: '维吾尔语',
  mon: '蒙古语',
  zha: '壮语',
  kaz: '哈萨克语',
  kir: '吉尔吉斯语',
  tgk: '塔吉克语',
  sjo: '锡伯语',
  mnc: '满语',
  iii: '彝语',
  hmn: '苗语',
  lis: '傈僳语',
  lhu: '拉祜语',
  amh: '阿姆哈拉语',
  khm: '高棉语',
  mya: '缅甸语',
  tgl: '他加禄语',
  ben: '孟加拉语',
  tam: '泰米尔语',
  urd: '乌尔都语',
  nep: '尼泊尔语',
  und: '未定语言',
};

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
  for (const entry of iso6393) {
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
  for (const entry of iso6393) {
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

const ALIASES_BY_CODE: Readonly<Record<string, string[]>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const [alias, code] of Object.entries(LANG_ALIAS)) {
    const bucket = map.get(code) ?? new Set<string>();
    bucket.add(alias);
    map.set(code, bucket);
  }
  return Object.fromEntries(Array.from(map.entries()).map(([code, aliases]) => [code, Array.from(aliases.values())]));
})();

const MACROLANGUAGE_BY_CODE: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of iso6393) {
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

const LANGUAGE_CATALOG_BY_CODE: Readonly<Record<string, LanguageCatalogEntry>> = (() => {
  const map: Record<string, LanguageCatalogEntry> = {};
  for (const entry of iso6393) {
    const code = entry.iso6393.toLowerCase();
    if (!code) continue;
    const subtag = languageTags.language(code) ?? languageTags.type(code, 'extlang');
    const preferred = subtag?.preferred()?.format().toLowerCase();
    const preferredIso6393 = preferred
      ? (ISO639_1_TO_3[preferred] ?? ISO639_2_TO_3[preferred] ?? (isKnownIso639_3Code(preferred) ? preferred : undefined))
      : undefined;
    map[code] = {
      iso6393: code,
      ...(entry.iso6391 ? { iso6391: entry.iso6391.toLowerCase() } : {}),
      ...(entry.iso6392B ? { iso6392B: entry.iso6392B.toLowerCase() } : {}),
      ...(entry.iso6392T ? { iso6392T: entry.iso6392T.toLowerCase() } : {}),
      name: entry.name,
      ...((entry as { invertedName?: string }).invertedName ? { invertedName: (entry as { invertedName?: string }).invertedName } : {}),
      ...(ZH_DISPLAY_NAME_BY_CODE[code] ? { displayNameZh: ZH_DISPLAY_NAME_BY_CODE[code] } : {}),
      aliases: ALIASES_BY_CODE[code] ?? [],
      scope: ((subtag?.scope() ?? entry.scope ?? 'individual') as LanguageCatalogEntry['scope']),
      type: (entry.type as LanguageCatalogEntry['type']),
      descriptions: Array.from(new Set([
        entry.name,
        (entry as { invertedName?: string }).invertedName,
        ...(subtag?.descriptions() ?? []),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))),
      deprecated: subtag?.deprecated() !== null,
      ...(preferredIso6393 && preferredIso6393 !== code ? { preferredIso6393 } : {}),
      ...(subtag?.script() ? { suppressScript: subtag.script()!.format() } : {}),
      ...(MACROLANGUAGE_BY_CODE[code] ? { macrolanguage: MACROLANGUAGE_BY_CODE[code] } : {}),
    };
  }
  return map;
})();

function getLocaleDisplayName(entry: LanguageCatalogEntry, locale: LanguageSearchLocale): string {
  if (locale === 'zh-CN' && entry.displayNameZh) return entry.displayNameZh;
  return entry.descriptions[0] ?? entry.name;
}

function getMacrolanguageHint(entry: LanguageCatalogEntry, locale: LanguageSearchLocale): string | undefined {
  if (entry.scope !== 'macrolanguage') return undefined;
  const members = Object.values(LANGUAGE_CATALOG_BY_CODE)
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

function resolveAnyLanguageCode(input: string): { languageId?: string; matchSource?: LanguageCatalogMatchSource } {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return {};
  if (normalized.length === 3 && LANGUAGE_CATALOG_BY_CODE[normalized]) {
    return { languageId: normalized, matchSource: 'iso6393-exact' };
  }
  if (normalized.length === 2 && ISO639_1_TO_3[normalized]) {
    return { languageId: ISO639_1_TO_3[normalized], matchSource: 'iso6391-exact' };
  }
  if (normalized.length === 3 && ISO639_2_TO_3[normalized]) {
    return { languageId: ISO639_2_TO_3[normalized], matchSource: 'iso6392-exact' };
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
  return LANGUAGE_CATALOG_BY_CODE[normalized];
}

export function getLanguageDisplayName(languageId: string | undefined, locale: LanguageSearchLocale = 'zh-CN'): string {
  const entry = getLanguageCatalogEntry(languageId);
  if (!entry) {
    return (languageId ?? '').trim() || (locale === 'zh-CN' ? '未设置语言' : 'Language not set');
  }
  return getLocaleDisplayName(entry, locale);
}

export function formatLanguageCatalogMatch(match: LanguageCatalogMatch, locale: LanguageSearchLocale = 'zh-CN'): string {
  const displayName = getLocaleDisplayName(match.entry, locale);
  const scopeLabel = match.entry.scope === 'macrolanguage'
    ? (locale === 'zh-CN' ? '宏语言' : 'macrolanguage')
    : match.entry.scope;
  return `${displayName} · ${match.entry.iso6393}${scopeLabel !== 'individual' ? ` · ${scopeLabel}` : ''}`;
}

export function searchLanguageCatalog(
  query: string,
  locale: LanguageSearchLocale = 'zh-CN',
  maxResults = 8,
): LanguageCatalogMatch[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return COMMON_LANGUAGE_INPUT_CODES
      .map((code, index) => LANGUAGE_CATALOG_BY_CODE[code])
      .filter((entry): entry is LanguageCatalogEntry => Boolean(entry))
      .map((entry, index) => ({
        entry,
        score: 80 - index,
        matchSource: 'prefix' as const,
        warnings: buildWarningsForEntry(entry, locale),
      }));
  }

  const preset = AMBIGUOUS_QUERY_PRESETS[normalized];
  if (preset) {
    return preset
      .map((code, index) => LANGUAGE_CATALOG_BY_CODE[code])
      .filter((entry): entry is LanguageCatalogEntry => Boolean(entry))
      .map((entry, index) => ({
        entry,
        score: 96 - index,
        matchSource: 'ambiguous-preset' as const,
        warnings: buildWarningsForEntry(entry, locale),
      }));
  }

  const matches = Object.values(LANGUAGE_CATALOG_BY_CODE)
    .map((entry): LanguageCatalogMatch | null => {
      let score = 0;
      let matchSource: LanguageCatalogMatchSource | null = null;

      if (entry.iso6393 === normalized) {
        score = 100;
        matchSource = 'iso6393-exact';
      } else if (entry.iso6391 === normalized) {
        score = 98;
        matchSource = 'iso6391-exact';
      } else if (entry.iso6392B === normalized || entry.iso6392T === normalized) {
        score = 97;
        matchSource = 'iso6392-exact';
      } else if (entry.aliases.some((alias) => alias.toLowerCase() === normalized)) {
        score = 94;
        matchSource = 'alias-exact';
      } else if (entry.descriptions.some((description) => description.trim().toLowerCase() === normalized)) {
        score = 92;
        matchSource = 'name-exact';
      } else {
        const searchTerms = [
          ...entry.aliases,
          ...entry.descriptions,
          ...(entry.displayNameZh ? [entry.displayNameZh] : []),
          entry.iso6393,
          ...(entry.iso6391 ? [entry.iso6391] : []),
          ...(entry.iso6392B ? [entry.iso6392B] : []),
          ...(entry.iso6392T ? [entry.iso6392T] : []),
        ].map((term) => term.trim().toLowerCase());

        const prefixHit = searchTerms.find((term) => term.startsWith(normalized));
        const containsHit = searchTerms.find((term) => normalized.length >= 2 && term.includes(normalized));

        if (prefixHit) {
          score = 76;
          matchSource = 'prefix';
        } else if (containsHit) {
          score = 62;
          matchSource = 'contains';
        }
      }

      if (!matchSource || score <= 0) return null;
      return {
        entry,
        score: score - rankLanguageCatalogEntry(entry) * 0.01,
        matchSource,
        warnings: buildWarningsForEntry(entry, locale),
      };
    })
    .filter((match): match is LanguageCatalogMatch => Boolean(match))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return rankLanguageCatalogEntry(left.entry) - rankLanguageCatalogEntry(right.entry);
    });

  return matches.slice(0, maxResults);
}

export function resolveLanguageCodeInput(
  input: string,
  locale: LanguageSearchLocale = 'zh-CN',
): ResolvedLanguageCodeInput {
  const normalized = input.trim();
  if (!normalized) {
    return { status: 'empty', warnings: [] };
  }

  const direct = resolveAnyLanguageCode(normalized);
  if (direct.languageId) {
    const entry = LANGUAGE_CATALOG_BY_CODE[direct.languageId];
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
      languageId: entry.iso6393,
      languageName: getLocaleDisplayName(entry, locale),
      warnings,
    };
  }

  const maybeTag = languageTags(normalized);
  const preferredTag = maybeTag.preferred?.() ?? maybeTag;
  const subtags = preferredTag.subtags?.() ?? [];
  const scriptSubtag = subtags.find((subtag) => subtag.type() === 'script');
  const regionSubtag = subtags.find((subtag) => subtag.type() === 'region');
  const variantSubtags = subtags.filter((subtag) => subtag.type() === 'variant');
  const extlangSubtag = subtags.find((subtag) => subtag.type() === 'extlang');
  const languageSubtag = extlangSubtag ?? preferredTag.language?.() ?? subtags.find((subtag) => subtag.type() === 'language');
  const canonicalPrimary = languageSubtag?.format().toLowerCase();
  const canonicalCode = canonicalPrimary
    ? (resolveAnyLanguageCode(canonicalPrimary).languageId ?? toIso639_3(canonicalPrimary))
    : undefined;

  if (!canonicalCode || !LANGUAGE_CATALOG_BY_CODE[canonicalCode]) {
    return { status: 'invalid', warnings: [] };
  }

  const entry = LANGUAGE_CATALOG_BY_CODE[canonicalCode]!;
  const formattedTag = preferredTag.format?.() ?? normalized;
  const warnings = buildWarningsForEntry(entry, locale);
  if (formattedTag.toLowerCase() !== canonicalCode.toLowerCase()) {
    warnings.unshift(locale === 'zh-CN'
      ? '检测到语言标签，已提取主语言代码；请同时确认脚本、地区和变体字段。'
      : 'Detected a language tag. The primary language was extracted; confirm script, region, and variant fields as well.');
  }

  return {
    status: 'resolved',
    languageId: canonicalCode,
    languageName: getLocaleDisplayName(entry, locale),
    ...(formattedTag.toLowerCase() !== canonicalCode.toLowerCase() ? { localeTag: formattedTag } : {}),
    ...(scriptSubtag ? { scriptTag: scriptSubtag.format() } : {}),
    ...(regionSubtag ? { regionTag: regionSubtag.format() } : {}),
    ...(variantSubtags.length > 0 ? { variantTag: variantSubtags.map((subtag) => subtag.format()).join('-') } : {}),
    warnings,
  };
}
