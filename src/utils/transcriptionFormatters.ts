import type { TranslationLayerDocType } from '../db';

export const LANGUAGE_NAME_MAP: Record<string, string> = {
  cmn: '普通话',
  zho: '中文',
  yue: '粤语',
  eng: '英语',
  jpn: '日语',
  kor: '韩语',
  fra: '法语',
  deu: '德语',
  spa: '西班牙语',
  rus: '俄语',
  ara: '阿拉伯语',
};

/** BCP 47 已知变体标签的人类可读名 | Human-readable names for well-known BCP 47 variant subtags */
const VARIANT_LABEL_MAP: Record<string, string> = {
  fonipa: 'IPA',
  fonupa: 'UPA',
  fonxsamp: 'X-SAMPA',
  pinyin: '拼音',
  wadegile: '威妥玛',
  jyutping: '粤拼',
};

/**
 * 解析 BCP 47 语言标签 | Parse a BCP 47 language tag into constituent subtags.
 * 例: "mvm-fonipa-x-emc" → { primary: 'mvm', variants: ['fonipa'], privateUse: 'x-emc' }
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

  // 私用扩展 x-... 在最后 | Private-use extension comes last
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
      // 脚本子标签（4 字母） | Script subtag (4 letters)
      script = st;
    } else if (st.length === 2 && /^[A-Za-z]{2}$/.test(st) && !region) {
      // 区域子标签（2 字母） | Region subtag (2 letters)
      region = st.toUpperCase();
    } else if (st.length === 3 && /^[0-9]{3}$/.test(st) && !region) {
      // 区域子标签（3 数字） | Region subtag (3 digits)
      region = st;
    } else if (st.length >= 5 || (st.length === 4 && /^[0-9]/.test(st))) {
      // 变体子标签 | Variant subtag
      variants.push(st.toLowerCase());
    } else if (st.length === 1) {
      // 扩展前缀 | Extension prefix singleton — collect rest until next singleton/end
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
 * 从 BCP 47 标签生成人类可读的展示名 | Generate a human-readable display name from a BCP 47 tag.
 * 例: "mvm-fonipa-x-emc" → "mvm (IPA, x-emc)"
 * 例: "cmn" → "普通话 cmn"
 */
export function formatBcp47Label(tag: string): string {
  const parsed = parseBcp47(tag);
  if (!parsed.primary) return '未设置语言';

  const baseName = LANGUAGE_NAME_MAP[parsed.primary]
    ?? COMMON_LANGUAGES.find((l) => l.code === parsed.primary)?.label;

  const extras: string[] = [];
  for (const v of parsed.variants) {
    extras.push(VARIANT_LABEL_MAP[v] ?? v);
  }
  if (parsed.privateUse) extras.push(parsed.privateUse);

  const base = baseName ? `${baseName} ${parsed.primary}` : parsed.primary;
  return extras.length > 0 ? `${base} (${extras.join(', ')})` : base;
}

/**
 * 判断 tier 名称是否像 BCP 47 标签，如果是则生成人类可读名 | Detect if a tier name looks like a BCP 47 tag and humanize it.
 * 例: "mvm-fonipa-x-emc" → "mvm (IPA, x-emc)"  (是 BCP 47 → 转换)
 * 例: "English translation" → "English translation"  (普通名称 → 保持原样)
 * 例: "default" → "default"  (单词 → 保持原样)
 */
export function humanizeTierName(tierName: string): string {
  const trimmed = tierName.trim();
  if (!trimmed) return 'Transcription';
  // 含空格的一定不是 BCP 47 标签 | Contains space → not a BCP 47 tag
  if (/\s/.test(trimmed)) return trimmed;
  const parsed = parseBcp47(trimmed);
  // 主语言子标签 2-3 字母 + 至少有可解析的子标记 → 视为 BCP 47 | Primary is 2-3 letters with subtags → BCP 47
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
    return '未设置语言';
  }
  return formatBcp47Label(normalized);
}

export function formatLayerLanguageLabel(layer: TranslationLayerDocType): string {
  const nameCandidates = [
    layer.name.zho,
    layer.name.zh,
    layer.name.cmn,
    layer.name.eng,
    layer.name.en,
    ...Object.values(layer.name),
  ];
  const preferredName = nameCandidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
  const code = (layer.languageId ?? '').trim().toLowerCase();
  if (!preferredName) {
    return formatLanguageLabel(code);
  }
  if (!code) {
    return preferredName;
  }
  return `${preferredName} (${code})`;
}

export function formatLayerRailLabel(layer: TranslationLayerDocType): string {
  const { type, lang } = getLayerLabelParts(layer);
  return lang ? `${type} · ${lang}` : type;
}

export function getLayerLabelParts(layer: TranslationLayerDocType): { type: string; lang: string; alias: string } {
  const code = (layer.languageId ?? '').trim();
  const typeLabel = layer.layerType === 'translation' ? '翻译' : '转写';
  const langLabel = formatBcp47Label(code) || code;
  const alias = layer.name.zho
    ?? layer.name.zh
    ?? layer.name.cmn
    ?? layer.name.eng
    ?? layer.name.en
    ?? Object.values(layer.name).find((value) => typeof value === 'string' && value.trim().length > 0)
    ?? '';
  const hasAutoPrefix = alias.startsWith('转写') || alias.startsWith('翻译');
  if (hasAutoPrefix || !alias) {
    return { type: typeLabel, lang: langLabel, alias: '' };
  }
  // Legacy manually named layers — show alias as third line
  return { type: typeLabel, lang: langLabel, alias };
}

export const COMMON_LANGUAGES = [
  { code: 'cmn', label: '普通话' },
  { code: 'zho', label: '中文' },
  { code: 'yue', label: '粤语' },
  { code: 'wuu', label: '吴语' },
  { code: 'nan', label: '闽南语' },
  { code: 'hak', label: '客家话' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: '日本語' },
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
