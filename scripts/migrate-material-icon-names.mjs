#!/usr/bin/env node
/**
 * Targeted rename: MaterialSymbol→JieyuIcon, size consts/classes, name=/icon: literals only.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const NAME_MAP = {
  account_tree: 'GitBranch',
  add: 'Plus',
  arrow_upward: 'ArrowUp',
  audio_file: 'FileAudio',
  auto_fix_high: 'Wand2',
  auto_stories: 'BookMarked',
  center_focus_strong: 'Focus',
  chat: 'MessageSquare',
  check: 'Check',
  chevron_left: 'ChevronLeft',
  close: 'X',
  close_fullscreen: 'Minimize2',
  cloud_sync: 'CloudSync',
  content_copy: 'Copy',
  content_cut: 'Scissors',
  delete: 'Trash2',
  draw: 'Pencil',
  edit: 'Pencil',
  edit_note: 'NotebookPen',
  error: 'AlertCircle',
  expand_less: 'ChevronUp',
  expand_more: 'ChevronDown',
  fact_check: 'ListChecks',
  folder_open: 'FolderOpen',
  format_list_bulleted: 'List',
  forward_10: 'SkipForward',
  forward_5: 'SkipForward',
  fullscreen: 'Maximize2',
  history: 'History',
  hourglass_empty: 'Hourglass',
  info: 'Info',
  inventory_2: 'Package',
  layers: 'Layers',
  library_books: 'LibraryBig',
  link_off: 'Link2Off',
  local_library: 'Library',
  menu_book: 'BookOpen',
  mic: 'Mic',
  mic_none: 'MicOff',
  mic_off: 'MicOff',
  more_vert: 'MoreVertical',
  open_in_full: 'Expand',
  open_in_new: 'ExternalLink',
  pause: 'Pause',
  play_arrow: 'Play',
  progress_activity: 'Loader2',
  psychology: 'Brain',
  push_pin: 'Pin',
  redo: 'Redo2',
  refresh: 'RefreshCw',
  repeat: 'Repeat',
  replay_10: 'SkipBack',
  replay_5: 'SkipBack',
  restart_alt: 'RotateCcw',
  search_off: 'SearchX',
  settings: 'Settings',
  smart_toy: 'Bot',
  speech_to_text: 'AudioLines',
  stop: 'Square',
  straighten: 'Ruler',
  subtitles: 'Subtitles',
  sync_alt: 'ArrowLeftRight',
  thumb_down: 'ThumbsDown',
  thumb_down_off_alt: 'ThumbsDown',
  thumb_up: 'ThumbsUp',
  thumb_up_off_alt: 'ThumbsUp',
  translate: 'Languages',
  tune: 'Settings',
  undo: 'Undo2',
  upload: 'Upload',
  video_file: 'FileVideo',
  view_agenda: 'Rows3',
  view_column_2: 'Columns2',
  visibility_off: 'EyeOff',
  volume_off: 'VolumeX',
  volume_up: 'Volume2',
  warning: 'AlertTriangle',
  wifi_off: 'WifiOff',
};

const CONST_KEYS = [
  ['JIEYU_MATERIAL_WAVE_PLAY', 'JIEYU_ICON_WAVE_PLAY'],
  ['JIEYU_MATERIAL_WAVE_MD', 'JIEYU_ICON_WAVE_MD'],
  ['JIEYU_MATERIAL_WAVE_TRIGGER', 'JIEYU_ICON_WAVE_TRIGGER'],
  ['JIEYU_MATERIAL_WAVE', 'JIEYU_ICON_WAVE'],
  ['JIEYU_MATERIAL_UNDO_CHIP', 'JIEYU_ICON_UNDO_CHIP'],
  ['JIEYU_MATERIAL_AI_PANEL_SM', 'JIEYU_ICON_AI_PANEL_SM'],
  ['JIEYU_MATERIAL_AI_PANEL', 'JIEYU_ICON_AI_PANEL'],
  ['JIEYU_MATERIAL_LEFT_RAIL_CTX', 'JIEYU_ICON_LEFT_RAIL_CTX'],
  ['JIEYU_MATERIAL_PANEL_CLOSE_LG', 'JIEYU_ICON_PANEL_CLOSE_LG'],
  ['JIEYU_MATERIAL_PANEL', 'JIEYU_ICON_PANEL'],
  ['JIEYU_MATERIAL_INLINE_TIGHT', 'JIEYU_ICON_INLINE_TIGHT'],
  ['JIEYU_MATERIAL_INLINE', 'JIEYU_ICON_INLINE'],
  ['JIEYU_MATERIAL_MICRO_XS', 'JIEYU_ICON_MICRO_XS'],
  ['JIEYU_MATERIAL_MICRO', 'JIEYU_ICON_MICRO'],
  ['JIEYU_MATERIAL_HERO', 'JIEYU_ICON_HERO'],
  ['JIEYU_MATERIAL_VOICE_MIC', 'JIEYU_ICON_VOICE_MIC'],
  ['JIEYU_MATERIAL_NAV', 'JIEYU_ICON_NAV'],
  ['jieyuMaterialClass', 'jieyuIconClass'],
  ['MaterialSymbolProps', 'JieyuIconProps'],
  ['MaterialSymbol', 'JieyuIcon'],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function mapIconLiteral(name) {
  return NAME_MAP[name] ?? null;
}

/** Replace only name= / icon: icon-name literals (not arbitrary quotes). */
function rewriteIconAttrs(text) {
  let next = text;
  // name="foo" / name='foo' / name={"foo"} / name={'foo'}
  next = next.replace(/\bname=\{?["']([a-z0-9_]+)["']\}?/g, (full, key) => {
    const lucide = mapIconLiteral(key);
    if (!lucide) return full;
    if (full.includes('{')) return `name={'${lucide}'}`;
    const q = full.includes('"') ? '"' : "'";
    return `name=${q}${lucide}${q}`;
  });
  // icon: 'foo' (nav items)
  next = next.replace(/\bicon:\s*['"]([a-z0-9_]+)['"]/g, (full, key) => {
    const lucide = mapIconLiteral(key);
    if (!lucide) return full;
    return `icon: '${lucide}'`;
  });
  // severity / ternary results assigned then passed as name={severityIcon}
  next = next.replace(
    /\b(severityIcon|citationIcon)\s*=\s*([^;]+);/g,
    (full, id, expr) => {
      let e = expr;
      for (const [from, to] of Object.entries(NAME_MAP).sort((a, b) => b[0].length - a[0].length)) {
        e = e.replaceAll(`'${from}'`, `'${to}'`).replaceAll(`"${from}"`, `"${to}"`);
      }
      return `${id} = ${e};`;
    },
  );
  // Inline ternaries inside name={ ... }
  next = next.replace(/\bname=\{([^}]+)\}/g, (full, expr) => {
    let e = expr;
    let changed = false;
    for (const [from, to] of Object.entries(NAME_MAP).sort((a, b) => b[0].length - a[0].length)) {
      const n1 = e.replaceAll(`'${from}'`, `'${to}'`).replaceAll(`"${from}"`, `"${to}"`);
      if (n1 !== e) {
        e = n1;
        changed = true;
      }
    }
    return changed ? `name={${e}}` : full;
  });
  return next;
}

function rewriteImportsAndConsts(text) {
  let next = text;
  for (const [from, to] of CONST_KEYS) {
    next = next.replaceAll(from, to);
  }
  next = next.replaceAll('jieyu-material--', 'jieyu-icon--');
  // CSS var --jieyu-material-size etc.
  next = next.replaceAll('--jieyu-material-', '--jieyu-icon-');
  // class token jieyu-material (standalone), after -- variants already rewritten
  next = next.replace(/(^|[\s"'`.[{(,])jieyu-material\b/g, '$1jieyu-icon');
  next = next.replaceAll('utils/jieyuMaterialIcon', 'utils/jieyuIcon');
  next = next.replaceAll('components/ui/MaterialSymbol', 'components/ui/JieyuIcon');
  next = next.replaceAll('/MaterialSymbol', '/JieyuIcon');
  return next;
}

const files = walk(SRC);
let changed = 0;
for (const file of files) {
  // skip newly authored targets; they'll be rewritten for CSS vars if needed
  const raw = fs.readFileSync(file, 'utf8');
  let next = rewriteImportsAndConsts(raw);
  if (/\.(ts|tsx)$/.test(file)) {
    next = rewriteIconAttrs(next);
  }
  if (next !== raw) {
    fs.writeFileSync(file, next);
    changed += 1;
    console.log('updated', path.relative(ROOT, file));
  }
}

// Rename leftover files
const renames = [
  ['src/components/ui/MaterialSymbol.tsx', null], // delete after JieyuIcon exists
  ['src/utils/jieyuMaterialIcon.ts', null],
  ['src/utils/materialIconToLucide.ts', null],
  ['src/utils/materialIconToLucide.test.ts', null],
];
for (const [rel, _to] of renames) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('removed', rel);
  }
}

console.log('files changed', changed);
