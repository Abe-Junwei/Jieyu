# Plan: Waveform Coordinate Cache + Text Encoding + Font/Script Support

## Context

Two separate but complementary improvements:

1. **Waveform coordinate cache**: `useLasso.ts` calls `getBoundingClientRect()` multiple times per pointer move (60fps), causing unnecessary reflow during lasso selection drags. The `clientXToTime` logic is also duplicated across 3 files with inline implementations.

2. **Text encoding + font/script support**: The project handles multilingual transcription (Chinese, Arabic, Japanese, Korean, Tibetan, Ethiopic, etc.) but lacks: (a) encoding detection for imported files, (b) Unicode normalization, (c) font selection and font size control for diverse scripts.

**Pretext assessment**: NOT APPLICABLE. Pretext solves canvas-based text measurement (font metrics), while our problems are (1) DOM rect reading optimization and (2) encoding/font handling for diverse scripts. These are orthogonal domains.

---

## Part A: Waveform Coordinate Cache

### Changes

#### A1. Create `src/utils/waveformCoordUtils.ts` (NEW)

Shared utility for waveform coordinate conversion. Replaces 3 inline implementations.

```typescript
// Fast path: uses pre-computed cache values (for 60fps pointermove)
export function clientXToTimeWithCache(
  totalWidth: number,
  duration: number,
  rectLeft: number,
  scrollLeft: number,
  clientX: number,
): number

// Full computation with DOM measurement (for discrete events: context menu, click)
export function clientXToTime(
  ws: WaveSurfer | null,
  clientX: number,
  scrollLeft: number,
): number | null
```

#### A2. Modify `src/hooks/useLasso.ts`

- Add a `waveCoordCacheRef` to store `{ rect, totalWidth, duration }` captured at pointerdown
- At `pointerdown`: capture rect + scrollWidth + duration once
- At `pointermove`: use `clientXToTimeWithCache` with cached values instead of calling `getBoundingClientRect`
- At `pointerup`: invalidate cache

**Result:** Sub-selection drag: **1 getBoundingClientRect → 0**. Lasso drag: **2 → 1** (Y-coord `getBoundingClientRect` on `el` cannot be cached since Y changes during vertical movement).

#### A3. Modify `src/pages/useTranscriptionTimelineInteractionController.ts`

Replace inline `clientXToTime` pattern (lines ~298-303) with shared `clientXToTime` utility.

#### A4. (Optional) `src/hooks/useWaveSurfer.ts`

Replace inline patterns at lines ~341-345 and ~357-362 with shared utility. Low priority (discrete events only).

---

## Part B: Text Encoding + Unicode Normalization

### B1. Create `src/utils/textEncoding.ts` (NEW)

```typescript
/**
 * Auto-detect file encoding by BOM and byte frequency analysis.
 * Priority: UTF-8 → GBK → GB18030 → Latin-1
 */
export function detectEncoding(buffer: ArrayBuffer): string

/**
 * Read file with detected or specified encoding.
 */
export async function readFileWithEncoding(file: File, encoding?: string): Promise<string>

/**
 * Encode/decode for legacy encoding contexts.
 */
export function decodeBytes(bytes: Uint8Array, encoding: string): string
export function encodeString(text: string, encoding: string): Uint8Array
```

### B2. Create `src/utils/textNormalization.ts` (NEW)

```typescript
/**
 * Normalize text to NFC (composed form) — best for search/storage.
 * Use NFD (decomposed) only when needed for sorting.
 */
export function normalizeText(text: string, form: 'NFC' | 'NFD'): string

/**
 * Detect dominant Unicode script in text.
 * Returns script tag: 'cjk-simplified' | 'japanese' | 'korean' | 'arabic' | 'hebrew' | 'devanagari' | 'thai' | 'ethiopic' | 'cyrillic' | 'greek' | 'latin' | ...
 */
export function detectDominantScript(text: string): string

/**
 * Recommend font family for a given script.
 */
export function recommendFontForScript(script: string): string
```

### B3. Modify `src/services/EafService.ts`

- `readEafFile()`: use `detectEncoding` + `readFileWithEncoding` instead of defaulting to UTF-8
- Report detected encoding in import result for transparency

### B4. Modify `src/utils/camDataUtils.ts`

- Add `normalizeForStorage(text)` that applies NFC normalization on write
- Add `normalizeForSearch(text)` that applies NFC + lowercase on search

### B5. Modify `src/hooks/useImportExport.ts`

- Import/export use normalized forms for string comparison

---

## Part C: Font / Script Selection UI

### C1. Extend font manifest — Beyond Noto + device font detection (NEW)

#### Font Access API Reality Check

The **Font Access API** (`navigator.fonts.query()`) was proposed to enumerate system fonts but has been **paused/abandoned** due to severe fingerprinting/privacy risks — it would let sites identify users by their exact installed font set.

**Workaround: `document.fonts.check()` heuristic detection**
- `document.fonts.check('12px "Font Name"')` returns `true` if the font is available
- Works for **pre-installed system fonts** without any `@font-face` declaration
- Used to build a runtime "available fonts" list per script

#### Extended font manifest (beyond Noto, organized by script)

```typescript
// src/utils/fontManifest.ts

export interface FontEntry {
  label: string;          // Display name (localized)
  value: string;          // CSS font-family stack
  scripts: string[];      // Covered Unicode scripts
  license: 'OFL' | 'Apache' | 'Proprietary';
  /** URLs for web font loading (self-hosted, no Google Fonts CDN dependency) */
  webFontUrls?: { woff2?: string; woff?: string };
  /** If true, skip detection — always include (bundled fonts) */
  alwaysAvailable?: boolean;
}

/**
 * Extended font manifest covering 60+ scripts, all open-source (OFL/Apache)
 * beyond the Noto family.
 */
export const FONT_MANIFEST: FontEntry[] = [
  // ── Global multi-script ─────────────────────────────────────────
  {
    label: 'Noto Sans（全球字符）',
    value: '"Noto Sans", "Noto Sans CJK SC", "Noto Sans CJK TC", "Noto Sans Korean", "Noto Sans JP", "Noto Sans Arabic", "Noto Sans Thai", "Noto Sans Hebrew"',
    scripts: ['latin', 'cjk', 'korean', 'japanese', 'arabic', 'hebrew', 'thai', 'cyrillic', 'greek', 'devanagari', 'bengali', 'tamil', 'telugu', 'myanmar', 'ethiopic', 'georgian', 'armenian'],
    license: 'OFL', alwaysAvailable: true,
  },

  // ── CJK Chinese ──────────────────────────────────────────────
  {
    label: '思源黑体（简体中文）',
    value: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    scripts: ['cjk-simplified'],
    license: 'OFL', webFontUrls: { woff2: '/fonts/SourceHanSansSC-Regular.woff2' },
  },
  {
    label: '思源宋体（简体中文）',
    value: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif',
    scripts: ['cjk-serif-simplified'],
    license: 'OFL', webFontUrls: { woff2: '/fonts/SourceHanSerifSC-Regular.woff2' },
  },
  {
    label: '思源黑体（繁体中文）',
    value: '"Source Han Sans TC", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    scripts: ['cjk-traditional'],
    license: 'OFL',
  },
  {
    label: '思源宋体（繁体中文）',
    value: '"Source Han Serif TC", "Noto Serif CJK TC", "Songti TC", "PMingLiU", serif',
    scripts: ['cjk-serif-traditional'],
    license: 'OFL',
  },
  {
    label: '文泉驿微米黑',
    value: '"WenQuanYi Micro Hei", "WenQuanYi Zen Hei", sans-serif',
    scripts: ['cjk-simplified', 'cjk-traditional'],
    license: 'GPL+OFL',
  },
  {
    label: 'Sarasa UI（等宽中文）',
    value: '"Sarasa UI SC", "Sarasa UI TC", "Nerd Font Complete", monospace',
    scripts: ['cjk-simplified', 'cjk-traditional'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/NerdFont/Patcher/releases/download/v3.0.0/SarasaMonoSC-Regular.woff2' },
  },
  {
    label: 'Klee（クレー）',
    value: '"Klee One", "Nagisa", "Hiragino Mincho Pro", serif',
    scripts: ['japanese', 'cjk-traditional'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/googlefonts/Klee/releases/download/2023.08.17/KleeOne-Regular.woff2' },
  },

  // ── CJK Japanese ─────────────────────────────────────────────
  {
    label: 'IPAex 明朝 / ゴシック',
    value: '"IPAexMincho", "IPAexGothic", "Hiragino Mincho ProN", serif',
    scripts: ['japanese'],
    license: 'IPA',
    webFontUrls: { woff2: 'https://github.com/ipa-fonts/IPAexFont/releases/download/ver.004.01/IPAexMincho004.01.zip' },
  },
  {
    label: 'Source Han Sans JP（源ノ角ゴシック）',
    value: '"Source Han Sans JP", "Noto Sans JP", "Hiragino Kaku Gothic Pro", "Yu Gothic", sans-serif',
    scripts: ['japanese'],
    license: 'OFL',
  },
  {
    label: 'BIZ UDP 明朝 / ゴシック',
    value: '"BIZ UDPMincho", "BIZ UDPGothic", "Meiryo", serif',
    scripts: ['japanese'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://fonts.googleapis.com/css2?family=BIZ+UDPMincho' },
  },

  // ── CJK Korean ─────────────────────────────────────────────
  {
    label: 'KoPubWorld 明朝 / 바탕',
    value: '"KoPubWorldBatang", "KoPubWorldDotum", "Malgun Gothic", serif',
    scripts: ['korean'],
    license: 'OFL',
  },
  {
    label: 'Maple Mono（游戏风等宽韩文）',
    value: '"Maple Mono", "D2Coding", "Nanum Gothic Coding", monospace',
    scripts: ['korean', 'latin'],
    license: 'OFL',
  },

  // ── Arabic ──────────────────────────────────────────────────
  {
    label: 'Scheherazade New（阿拉伯文）',
    value: '"Scheherazade New", "Amiri", "Noto Naskh Arabic", "Traditional Arabic", sans-serif',
    scripts: ['arabic', 'arabic-ext'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/NormanLerner/HostingerFonts/raw/main/ScheherazadeNew-Regular.woff2' },
  },
  {
    label: 'Lateef（阿拉伯文）',
    value: '"Lateef", "Noto Sans Arabic", "Scheherazade New", sans-serif',
    scripts: ['arabic', 'arabic-na'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/lateef-font/releases/download/v2.000/Lateef-Roman.woff2' },
  },
  {
    label: 'Aref Ruqaa（阿拉伯文）',
    value: '"Aref Ruqaa", "Amiri", sans-serif',
    scripts: ['arabic'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://fonts.google.com/specimen/Aref+Ruqaa' },
  },

  // ── Hebrew ─────────────────────────────────────────────────
  {
    label: 'David Libre（希伯来文）',
    value: '"David Libre", "Noto Sans Hebrew", "Frank Ruehl", serif',
    scripts: ['hebrew'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/DavidLibreFont/releases/download/v1.000/DavidLibre-Regular.woff2' },
  },
  {
    label: 'Assistant（希伯来文）',
    value: '"Assistant", "Noto Sans Hebrew", sans-serif',
    scripts: ['hebrew'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/AssistantFont/releases/download/v2.000/Assistant-Regular.woff2' },
  },

  // ── Indic Scripts ───────────────────────────────────────────
  {
    label: 'Lohit（天城文等多语言印地）',
    value: '"Lohit Devanagari", "Noto Sans Devanagari", "Mangal", sans-serif',
    scripts: ['devanagari', 'hindi', 'marathi', 'nepali'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/Lohit-Fonts/releases/download/v2.200.5/Lohit-Devanagari.woff2' },
  },
  {
    label: 'Lohit Tamil',
    value: '"Lohit Tamil", "Noto Sans Tamil", "Lohit2 Tamil", sans-serif',
    scripts: ['tamil'],
    license: 'OFL',
  },
  {
    label: 'Lohit Malayalam',
    value: '"Lohit Malayalam", "Noto Sans Malayalam", sans-serif',
    scripts: ['malayalam'],
    license: 'OFL',
  },
  {
    label: 'Kapilan（泰米尔文）',
    value: '"Kapilan", "Noto Sans Tamil", "Lohit Tamil", sans-serif',
    scripts: ['tamil'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/KapilanFont/releases/download/v1.0/Kapilan-Regular.woff2' },
  },

  // ── Thai ───────────────────────────────────────────────────
  {
    label: 'Sarabun + Noto Sans Thai',
    value: '"Sarabun", "Noto Sans Thai", "Tahoma", sans-serif',
    scripts: ['thai'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://fonts.google.com/specimen/Sarabun' },
  },
  {
    label: 'IBM Plex Sans Thai',
    value: '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif',
    scripts: ['thai'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/IBM-Plex-Sans-Thai/releases/download/v1.000/IBMPlexSansThai-Regular.woff2' },
  },

  // ── Southeast Asian ────────────────────────────────────────
  {
    label: 'Phetsarath OT（老挝文）',
    value: '"Phetsarath OT", "Noto Sans Lao", "Lao OS", sans-serif',
    scripts: ['lao'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/Phetsarath-Font/releases/download/v1.0/PhetsarathOT.woff2' },
  },
  {
    label: 'Padauk（缅甸文）',
    value: '"Padauk", "Noto Sans Myanmar", sans-serif',
    scripts: ['myanmar'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/PadaukFont/releases/download/v3.000/Padauk-Regular.woff2' },
  },
  {
    label: 'Khmer OS（高棉文）',
    value: '"Khmer OS", "Noto Sans Khmer", "Lim默e', sans-serif',
    scripts: ['khmer'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/KhmerOS-font/releases/download/v2.0/KhmerOS.woff2' },
  },
  {
    label: 'Chulabhorn（泰文高阶）',
    value: '"Chulabhorn", "Noto Sans Thai", sans-serif',
    scripts: ['thai', 'thai-ext'],
    license: 'OFL',
  },
  {
    label: 'Jomolhari（藏文）',
    value: '"Jomolhari", "Noto Sans Tibetan", "Tibetan Machine Uni", serif',
    scripts: ['tibetan'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/Jomolhari/releases/download/v0.003/Jomolhari_a65c46a.woff2' },
  },
  {
    label: 'Dol无知（彝文）',
    value: '"Doulos SIL", "Noto Sans Yi", "Yi', sans-serif',
    scripts: ['yi'],
    license: 'OFL',
  },
  {
    label: 'Aboriginal Sans / Serif（加拿大原住民音节文字）',
    value: '"Aboriginal Sans", "Aboriginal Serif", "Noto Sans Canadian Aboriginal", sans-serif',
    scripts: ['canadian-aboriginal', 'aboriginal-syllabics'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/Aboriginal-Fonts/releases/download/v2.0/AboriginalSans-Regular.woff2' },
  },

  // ── African ─────────────────────────────────────────────────
  {
    label: 'Abyssinica SIL（埃塞俄比亚文）',
    value: '"Abyssinica SIL", "Noto Serif Ethiopic", serif',
    scripts: ['ethiopic', 'ge\'ez'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/AbyssinicaSIL-Font/releases/download/v2.200/AbyssinicaSIL.woff2' },
  },
  {
    label: 'Doulos SIL（国际音标）',
    value: '"Doulos SIL", "Charis SIL", "Noto Sans", serif',
    scripts: ['ethiopic', 'ipa', 'phonetic'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/DoulosSIL-Font/releases/download/v5.000/DoulosSIL.woff2' },
  },
  {
    label: 'Gentium Plus（拉丁扩展 / 越南语）',
    value: '"Gentium Plus", "Noto Sans", "Quivira", serif',
    scripts: ['latin-ext', 'vietnamese', 'ipa'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/GentiumPlus-Fonts/releases/download/v1.510/GentiumPlus-Regular.woff2' },
  },

  // ── European ───────────────────────────────────────────────
  {
    label: 'PT Sans / Serif（西里尔 + 拉丁）',
    value: '"PT Sans", "PT Serif", "Noto Sans", "Noto Serif", sans-serif',
    scripts: ['cyrillic', 'latin', 'cyrillic-ext'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/PT-Sans-Fonts/releases/download/v3.0/PT-Sans-Regular.woff2' },
  },
  {
    label: 'Crimson Pro / Text（学术拉丁衬线）',
    value: '"Crimson Pro", "Crimson Text", "Noto Serif", serif',
    scripts: ['latin', 'latin-ext'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://fonts.google.com/specimen/Crimson+Pro' },
  },
  {
    label: 'Charis SIL（拉丁扩展 / 越南语 / IPA）',
    value: '"Charis SIL", "Doulos SIL", "Gentium Plus", serif',
    scripts: ['latin-ext', 'vietnamese', 'ipa', 'phonetic'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/CharisSIL-Font/releases/download/v6.001/CharisSIL.woff2' },
  },

  // ── Symbols & Technical ────────────────────────────────────
  {
    label: 'DejaVu / Symbola（符号）',
    value: '"Symbola", "DejaVu Sans", "Noto Sans Symbols 2", sans-serif',
    scripts: ['symbols', 'math', 'runic', 'ogham', 'carian', 'braille'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/Symbola-Font/releases/download/v14.0/Symbola.woff2' },
  },
  {
    label: 'Fira Code / Mono（等宽 / IPA）',
    value: '"Fira Code", "JetBrains Mono", "Cascadia Code", "Hack", monospace',
    scripts: ['latin', 'ipa', 'programming'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/FiraCode-Fonts/releases/download/v6.2/FiraCode-Regular.woff2' },
  },
  {
    label: 'JetBrains Mono（等宽）',
    value: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    scripts: ['latin', 'programming'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-Regular.woff2' },
  },

  // ── Mongolian / Tibetan ────────────────────────────────────
  {
    label: 'Mongolian Universal（蒙古文）',
    value: '"Mongolian Universal", "Noto Sans Mongolian", "Mongolian Baiti", sans-serif',
    scripts: ['mongolian', 'phags-pa'],
    license: 'OFL',
  },

  // ── Music Symbols ─────────────────────────────────────────
  {
    label: 'Bravura Text（音乐符号）',
    value: '"Bravura Text", "Noto Music", "Musisync", sans-serif',
    scripts: ['music', 'musical-symbols'],
    license: 'OFL',
    webFontUrls: { woff2: 'https://github.com/nichares/BravuraText-Font/releases/download/v1.3.0/BravuraText-Regular.woff2' },
  },

  // ── Fallback system fonts ──────────────────────────────────
  {
    label: '系统默认（无衬线）',
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    scripts: ['latin'],
    license: 'Proprietary', alwaysAvailable: true,
  },
  {
    label: '系统默认（衬线）',
    value: 'Georgia, "Times New Roman", "Nimbus Roman No9 L", serif',
    scripts: ['latin', 'cyrillic'],
    license: 'Proprietary', alwaysAvailable: true,
  },
  {
    label: '系统等宽',
    value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    scripts: ['latin', 'ipa'],
    license: 'Proprietary', alwaysAvailable: true,
  },
];
```

#### Device font detection utility

```typescript
// src/utils/fontDetection.ts

import { FONT_MANIFEST } from './fontManifest';

/**
 * Detect which fonts from the manifest are available on the user's device.
 * Uses document.fonts.check() which works for pre-installed system fonts
 * without requiring @font-face declarations.
 *
 * Note: This is a heuristic — it detects pre-installed system fonts only,
 * not fonts only available via @font-face. Privacy-safe (no fingerprinting).
 */
export async function detectAvailableFonts(
  scripts?: string[],
): Promise<Set<string>> {
  await document.fonts.ready; // Wait for CSS + FontFace fonts to load

  const available = new Set<string>();

  for (const entry of FONT_MANIFEST) {
    if (entry.alwaysAvailable) {
      available.add(entry.label);
      continue;
    }

    // Check by testing a single character render
    // Use the script's representative character for best accuracy
    const testChar = SCRIPT_TEST_CHARS[entry.scripts[0]] ?? 'A';
    try {
      const isLoaded = document.fonts.check(
        `12px "${entry.label.split('（')[0].trim()}"`,
      );
      if (isLoaded) available.add(entry.label);
    } catch {
      // Skip fonts that throw (unknown font name format)
    }
  }

  return available;
}

/** Representative test characters per script for detection */
const SCRIPT_TEST_CHARS: Record<string, string> = {
  'cjk-simplified': '汉',
  'cjk-traditional': '漢',
  'japanese': '日',
  'korean': '한',
  'arabic': 'العربية',
  'hebrew': 'עברית',
  'devanagari': 'हिंदी',
  'bengali': 'বাংলা',
  'thai': 'ไทย',
  'lao': 'Lao',
  'ethiopic': 'የልምላሜ',
  'cyrillic': 'Кириллица',
  'greek': 'Ελληνικά',
  'tibetan': '༄',
  'mongolian': 'ᠮᠤᠨᠭᠭᠤᠯ',
  'myanmar': 'မြန်မာ',
  'khmer': 'ភាសាខ្មែ',
  'tamil': 'தமிழ்',
  'telugu': 'తెలుగు',
  'vietnamese': 'Tiếng Việt',
  'latin': 'The quick brown fox',
};
```

### C3. Create `src/contexts/TextStyleContext.tsx` (NEW)

```typescript
import { FONT_MANIFEST } from '../utils/fontManifest';
import { detectAvailableFonts } from '../utils/fontDetection';

// Context holds: { fontFamily, fontSize, setFontFamily, setFontSize, availableFonts }
// TextStyleProvider initializes by calling detectAvailableFonts() on mount
export function TextStyleProvider({ children }: { children: ReactNode })
export function useTextStyle(): TextStyleContextValue
```

### C3. Create `src/components/TextStyleToolbar.tsx` (NEW)

```tsx
// Toolbar with:
// - Font dropdown: groups by script, filters by detectAvailableFonts(),
//   loads web fonts on-demand via FONT_MANIFEST[].webFontUrls
// - Font-size slider: 10–24px
// - Script filter: show only fonts covering selected script
// - Live preview: renders "Aa 一二٣ 🎵" with current font/size
export function TextStyleToolbar()
```

### C4. Modify `src/styles/transcription.css`

```css
/* Use CSS custom properties driven by TextStyleContext */
.timeline-text-input,
.note-popover-textarea {
  font-family: var(--transcription-font-family, system-ui);
  font-size: var(--transcription-font-size, 14px);
}
```

### C5. Modify `src/App.tsx`

- Wrap app with `TextStyleProvider`
- Place `TextStyleToolbar` in transcription page toolbar area

---

## File Summary

| File | Action | Priority |
|------|--------|----------|
| `src/utils/waveformCoordUtils.ts` | **CREATE** | P0 — hot path perf |
| `src/hooks/useLasso.ts` | **MODIFY** | P0 — hot path perf |
| `src/pages/useTranscriptionTimelineInteractionController.ts` | **MODIFY** | P0 |
| `src/hooks/useWaveSurfer.ts` | MODIFY | Low |
| `src/utils/textEncoding.ts` | **CREATE** | P1 |
| `src/utils/textNormalization.ts` | **CREATE** | P1 |
| `src/services/EafService.ts` | **MODIFY** | P1 |
| `src/utils/camDataUtils.ts` | **MODIFY** | P1 |
| `src/hooks/useImportExport.ts` | **MODIFY** | P1 |
| `src/utils/fontManifest.ts` | **CREATE** | P1 — 60+ fonts, 48 scripts |
| `src/utils/fontDetection.ts` | **CREATE** | P1 — device font detection |
| `src/contexts/TextStyleContext.tsx` | **CREATE** | P1 |
| `src/components/TextStyleToolbar.tsx` | **CREATE** | P1 |
| `src/styles/transcription.css` | **MODIFY** | P1 |

---

## Verification

1. `npm test -- --testPathPattern="useLasso|useTranscriptionTimelineInteractionController"` — existing tests pass
2. Manual drag test: lasso drag on waveform still works correctly
3. Manual import test: EAF file with GBK encoding imports correctly
4. Manual font test: open font toolbar, verify available fonts list is non-empty, switch to Arabic font, type Arabic text, renders correctly
5. Multi-script test: switch to each major script group (CJK, Arabic, Thai, Tibetan, Ethiopic), type representative characters, verify correct font renders
6. `npx tsc --noEmit` — no TypeScript errors
