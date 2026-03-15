import type { TranslationLayerDocType } from '../../db';

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
  const normalized = (code ?? '').trim().toLowerCase();
  if (!normalized) {
    return '未设置语言';
  }
  const name = LANGUAGE_NAME_MAP[normalized];
  return name ? `${name} ${normalized}` : normalized;
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

export function getLayerLabelParts(layer: TranslationLayerDocType): { type: string; lang: string } {
  const code = (layer.languageId ?? '').trim().toLowerCase();
  const typeLabel = layer.layerType === 'translation' ? '翻译' : '转写';
  const langLabel = COMMON_LANGUAGES.find((l) => l.code === code)?.label ?? code;
  const alias = layer.name.zho
    ?? layer.name.zh
    ?? layer.name.cmn
    ?? layer.name.eng
    ?? layer.name.en
    ?? Object.values(layer.name).find((value) => typeof value === 'string' && value.trim().length > 0)
    ?? '';
  const hasAutoPrefix = alias.startsWith('转写') || alias.startsWith('翻译');
  if (hasAutoPrefix || !alias) {
    return { type: typeLabel, lang: langLabel };
  }
  // Legacy manually named layers
  return { type: typeLabel, lang: alias + (langLabel ? `（${langLabel}）` : '') };
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
