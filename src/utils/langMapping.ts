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
  zha: 'za',         // 壮语 (BCP-47 有码，但 STT 支持有限)
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
