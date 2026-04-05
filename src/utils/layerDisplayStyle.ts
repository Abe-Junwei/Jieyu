/**
 * 层级显示样式工具：脚本→字体映射、行高联动、CSS 转换
 * Layer display style utilities: script→font mapping, lane height coupling, CSS conversion
 */

import type { CSSProperties } from 'react';
import type { LayerDisplaySettings, OrthographyDocType } from '../db';

// ── Types | 类型 ────────────────────────────────────────────

export interface FontPreset {
  key: string;
  css: string;
  ipaSupport: boolean;
  license: 'OFL' | 'Apache-2.0';
}

export interface LocalFontEntry {
  family: string;
  postscriptNames: string[];
  fullNames: string[];
}

export interface LocalFontState {
  status: 'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported';
  fonts: LocalFontEntry[];
}

export interface FontCoverageVerification {
  status: 'verified' | 'missing-glyphs' | 'shaping-risk' | 'unchecked' | 'unsupported';
  checkedAt?: string;
  sampleText: string;
  source: 'cache' | 'runtime' | 'none';
}

export interface OrthographyCoverageSummary {
  confidence: 'script-only' | 'sample-backed';
  exemplarCharacterCount: number;
  exemplarSample: string;
  warning?: string;
}

export interface OrthographyRenderPolicy {
  orthography?: OrthographyDocType;
  scriptTag: string;
  direction: NonNullable<OrthographyDocType['direction']>;
  textDirection: 'ltr' | 'rtl';
  ipaMode: boolean;
  defaultFontKey: string;
  defaultFontCss: string;
  preferredFontKeys: string[];
  fallbackFontKeys: string[];
  resolvedFontKeys: string[];
  fontPresets: FontPreset[];
  coverageSummary: OrthographyCoverageSummary;
  lineHeightScale: number;
  isolateInlineRuns: boolean;
  preferDirAttribute: boolean;
}

export interface OrthographyPreviewTextProps {
  dir?: 'ltr' | 'rtl';
  style: CSSProperties;
}

const STRICT_RUNTIME_FALLBACK_SCRIPTS = new Set([
  'Hans', 'Hant', 'Jpan', 'Kore', 'Arab', 'Deva', 'Thai', 'Tibt',
  'Beng', 'Taml', 'Mymr', 'Ethi', 'Khmr', 'Guru', 'Mlym', 'Telu',
  'Knda', 'Sinh', 'Laoo', 'Geor', 'Hebr',
]);

const SHAPING_RISK_SCRIPTS = new Set([
  'Arab', 'Deva', 'Thai', 'Tibt', 'Beng', 'Taml', 'Mymr', 'Ethi',
  'Khmr', 'Guru', 'Mlym', 'Telu', 'Knda', 'Sinh', 'Laoo',
]);

function dedupeNonEmptyStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

function collectOrthographyExemplarCharacters(orthography?: OrthographyDocType): string[] {
  if (!orthography?.exemplarCharacters) return [];
  const {
    main = [],
    auxiliary = [],
    numbers = [],
    punctuation = [],
    index = [],
  } = orthography.exemplarCharacters;
  return dedupeNonEmptyStrings([
    ...main,
    ...auxiliary,
    ...numbers,
    ...punctuation,
    ...index,
  ]);
}

function buildOrthographyCoverageSummary(orthography?: OrthographyDocType): OrthographyCoverageSummary {
  const exemplars = collectOrthographyExemplarCharacters(orthography);
  if (exemplars.length === 0) {
    return {
      confidence: 'script-only',
      exemplarCharacterCount: 0,
      exemplarSample: '',
      warning: '未配置示例字符，当前仅提供脚本级字体推荐。',
    };
  }
  return {
    confidence: 'sample-backed',
    exemplarCharacterCount: exemplars.length,
    exemplarSample: exemplars.slice(0, 8).join(' '),
  };
}

const SCRIPT_FONT_PROBE_TEXT: Record<string, string> = {
  Latn: 'a e i o u ɕ ʈ ɲ ə',
  Hans: '你好语言学',
  Hant: '你好語言學',
  Jpan: 'かなカナ日本語',
  Kore: '한글언어학',
  Arab: 'ابتثجحخ ١٢٣ ، ؛ ؟ لِلّٰهِ',
  Deva: 'अआइईकखगघ क्ष त्र ज्ञ कि कु के कं',
  Thai: 'ภาษาไทย เกิ้ก ก้า น้ำ',
  Tibt: 'ཀཁགངཨོ རྒྱལ སྐད',
  Beng: 'বাংলা ভাষা',
  Taml: 'தமிழ்மொழி',
  Mymr: 'မြန်မာစာ ကွေး ကြွော ါ့',
  Ethi: 'አበገደ',
  Khmr: 'ភាសាខ្មែរ ក្រោះ កាំ',
  Guru: 'ਪੰਜਾਬੀ',
  Mlym: 'മലയാളം',
  Telu: 'తెలుగు',
  Knda: 'ಕನ್ನಡ',
  Sinh: 'සිංහල',
  Laoo: 'ພາສາລາວ',
  Geor: 'ქართული',
  Hebr: 'עברית',
};

const FONT_COVERAGE_CACHE_STORAGE_KEY = 'jieyu:font-coverage-cache:v2';
const FONT_COVERAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type StoredFontCoverageVerification = {
  status: Extract<FontCoverageVerification['status'], 'verified' | 'missing-glyphs' | 'shaping-risk'>;
  checkedAt: string;
  sampleText: string;
};

let fontCoverageCacheLoaded = false;
let fontCoverageCache: Record<string, StoredFontCoverageVerification> = {};

function normalizeProbeText(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function readFontCoverageCache(): Record<string, StoredFontCoverageVerification> {
  if (fontCoverageCacheLoaded) return fontCoverageCache;
  fontCoverageCacheLoaded = true;
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    fontCoverageCache = {};
    return fontCoverageCache;
  }
  try {
    const raw = window.localStorage.getItem(FONT_COVERAGE_CACHE_STORAGE_KEY);
    fontCoverageCache = raw ? JSON.parse(raw) as Record<string, StoredFontCoverageVerification> : {};
  } catch {
    fontCoverageCache = {};
  }
  return fontCoverageCache;
}

function persistFontCoverageCache(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(FONT_COVERAGE_CACHE_STORAGE_KEY, JSON.stringify(fontCoverageCache));
  } catch {
    // noop
  }
}

export function clearFontCoverageVerificationCache(): void {
  fontCoverageCacheLoaded = true;
  fontCoverageCache = {};
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.removeItem(FONT_COVERAGE_CACHE_STORAGE_KEY);
}

export function buildFontCoverageProbeText(renderPolicy: OrthographyRenderPolicy): string {
  const exemplarText = collectOrthographyExemplarCharacters(renderPolicy.orthography).join(' ');
  const strictScriptProbe = renderPolicy.ipaMode
    ? SCRIPT_FONT_PROBE_TEXT.Latn
    : SCRIPT_FONT_PROBE_TEXT[renderPolicy.scriptTag];
  if (exemplarText.trim().length > 0) {
    if (strictScriptProbe && SHAPING_RISK_SCRIPTS.has(renderPolicy.scriptTag)) {
      return normalizeProbeText(`${exemplarText} ${strictScriptProbe}`);
    }
    return normalizeProbeText(exemplarText);
  }
  const fallbackProbe = strictScriptProbe ?? SCRIPT_FONT_PROBE_TEXT.Latn ?? '';
  return normalizeProbeText(fallbackProbe);
}

function resolveFontCoverageStatus(
  fontFamily: string,
  renderPolicy: OrthographyRenderPolicy,
  verified: boolean,
): Extract<FontCoverageVerification['status'], 'verified' | 'missing-glyphs' | 'shaping-risk'> {
  if (!verified) return 'missing-glyphs';
  if (SHAPING_RISK_SCRIPTS.has(renderPolicy.scriptTag) && !isKnownFontPresetKey(fontFamily)) {
    return 'shaping-risk';
  }
  return 'verified';
}

export function getFontCoverageVerificationCacheKey(
  fontFamily: string,
  renderPolicy: OrthographyRenderPolicy,
): string {
  return [
    normalizeFontSearchValue(fontFamily),
    renderPolicy.scriptTag,
    buildFontCoverageProbeText(renderPolicy),
  ].join('::');
}

export function getCachedFontCoverageVerification(
  fontFamily: string,
  renderPolicy: OrthographyRenderPolicy,
): FontCoverageVerification | undefined {
  if (!fontFamily || fontFamily === '系统默认') return undefined;
  const cacheKey = getFontCoverageVerificationCacheKey(fontFamily, renderPolicy);
  const cache = readFontCoverageCache();
  const entry = cache[cacheKey];
  if (!entry) return undefined;
  if (Date.now() - Date.parse(entry.checkedAt) > FONT_COVERAGE_CACHE_TTL_MS) {
    delete cache[cacheKey];
    persistFontCoverageCache();
    return undefined;
  }
  return {
    status: entry.status,
    checkedAt: entry.checkedAt,
    sampleText: entry.sampleText,
    source: 'cache',
  };
}

export async function verifyFontCoverage(
  fontFamily: string,
  renderPolicy: OrthographyRenderPolicy,
): Promise<FontCoverageVerification> {
  const cached = getCachedFontCoverageVerification(fontFamily, renderPolicy);
  if (cached) return cached;

  const sampleText = buildFontCoverageProbeText(renderPolicy);
  if (!fontFamily || fontFamily === '系统默认') {
    return { status: 'unchecked', sampleText, source: 'none' };
  }
  if (typeof document === 'undefined' || !('fonts' in document) || typeof document.fonts?.check !== 'function') {
    return { status: 'unsupported', sampleText, source: 'none' };
  }

  const shorthand = `16px "${fontFamily}"`;
  if (typeof document.fonts.load === 'function') {
    try {
      await document.fonts.load(shorthand, sampleText);
    } catch {
      // noop
    }
  }

  const verified = document.fonts.check(shorthand, sampleText);
  const verificationStatus = resolveFontCoverageStatus(fontFamily, renderPolicy, verified);
  const result: FontCoverageVerification = {
    status: verificationStatus,
    checkedAt: new Date().toISOString(),
    sampleText,
    source: 'runtime',
  };
  if (result.checkedAt) {
    fontCoverageCache[getFontCoverageVerificationCacheKey(fontFamily, renderPolicy)] = {
      status: verificationStatus,
      checkedAt: result.checkedAt,
      sampleText,
    };
  }
  persistFontCoverageCache();
  return result;
}

// ── Script → Font mapping | 脚本→字体映射 ───────────────────

const SCRIPT_FONT_MAP: Record<string, FontPreset[]> = {
  Latn: [
    { key: 'Noto Sans',           css: '"Noto Sans", sans-serif',           ipaSupport: true,  license: 'OFL' },
    { key: 'Noto Serif',          css: '"Noto Serif", serif',               ipaSupport: true,  license: 'OFL' },
    { key: 'Charis SIL',          css: '"Charis SIL", serif',               ipaSupport: true,  license: 'OFL' },
    { key: 'Doulos SIL',          css: '"Doulos SIL", serif',               ipaSupport: true,  license: 'OFL' },
    { key: 'Gentium Plus',        css: '"Gentium Plus", serif',             ipaSupport: true,  license: 'OFL' },
    { key: 'Andika',              css: '"Andika", sans-serif',              ipaSupport: true,  license: 'OFL' },
  ],
  Hans: [
    { key: 'Noto Sans SC',        css: '"Noto Sans SC", sans-serif',        ipaSupport: false, license: 'OFL' },
    { key: 'Noto Serif SC',       css: '"Noto Serif SC", serif',            ipaSupport: false, license: 'OFL' },
  ],
  Hant: [
    { key: 'Noto Sans TC',        css: '"Noto Sans TC", sans-serif',        ipaSupport: false, license: 'OFL' },
    { key: 'Noto Serif TC',       css: '"Noto Serif TC", serif',            ipaSupport: false, license: 'OFL' },
  ],
  Arab: [
    { key: 'Noto Sans Arabic',    css: '"Noto Sans Arabic", sans-serif',    ipaSupport: false, license: 'OFL' },
    { key: 'Noto Naskh Arabic',   css: '"Noto Naskh Arabic", serif',        ipaSupport: false, license: 'OFL' },
    { key: 'Scheherazade New',    css: '"Scheherazade New", serif',         ipaSupport: false, license: 'OFL' },
    { key: 'Awami Nastaliq',      css: '"Awami Nastaliq", serif',           ipaSupport: false, license: 'OFL' },
    { key: 'Harmattan',           css: '"Harmattan", sans-serif',           ipaSupport: false, license: 'OFL' },
  ],
  Deva: [
    { key: 'Noto Sans Devanagari',  css: '"Noto Sans Devanagari", sans-serif',  ipaSupport: false, license: 'OFL' },
    { key: 'Noto Serif Devanagari', css: '"Noto Serif Devanagari", serif',      ipaSupport: false, license: 'OFL' },
    { key: 'Annapurna SIL',         css: '"Annapurna SIL", serif',              ipaSupport: false, license: 'OFL' },
  ],
  Thai: [
    { key: 'Noto Sans Thai',      css: '"Noto Sans Thai", sans-serif',      ipaSupport: false, license: 'OFL' },
    { key: 'Noto Serif Thai',     css: '"Noto Serif Thai", serif',          ipaSupport: false, license: 'OFL' },
  ],
  Tibt: [
    { key: 'Noto Sans Tibetan',   css: '"Noto Sans Tibetan", sans-serif',   ipaSupport: false, license: 'OFL' },
    { key: 'Noto Serif Tibetan',  css: '"Noto Serif Tibetan", serif',       ipaSupport: false, license: 'OFL' },
  ],
  Cyrl: [
    { key: 'Noto Sans',           css: '"Noto Sans", sans-serif',           ipaSupport: true,  license: 'OFL' },
    { key: 'Noto Serif',          css: '"Noto Serif", serif',               ipaSupport: true,  license: 'OFL' },
  ],
  Grek: [
    { key: 'Noto Sans',           css: '"Noto Sans", sans-serif',           ipaSupport: true,  license: 'OFL' },
    { key: 'Noto Serif',          css: '"Noto Serif", serif',               ipaSupport: true,  license: 'OFL' },
    { key: 'Gentium Plus',        css: '"Gentium Plus", serif',             ipaSupport: true,  license: 'OFL' },
  ],
  Jpan: [
    { key: 'Noto Sans JP',        css: '"Noto Sans JP", sans-serif',        ipaSupport: false, license: 'OFL' },
    { key: 'Noto Serif JP',       css: '"Noto Serif JP", serif',            ipaSupport: false, license: 'OFL' },
  ],
  Kore: [
    { key: 'Noto Sans KR',        css: '"Noto Sans KR", sans-serif',        ipaSupport: false, license: 'OFL' },
  ],
  Beng: [
    { key: 'Noto Sans Bengali',   css: '"Noto Sans Bengali", sans-serif',   ipaSupport: false, license: 'OFL' },
  ],
  Taml: [
    { key: 'Noto Sans Tamil',     css: '"Noto Sans Tamil", sans-serif',     ipaSupport: false, license: 'OFL' },
  ],
  Mymr: [
    { key: 'Noto Sans Myanmar',   css: '"Noto Sans Myanmar", sans-serif',   ipaSupport: false, license: 'OFL' },
    { key: 'Padauk',              css: '"Padauk", sans-serif',              ipaSupport: false, license: 'OFL' },
  ],
  Ethi: [
    { key: 'Noto Sans Ethiopic',  css: '"Noto Sans Ethiopic", sans-serif',  ipaSupport: false, license: 'OFL' },
    { key: 'Abyssinica SIL',     css: '"Abyssinica SIL", serif',           ipaSupport: false, license: 'OFL' },
  ],
  Khmr: [
    { key: 'Noto Sans Khmer',     css: '"Noto Sans Khmer", sans-serif',     ipaSupport: false, license: 'OFL' },
    { key: 'Mondulkiri',          css: '"Mondulkiri", sans-serif',          ipaSupport: false, license: 'OFL' },
    { key: 'Busra',               css: '"Busra", sans-serif',               ipaSupport: false, license: 'OFL' },
  ],
  Guru: [
    { key: 'Noto Sans Gurmukhi',  css: '"Noto Sans Gurmukhi", sans-serif',  ipaSupport: false, license: 'OFL' },
  ],
  Mlym: [
    { key: 'Noto Sans Malayalam',  css: '"Noto Sans Malayalam", sans-serif', ipaSupport: false, license: 'OFL' },
  ],
  Telu: [
    { key: 'Noto Sans Telugu',    css: '"Noto Sans Telugu", sans-serif',    ipaSupport: false, license: 'OFL' },
  ],
  Knda: [
    { key: 'Noto Sans Kannada',   css: '"Noto Sans Kannada", sans-serif',   ipaSupport: false, license: 'OFL' },
  ],
  Sinh: [
    { key: 'Noto Sans Sinhala',   css: '"Noto Sans Sinhala", sans-serif',   ipaSupport: false, license: 'OFL' },
  ],
  Laoo: [
    { key: 'Noto Sans Lao',       css: '"Noto Sans Lao", sans-serif',       ipaSupport: false, license: 'OFL' },
  ],
  Geor: [
    { key: 'Noto Sans Georgian',  css: '"Noto Sans Georgian", sans-serif',  ipaSupport: false, license: 'OFL' },
  ],
  Hebr: [
    { key: 'Noto Sans Hebrew',    css: '"Noto Sans Hebrew", sans-serif',    ipaSupport: false, license: 'OFL' },
  ],
};

/** 全脚本通用字体 | Universal font options for all scripts */
const UNIVERSAL_FONTS: FontPreset[] = [
  { key: '系统默认',     css: 'var(--font-base)',                          ipaSupport: false, license: 'OFL' },
  { key: 'Charis SIL',  css: '"Charis SIL", "Doulos SIL", serif',        ipaSupport: true,  license: 'OFL' },
  { key: '等宽 Mono',   css: '"JetBrains Mono", ui-monospace, monospace', ipaSupport: false, license: 'OFL' },
];

// ── Language → Script mapping | 语言→脚本映射 ────────────────

/** ISO 639-3 → 默认脚本 | ISO 639-3 → default script */
const LANG_DEFAULT_SCRIPT: Record<string, string> = {
  // 汉语族 | Sinitic
  cmn: 'Hans', yue: 'Hant', wuu: 'Hans', nan: 'Hant', hak: 'Hans',
  // 日韩 | Japanese & Korean
  jpn: 'Jpan', kor: 'Kore',
  // 藏缅 | Tibeto-Burman
  bod: 'Tibt', mya: 'Mymr',
  // 南亚 | South Asian
  hin: 'Deva', nep: 'Deva', mar: 'Deva', san: 'Deva',
  ben: 'Beng', asm: 'Beng',
  tam: 'Taml', tel: 'Telu', mal: 'Mlym', kan: 'Knda',
  guj: 'Gujr', pan: 'Guru', ori: 'Orya', sin: 'Sinh',
  urd: 'Arab',
  // 东南亚 | Southeast Asian
  tha: 'Thai', khm: 'Khmr', lao: 'Laoo', vie: 'Latn',
  // 中东 & 非洲 | Middle East & Africa
  ara: 'Arab', heb: 'Hebr', uig: 'Arab', fas: 'Arab', pus: 'Arab',
  amh: 'Ethi', tir: 'Ethi', swa: 'Latn', hau: 'Latn', yor: 'Latn',
  // 高加索 | Caucasian
  kat: 'Geor', hye: 'Armn',
  // 欧洲拉丁 | European Latin
  eng: 'Latn', fra: 'Latn', deu: 'Latn', spa: 'Latn', por: 'Latn',
  ita: 'Latn', nld: 'Latn', pol: 'Latn', tur: 'Latn',
  cat: 'Latn', ron: 'Latn', ces: 'Latn', slk: 'Latn',
  hrv: 'Latn', slv: 'Latn', lit: 'Latn', lav: 'Latn',
  est: 'Latn', fin: 'Latn', hun: 'Latn', swe: 'Latn',
  nor: 'Latn', dan: 'Latn', isl: 'Latn',
  ind: 'Latn', msa: 'Latn', tgl: 'Latn',
  // 欧洲西里尔 | European Cyrillic
  rus: 'Cyrl', ukr: 'Cyrl', bel: 'Cyrl', bul: 'Cyrl',
  srp: 'Cyrl', mkd: 'Cyrl', kaz: 'Cyrl', mon: 'Cyrl',
};

const SCRIPT_DEFAULT_DIRECTION: Partial<Record<string, NonNullable<OrthographyDocType['direction']>>> = {
  Arab: 'rtl',
  Hebr: 'rtl',
};

// ── Script resolution | 脚本解析 ─────────────────────────────

/**
 * 根据语言和正字法配置解析脚本
 * Resolve script tag from language and orthography settings
 */
export function resolveScriptForLanguage(
  languageId: string,
  orthographies?: OrthographyDocType[],
  preferredOrthographyId?: string,
): string {
  const ortho = preferredOrthographyId
    ? orthographies?.find((o) => o.id === preferredOrthographyId && o.scriptTag)
    : orthographies?.find((o) => o.languageId === languageId && o.scriptTag);
  if (ortho?.scriptTag) return ortho.scriptTag;
  const fallback = orthographies?.find((o) => o.languageId === languageId && o.scriptTag);
  if (fallback?.scriptTag) return fallback.scriptTag;
  return LANG_DEFAULT_SCRIPT[languageId] ?? 'Latn';
}

export function resolveOrthographyForLanguage(
  languageId: string,
  orthographies?: OrthographyDocType[],
  preferredOrthographyId?: string,
): OrthographyDocType | undefined {
  if (preferredOrthographyId) {
    const preferred = orthographies?.find((o) => o.id === preferredOrthographyId);
    if (preferred) return preferred;
  }
  return orthographies?.find((o) => o.languageId === languageId);
}

export function isIpaModeForLanguage(
  languageId: string,
  orthographies?: OrthographyDocType[],
  preferredOrthographyId?: string,
): boolean {
  const orthography = resolveOrthographyForLanguage(languageId, orthographies, preferredOrthographyId);
  return orthography?.type === 'phonemic' || orthography?.type === 'phonetic';
}

export function resolveDirectionForLanguage(
  languageId: string,
  orthographies?: OrthographyDocType[],
  preferredOrthographyId?: string,
): NonNullable<OrthographyDocType['direction']> {
  const orthography = resolveOrthographyForLanguage(languageId, orthographies, preferredOrthographyId);
  if (orthography?.direction) return orthography.direction;
  const scriptTag = resolveScriptForLanguage(languageId, orthographies, preferredOrthographyId);
  return SCRIPT_DEFAULT_DIRECTION[scriptTag] ?? 'ltr';
}

/**
 * 获取脚本适用字体列表 | Get font presets for script
 */
export function getFontPresetsForScript(
  scriptTag: string,
  ipaMode = false,
): FontPreset[] {
  const scriptFonts = SCRIPT_FONT_MAP[scriptTag] ?? SCRIPT_FONT_MAP['Latn']!;
  const allFonts = [
    UNIVERSAL_FONTS[0]!,
    ...scriptFonts,
    ...UNIVERSAL_FONTS.slice(1),
  ];
  if (!ipaMode) return allFonts;
  return allFonts.filter((f) => f.key === '系统默认' || f.ipaSupport);
}

const STRICT_LOCAL_FONT_FILTER_SCRIPTS = new Set([
  'Hans', 'Hant', 'Jpan', 'Kore', 'Arab', 'Deva', 'Thai', 'Tibt',
  'Beng', 'Taml', 'Mymr', 'Ethi', 'Khmr', 'Guru', 'Mlym', 'Telu',
  'Knda', 'Sinh', 'Laoo', 'Geor', 'Hebr',
]);

const SHARED_CJK_FONT_HINTS = [
  'source han',
  'sourcehan',
  'noto sans cjk',
  'noto serif cjk',
  '思源黑体',
  '思源黑體',
  '思源宋体',
  '思源宋體',
  '本고딕',
  '본명조',
  '源ノ角ゴシック',
  '源ノ明朝',
];

const LOCAL_FONT_SCRIPT_HINTS: Record<string, string[]> = {
  Hans: [
    'pingfang sc', 'songti sc', 'heiti sc', 'kaiti sc', 'fangsong', 'simsun', 'simhei',
    'microsoft yahei', 'wenquanyi', 'noto sans sc', 'noto serif sc', 'source han sans sc',
    'source han serif sc', '苹方', '宋体', '黑体', '楷体', '仿宋', '微软雅黑', '冬青黑体简体中文',
  ],
  Hant: [
    'pingfang tc', 'pingfang hk', 'songti tc', 'heiti tc', 'microsoft jhenghei',
    'noto sans tc', 'noto serif tc', 'source han sans tc', 'source han serif tc',
    '蘋方', '明體', '黑體', '微軟正黑體',
  ],
  Jpan: [
    'hiragino', 'meiryo', 'yu gothic', 'yu mincho', 'ms gothic', 'ms mincho',
    'noto sans jp', 'noto serif jp', 'source han sans jp', 'source han serif jp',
    'ヒラギノ', '游ゴシック', '游明朝', 'メイリオ', 'ｍｓ ゴシック', 'ｍｓ 明朝',
  ],
  Kore: [
    'malgun', 'gulim', 'batang', 'dotum', 'gungsuh', 'apple sd gothic',
    'noto sans kr', 'source han sans kr', 'source han serif kr',
    '맑은 고딕', '굴림', '바탕', '돋움', '궁서',
  ],
  Arab: ['arabic', 'naskh', 'nastaliq', 'amiri', 'scheherazade', 'harmattan', 'awami', 'arab'],
  Deva: ['devanagari', 'annapurna', 'mangal', 'kokila', 'hindi', 'marathi', 'nepali'],
  Thai: ['thai', 'thsarabun', 'cordia', 'angsana'],
  Tibt: ['tibetan', 'tibt', 'monlam', 'jomolhari'],
  Beng: ['bengali', 'bangla'],
  Taml: ['tamil'],
  Mymr: ['myanmar', 'burmese', 'padauk'],
  Ethi: ['ethiopic', 'abyssinica', 'amharic'],
  Khmr: ['khmer', 'mondulkiri', 'busra'],
  Guru: ['gurmukhi', 'raavi'],
  Mlym: ['malayalam'],
  Telu: ['telugu'],
  Knda: ['kannada'],
  Sinh: ['sinhala'],
  Laoo: ['lao'],
  Geor: ['georgian'],
  Hebr: ['hebrew'],
};

const LOCAL_FONT_LOCALIZED_ALIASES: Record<string, Partial<Record<string, string>>> = {
  'pingfang sc': { Hans: '苹方-简' },
  'pingfang tc': { Hant: '蘋方-繁' },
  'pingfang hk': { Hant: '蘋方-港' },
  'songti sc': { Hans: '宋体-简' },
  'songti tc': { Hant: '宋体-繁' },
  'heiti sc': { Hans: '黑体-简' },
  'kaiti sc': { Hans: '楷体-简' },
  simsun: { Hans: '宋体' },
  simhei: { Hans: '黑体' },
  kaiti: { Hans: '楷体' },
  fangsong: { Hans: '仿宋' },
  'microsoft yahei': { Hans: '微软雅黑' },
  'microsoft jhenghei': { Hant: '微軟正黑體' },
  'hiragino sans': { Jpan: 'ヒラギノ角ゴ' },
  'hiragino mincho pro': { Jpan: 'ヒラギノ明朝' },
  meiryo: { Jpan: 'メイリオ' },
  'yu gothic': { Jpan: '游ゴシック' },
  'yu mincho': { Jpan: '游明朝' },
  'malgun gothic': { Kore: '맑은 고딕' },
  gulim: { Kore: '굴림' },
  batang: { Kore: '바탕' },
  dotum: { Kore: '돋움' },
  gungsuh: { Kore: '궁서' },
  'source han sans': { Hans: '思源黑体', Hant: '思源黑體', Jpan: '源ノ角ゴシック', Kore: '본고딕' },
  'source han serif': { Hans: '思源宋体', Hant: '思源宋體', Jpan: '源ノ明朝', Kore: '본명조' },
};

const SCRIPT_CHARACTER_PATTERNS: Record<string, RegExp> = {
  Hans: /[\u3400-\u9FFF\uF900-\uFAFF]/,
  Hant: /[\u3400-\u9FFF\uF900-\uFAFF]/,
  Jpan: /[\u3040-\u30FF\u31F0-\u31FF]/,
  Kore: /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/,
  Arab: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,
  Deva: /[\u0900-\u097F]/,
  Thai: /[\u0E00-\u0E7F]/,
  Tibt: /[\u0F00-\u0FFF]/,
  Beng: /[\u0980-\u09FF]/,
  Taml: /[\u0B80-\u0BFF]/,
  Mymr: /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/,
  Ethi: /[\u1200-\u137F\u1380-\u139F]/,
  Khmr: /[\u1780-\u17FF\u19E0-\u19FF]/,
  Guru: /[\u0A00-\u0A7F]/,
  Mlym: /[\u0D00-\u0D7F]/,
  Telu: /[\u0C00-\u0C7F]/,
  Knda: /[\u0C80-\u0CFF]/,
  Sinh: /[\u0D80-\u0DFF]/,
  Laoo: /[\u0E80-\u0EFF]/,
  Geor: /[\u10A0-\u10FF\u1C90-\u1CBF]/,
  Hebr: /[\u0590-\u05FF]/,
};

function normalizeFontSearchValue(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFontIdentity(value: string): string {
  return normalizeFontSearchValue(value).replace(/\s+/g, '');
}

function hasLatinName(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function containsScriptCharacters(value: string, scriptTag: string): boolean {
  const pattern = SCRIPT_CHARACTER_PATTERNS[scriptTag];
  if (!pattern) return false;
  return pattern.test(value);
}

function getLocalFontSearchBlob(font: LocalFontEntry): string {
  return [font.family, ...font.fullNames, ...font.postscriptNames]
    .map(normalizeFontSearchValue)
    .join(' | ');
}

function getLocalFontScriptHints(scriptTag: string): string[] {
  const ownHints = LOCAL_FONT_SCRIPT_HINTS[scriptTag] ?? [];
  if (scriptTag === 'Hans' || scriptTag === 'Hant' || scriptTag === 'Jpan' || scriptTag === 'Kore') {
    return [...ownHints, ...SHARED_CJK_FONT_HINTS];
  }
  return ownHints;
}

function resolveLocalizedLocalFontName(font: LocalFontEntry, scriptTag: string): string | undefined {
  const normalizedFamily = normalizeFontSearchValue(font.family);
  const alias = LOCAL_FONT_LOCALIZED_ALIASES[normalizedFamily]?.[scriptTag];
  if (alias) return alias;

  const localizedFullName = font.fullNames.find((name) => containsScriptCharacters(name, scriptTag));
  if (localizedFullName) return localizedFullName;

  if (containsScriptCharacters(font.family, scriptTag)) return font.family;
  return undefined;
}

function resolveEnglishLocalFontName(font: LocalFontEntry): string | undefined {
  const candidates = [font.family, ...font.fullNames, ...font.postscriptNames];
  return candidates.find((name) => hasLatinName(name));
}

function isLocalFontCompatibleWithScript(font: LocalFontEntry, scriptTag: string): boolean {
  const localizedName = resolveLocalizedLocalFontName(font, scriptTag);
  if (localizedName) return true;

  const searchBlob = getLocalFontSearchBlob(font);
  return getLocalFontScriptHints(scriptTag).some((hint) => searchBlob.includes(normalizeFontSearchValue(hint)));
}

export function filterLocalFontsForLanguage(
  fonts: LocalFontEntry[],
  languageId: string,
  orthographies: OrthographyDocType[],
  preferredOrthographyId?: string,
): LocalFontEntry[] {
  const scriptTag = resolveScriptForLanguage(languageId, orthographies, preferredOrthographyId);
  if (!STRICT_LOCAL_FONT_FILTER_SCRIPTS.has(scriptTag)) return fonts;
  return fonts.filter((font) => isLocalFontCompatibleWithScript(font, scriptTag));
}

export function formatLocalFontLabel(
  font: LocalFontEntry,
  languageId: string,
  orthographies: OrthographyDocType[],
  preferredOrthographyId?: string,
): string {
  const scriptTag = resolveScriptForLanguage(languageId, orthographies, preferredOrthographyId);
  const primaryName = resolveLocalizedLocalFontName(font, scriptTag) ?? font.family;
  const englishName = resolveEnglishLocalFontName(font);
  if (!englishName || normalizeFontIdentity(primaryName) === normalizeFontIdentity(englishName)) {
    return primaryName;
  }
  return `${primaryName} (${englishName})`;
}

// ── CSS conversion | CSS 转换 ────────────────────────────────

/**
 * 将字体 key 解析为 CSS font-family 值 | Resolve font key to CSS font-family
 */
function resolveFontCss(fontKey: string): string {
  for (const presets of Object.values(SCRIPT_FONT_MAP)) {
    const found = presets.find((p) => p.key === fontKey);
    if (found) return found.css;
  }
  const universal = UNIVERSAL_FONTS.find((p) => p.key === fontKey);
  if (universal) return universal.css;
  // 本地字体或未知字体：包裹引号 | Local/unknown font: wrap in quotes
  return `"${fontKey}", sans-serif`;
}

function isKnownFontPresetKey(fontKey: string): boolean {
  for (const presets of Object.values(SCRIPT_FONT_MAP)) {
    if (presets.some((preset) => preset.key === fontKey)) return true;
  }
  return UNIVERSAL_FONTS.some((preset) => preset.key === fontKey);
}

function dedupeFontKeys(fontKeys: readonly string[]): string[] {
  return dedupeNonEmptyStrings(fontKeys);
}

function buildFontStackCss(fontKeys: readonly string[]): string {
  return dedupeFontKeys(fontKeys)
    .map((fontKey) => resolveFontCss(fontKey))
    .join(', ');
}

function buildRuntimeFontKeys(
  scriptTag: string,
  ipaMode: boolean,
  preferredFontKeys: readonly string[],
  fallbackFontKeys: readonly string[],
): string[] {
  const scriptPresetKeys = (SCRIPT_FONT_MAP[scriptTag] ?? SCRIPT_FONT_MAP['Latn'] ?? []).map((preset) => preset.key);
  if (!STRICT_RUNTIME_FALLBACK_SCRIPTS.has(scriptTag)) {
    return dedupeFontKeys([
      ...preferredFontKeys,
      ...fallbackFontKeys,
      ...getFontPresetsForScript(scriptTag, ipaMode).map((preset) => preset.key),
    ]);
  }
  return dedupeFontKeys([
    ...preferredFontKeys,
    ...fallbackFontKeys,
    ...scriptPresetKeys,
  ]);
}

function buildSelectedFontStackCss(fontKey: string, renderPolicy?: OrthographyRenderPolicy): string {
  if (!renderPolicy) return resolveFontCss(fontKey);
  return buildFontStackCss([fontKey, ...renderPolicy.resolvedFontKeys.filter((key) => key !== fontKey)]);
}

export function resolveOrthographyRenderPolicy(
  languageId: string,
  orthographies?: OrthographyDocType[],
  preferredOrthographyId?: string,
): OrthographyRenderPolicy {
  const orthography = resolveOrthographyForLanguage(languageId, orthographies, preferredOrthographyId);
  const scriptTag = resolveScriptForLanguage(languageId, orthographies, preferredOrthographyId);
  const ipaMode = isIpaModeForLanguage(languageId, orthographies, preferredOrthographyId);
  const fontPresets = getFontPresetsForScript(scriptTag, ipaMode);
  const preferredFontKeys = orthography?.fontPreferences?.primary ?? [];
  const fallbackFontKeys = orthography?.fontPreferences?.fallback ?? [];
  const resolvedFontKeys = buildRuntimeFontKeys(scriptTag, ipaMode, preferredFontKeys, fallbackFontKeys);
  const coverageSummary = buildOrthographyCoverageSummary(orthography);
  const defaultFontKey = resolvedFontKeys[0] ?? '系统默认';
  const defaultFontCss = buildFontStackCss(resolvedFontKeys);
  const direction = resolveDirectionForLanguage(languageId, orthographies, preferredOrthographyId);
  const lineHeightScale = orthography?.fontPreferences?.lineHeightScale ?? getScriptLineHeightFactor(scriptTag);
  return {
    ...(orthography !== undefined ? { orthography } : {}),
    scriptTag,
    direction,
    textDirection: direction === 'rtl' ? 'rtl' : 'ltr',
    ipaMode,
    defaultFontKey,
    defaultFontCss,
    preferredFontKeys: dedupeFontKeys(preferredFontKeys),
    fallbackFontKeys: dedupeFontKeys(fallbackFontKeys),
    resolvedFontKeys,
    fontPresets,
    coverageSummary,
    lineHeightScale,
    isolateInlineRuns: orthography?.bidiPolicy?.isolateInlineRuns ?? direction === 'rtl',
    preferDirAttribute: orthography?.bidiPolicy?.preferDirAttribute ?? true,
  };
}

export function describePresetFontCoverage(
  fontKey: string,
  renderPolicy: OrthographyRenderPolicy,
  verification?: FontCoverageVerification,
): string {
  const baseLabel = renderPolicy.preferredFontKeys.includes(fontKey)
    ? '首选'
    : renderPolicy.fallbackFontKeys.includes(fontKey)
    ? '回退'
    : (renderPolicy.coverageSummary.confidence === 'sample-backed' ? '推荐' : '脚本推荐');
  if (verification?.status === 'verified') return `${baseLabel} · 已验证`;
  if (verification?.status === 'shaping-risk') return `${baseLabel} · 高风险`;
  if (verification?.status === 'missing-glyphs') return `${baseLabel} · 缺字`;
  return baseLabel;
}

export function describeFontVerificationStatus(
  fontKey: string,
  renderPolicy: OrthographyRenderPolicy,
  verification?: FontCoverageVerification | null,
): string | null {
  if (!verification) return null;
  if (verification.status === 'missing-glyphs') return '缺字';
  if (verification.status === 'shaping-risk') return '高风险';
  if (verification.status === 'unsupported') return '浏览器不支持';
  if (verification.status === 'unchecked') return '未校验';
  if (verification.status !== 'verified') return null;
  if (SHAPING_RISK_SCRIPTS.has(renderPolicy.scriptTag) && !isKnownFontPresetKey(fontKey)) {
    return '高风险';
  }
  return '已验证';
}

function isShapingRiskLocalFont(
  font: LocalFontEntry,
  renderPolicy: OrthographyRenderPolicy,
  verification?: FontCoverageVerification,
): boolean {
  if (verification?.status === 'shaping-risk') return true;
  if (verification?.status !== 'verified') return false;
  if (!SHAPING_RISK_SCRIPTS.has(renderPolicy.scriptTag)) return false;
  if (!isLocalFontCompatibleWithScript(font, renderPolicy.scriptTag)) return false;
  return true;
}

export function describeLocalFontCoverage(
  font: LocalFontEntry,
  renderPolicy: OrthographyRenderPolicy,
  verification?: FontCoverageVerification,
): string {
  const baseLabel = renderPolicy.preferredFontKeys.includes(font.family)
    ? '首选'
    : renderPolicy.fallbackFontKeys.includes(font.family)
    ? '回退'
    : (isLocalFontCompatibleWithScript(font, renderPolicy.scriptTag) ? '脚本匹配' : '风险高');
  if (verification?.status === 'verified' && !isShapingRiskLocalFont(font, renderPolicy, verification)) {
    return `${baseLabel} · 已验证`;
  }
  if (verification?.status === 'missing-glyphs') return `${baseLabel} · 缺字`;
  if (isShapingRiskLocalFont(font, renderPolicy, verification)) return `${baseLabel} · 高风险`;
  return baseLabel;
}

/**
 * 将 LayerDisplaySettings 转为行内 CSS | Convert display settings to inline CSS
 */
export function layerDisplaySettingsToStyle(
  settings?: LayerDisplaySettings,
  renderPolicy?: OrthographyRenderPolicy,
): CSSProperties {
  if (!settings && !renderPolicy) return {};
  const style: CSSProperties = {};
  if (settings?.fontFamily) {
    style.fontFamily = buildSelectedFontStackCss(settings.fontFamily, renderPolicy);
  } else if (renderPolicy) {
    style.fontFamily = renderPolicy.defaultFontCss;
  }
  if (settings?.fontSize) style.fontSize = `${settings.fontSize}px`;
  if (settings?.bold) style.fontWeight = 'bold';
  if (settings?.italic) style.fontStyle = 'italic';
  if (settings?.color) style.color = settings.color;
  if (renderPolicy) {
    style.direction = renderPolicy.textDirection;
    style.lineHeight = String(renderPolicy.lineHeightScale);
    if (renderPolicy.isolateInlineRuns) {
      style.unicodeBidi = 'isolate';
    }
  }
  return style;
}

export function buildOrthographyPreviewTextProps(
  renderPolicy?: OrthographyRenderPolicy,
  settings?: LayerDisplaySettings,
): OrthographyPreviewTextProps {
  return {
    ...(renderPolicy?.preferDirAttribute ? { dir: renderPolicy.textDirection } : {}),
    style: layerDisplaySettingsToStyle(settings, renderPolicy),
  };
}

// ── Lane height ↔ font size coupling | 行高↔字号联动 ─────────

export const BASE_FONT_SIZE = 13;
export const BASE_LANE_HEIGHT = 54;
export const MIN_LAYER_FONT_SIZE = 8;
export const MAX_LAYER_FONT_SIZE = 36;
export const LAYER_FONT_SIZE_STEP = 1;

/**
 * 脚本行高缩放因子 | Script line-height scale factor
 */
const SCRIPT_LINE_HEIGHT_FACTOR: Record<string, number> = {
  Latn: 1.0, Cyrl: 1.0, Grek: 1.0,
  Hans: 1.05, Hant: 1.05, Jpan: 1.05, Kore: 1.05,
  Arab: 1.15, Deva: 1.12, Thai: 1.15, Tibt: 1.25,
  Beng: 1.12, Taml: 1.10, Mymr: 1.15, Ethi: 1.10,
  Khmr: 1.15, Guru: 1.12, Mlym: 1.12, Telu: 1.10,
  Knda: 1.10, Sinh: 1.12, Laoo: 1.15, Geor: 1.0,
  Hebr: 1.0,
};

function getScriptLineHeightFactor(scriptTag: string): number {
  return SCRIPT_LINE_HEIGHT_FACTOR[scriptTag] ?? 1.0;
}

/**
 * 字号→推荐行高 | Compute lane height from font size
 */
export function computeLaneHeightFromFontSize(
  fontSize: number,
  scriptTag: string,
  clamp: (h: number) => number = (h) => Math.max(42, Math.min(180, h)),
): number {
  const factor = getScriptLineHeightFactor(scriptTag);
  const raw = BASE_LANE_HEIGHT * (fontSize / BASE_FONT_SIZE) * factor;
  return clamp(Math.round(raw));
}

/**
 * 行高→反推字号 | Compute font size from lane height
 */
export function computeFontSizeFromLaneHeight(
  laneHeight: number,
  scriptTag: string,
): number {
  const factor = getScriptLineHeightFactor(scriptTag);
  const raw = BASE_FONT_SIZE * (laneHeight / BASE_LANE_HEIGHT) / factor;
  return Math.max(MIN_LAYER_FONT_SIZE, Math.min(MAX_LAYER_FONT_SIZE, Math.round(raw * 4) / 4));
}

export function computeLaneHeightFromRenderPolicy(
  fontSize: number,
  renderPolicy: OrthographyRenderPolicy,
  clamp: (h: number) => number = (h) => Math.max(42, Math.min(180, h)),
): number {
  const raw = BASE_LANE_HEIGHT * (fontSize / BASE_FONT_SIZE) * renderPolicy.lineHeightScale;
  return clamp(Math.round(raw));
}

export function computeFontSizeFromRenderPolicy(
  laneHeight: number,
  renderPolicy: OrthographyRenderPolicy,
): number {
  const raw = BASE_FONT_SIZE * (laneHeight / BASE_LANE_HEIGHT) / renderPolicy.lineHeightScale;
  return Math.max(MIN_LAYER_FONT_SIZE, Math.min(MAX_LAYER_FONT_SIZE, Math.round(raw * 4) / 4));
}

// ── Local font enumeration | 本地字体枚举 ────────────────────

export function isLocalFontAccessSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as unknown as Record<string, unknown>).queryLocalFonts === 'function';
}

let cachedLocalFonts: LocalFontEntry[] | null = null;

export async function queryLocalFontFamilies(): Promise<LocalFontEntry[]> {
  if (cachedLocalFonts) return cachedLocalFonts;
  if (!isLocalFontAccessSupported()) return [];

  const fontDataArr = await (window as unknown as {
    queryLocalFonts(): Promise<Array<{ family: string; fullName?: string; postscriptName: string }>>;
  }).queryLocalFonts();
  const familyMap = new Map<string, { postscriptNames: Set<string>; fullNames: Set<string> }>();
  for (const fd of fontDataArr) {
    const existing = familyMap.get(fd.family) ?? { postscriptNames: new Set<string>(), fullNames: new Set<string>() };
    existing.postscriptNames.add(fd.postscriptName);
    if (fd.fullName) existing.fullNames.add(fd.fullName);
    familyMap.set(fd.family, existing);
  }
  cachedLocalFonts = Array.from(familyMap.entries())
    .map(([family, names]) => ({
      family,
      postscriptNames: Array.from(names.postscriptNames).sort((a, b) => a.localeCompare(b)),
      fullNames: Array.from(names.fullNames).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
  return cachedLocalFonts;
}

export function clearLocalFontCache(): void {
  cachedLocalFonts = null;
}
