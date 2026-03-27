/**
 * Declarative keybinding registry with localStorage persistence.
 *
 * Combo format:  "mod+shift+z", "space", "delete|backspace", "mod+m"
 *   - mod  → metaKey (Mac) or ctrlKey
 *   - shift, alt → modifier flags
 *   - last segment is the key (case-insensitive)
 *   - pipe `|` separates alternatives (matched with OR)
 */

// ---- Types ----

export type KeyCombo = string;
export type ActionScope = 'global' | 'waveform';

export interface KeybindingEntry {
  id: string;
  label: string;
  defaultKey: KeyCombo;
  scope: ActionScope;
  category: 'playback' | 'editing' | 'navigation' | 'view' | 'voice';
}

// ---- Default keymap ----

export const DEFAULT_KEYBINDINGS: KeybindingEntry[] = [
  // Global (active even when an input is focused)
  { id: 'undo',          label: '撤销',         defaultKey: 'mod+z',          scope: 'global',   category: 'editing' },
  { id: 'redo',          label: '重做',         defaultKey: 'mod+shift+z|mod+y', scope: 'global',   category: 'editing' },
  { id: 'search',        label: '搜索替换',     defaultKey: 'mod+f',          scope: 'global',   category: 'view' },
  { id: 'toggleNotes',   label: '切换备注面板', defaultKey: 'mod+shift+n',    scope: 'global',   category: 'view' },

  // Waveform (only when waveform area is focused, not in text inputs)
  { id: 'playPause',     label: '播放/暂停',    defaultKey: 'space',          scope: 'waveform', category: 'playback' },
  { id: 'markSegment',   label: '标记句段',     defaultKey: 'enter',          scope: 'waveform', category: 'editing' },
  { id: 'cancel',        label: '取消',         defaultKey: 'escape',         scope: 'waveform', category: 'editing' },
  { id: 'deleteSegment', label: '删除句段',     defaultKey: 'delete|backspace', scope: 'waveform', category: 'editing' },
  { id: 'mergePrev',     label: '合并上一个',   defaultKey: 'mod+shift+m',    scope: 'waveform', category: 'editing' },
  { id: 'mergeNext',     label: '合并下一个',   defaultKey: 'mod+m',          scope: 'waveform', category: 'editing' },
  { id: 'splitSegment',  label: '分割句段',     defaultKey: 'mod+shift+s',    scope: 'waveform', category: 'editing' },
  { id: 'selectBefore',  label: '选到开头',     defaultKey: 'shift+home',     scope: 'waveform', category: 'navigation' },
  { id: 'selectAfter',   label: '选到结尾',     defaultKey: 'shift+end',      scope: 'waveform', category: 'navigation' },
  { id: 'selectAll',     label: '全选',         defaultKey: 'mod+a',          scope: 'waveform', category: 'navigation' },
  { id: 'navPrev',       label: '上一个句段',   defaultKey: 'arrowleft',      scope: 'waveform', category: 'navigation' },
  { id: 'navNext',       label: '下一个句段',   defaultKey: 'arrowright',     scope: 'waveform', category: 'navigation' },
  { id: 'tabNext',       label: 'Tab 播放下一个', defaultKey: 'tab',          scope: 'waveform', category: 'navigation' },
  { id: 'tabPrev',       label: 'Tab 播放上一个', defaultKey: 'shift+tab',    scope: 'waveform', category: 'navigation' },
  { id: 'stepBack',     label: '后退一帧',       defaultKey: ',',            scope: 'waveform', category: 'navigation' },
  { id: 'stepForward',  label: '前进一帧',       defaultKey: '.',            scope: 'waveform', category: 'navigation' },
  { id: 'reviewNext',   label: '跳到下一个低置信度句段', defaultKey: ']', scope: 'waveform', category: 'navigation' },
  { id: 'reviewPrev',   label: '跳到上一个低置信度句段', defaultKey: '[', scope: 'waveform', category: 'navigation' },

  // Voice agent
  { id: 'toggleVoice',   label: '语音智能体',     defaultKey: 'mod+shift+.',  scope: 'global',   category: 'voice' },
];

// ---- Combo matching ----

interface ParsedCombo {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;   // lowercase
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop()!;
  return {
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key,
  };
}

function normalizeEventKey(key: string): string {
  const k = key.toLowerCase();
  if (k === ' ' || k === 'spacebar' || k === 'space') return 'space';
  if (k === 'esc') return 'escape';
  return k;
}

export function matchKeyEvent(e: KeyboardEvent | React.KeyboardEvent, combo: KeyCombo): boolean {
  // Handle pipe-separated alternatives
  const alternatives = combo.split('|');
  const eventKey = normalizeEventKey(e.key);
  return alternatives.some((alt) => {
    const parsed = parseCombo(alt.trim());
    const hasMod = e.metaKey || e.ctrlKey;
    if (parsed.mod !== hasMod) return false;
    if (parsed.shift !== e.shiftKey) return false;
    if (parsed.alt !== e.altKey) return false;
    return eventKey === parsed.key;
  });
}

// ---- User customization persistence ----

const STORAGE_KEY = 'jieyu-keybindings';

export function loadUserOverrides(): Map<string, KeyCombo> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch (err) {
    console.warn('[KeybindingService] loadUserOverrides failed, using empty overrides:', err);
    return new Map();
  }
}

export function saveUserOverride(id: string, combo: KeyCombo): void {
  const map = loadUserOverrides();
  map.set(id, combo);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
}

export function resetUserOverrides(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Build the effective keymap: defaults merged with user overrides. */
export function getEffectiveKeymap(): Map<string, KeyCombo> {
  const overrides = loadUserOverrides();
  const map = new Map<string, KeyCombo>();
  for (const entry of DEFAULT_KEYBINDINGS) {
    map.set(entry.id, overrides.get(entry.id) ?? entry.defaultKey);
  }
  return map;
}

/** Resolve all keybinding entries with effective combos. */
export function getResolvedKeybindings(): Array<KeybindingEntry & { effectiveKey: KeyCombo }> {
  const overrides = loadUserOverrides();
  return DEFAULT_KEYBINDINGS.map((entry) => ({
    ...entry,
    effectiveKey: overrides.get(entry.id) ?? entry.defaultKey,
  }));
}

/** 格式化快捷键组合显示 | Format keyboard combo for display */
export function formatKeyComboForDisplay(combo: string): string {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return combo
    .split('|')[0]!
    .split('+')
    .map((part) => {
      if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'shift') return '⇧';
      if (part === 'alt') return isMac ? '⌥' : 'Alt';
      if (part === 'space') return '空格';
      if (part === 'enter') return '↵ Enter';
      if (part === 'escape') return 'Esc';
      if (part === 'tab') return '⇥ Tab';
      if (part === 'delete' || part === 'backspace') return 'Del / ⌫';
      if (part === 'arrowleft') return '←';
      if (part === 'arrowright') return '→';
      if (part === 'home') return 'Home';
      if (part === 'end') return 'End';
      return part.toUpperCase();
    })
    .join(' + ');
}
