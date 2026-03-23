/**
 * langMapping — ISO 639-3 → BCP-47 映射
 *
 * 用于将语料库的 ISO 639-3 语言标签转换为 Web Speech API 所需的 BCP-47 格式。
 * 覆盖 ~30 高频田野语言学语种 + 中国少数民族语言。
 *
 * @see 解语-语音智能体架构设计方案 §4.3
 */

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
