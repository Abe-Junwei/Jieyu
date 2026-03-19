/**
 * langMapping — ISO 639-3 → BCP-47 映射
 *
 * 用于将语料库的 ISO 639-3 语言标签转换为 Web Speech API 所需的 BCP-47 格式。
 * 覆盖 ~30 高频田野语言学语种 + 中国少数民族语言。
 *
 * @see 解语-语音智能体架构设计方案 §4.3
 */

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
  return Object.keys(ISO639_3_TO_BCP47);
}
