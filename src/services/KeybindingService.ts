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
  { id: 'undo',          label: '\u64a4\u9500',         defaultKey: 'mod+z',          scope: 'global',   category: 'editing' },
  { id: 'redo',          label: '\u91cd\u505a',         defaultKey: 'mod+shift+z|mod+y', scope: 'global',   category: 'editing' },
  { id: 'search',        label: '\u641c\u7d22\u66ff\u6362',     defaultKey: 'mod+f',          scope: 'global',   category: 'view' },
  { id: 'toggleNotes',   label: '\u5207\u6362\u5907\u6ce8\u9762\u677f', defaultKey: 'mod+shift+n',    scope: 'global',   category: 'view' },

  // Waveform (only when waveform area is focused, not in text inputs)
  { id: 'playPause',     label: '\u64ad\u653e/\u6682\u505c',    defaultKey: 'space',          scope: 'waveform', category: 'playback' },
  { id: 'markSegment',   label: '\u6807\u8bb0\u53e5\u6bb5',     defaultKey: 'enter',          scope: 'waveform', category: 'editing' },
  { id: 'cancel',        label: '\u53d6\u6d88',         defaultKey: 'escape',         scope: 'waveform', category: 'editing' },
  { id: 'deleteSegment', label: '\u5220\u9664\u53e5\u6bb5',     defaultKey: 'delete|backspace', scope: 'waveform', category: 'editing' },
  { id: 'mergePrev',     label: '\u5408\u5e76\u4e0a\u4e00\u4e2a',   defaultKey: 'mod+shift+m',    scope: 'waveform', category: 'editing' },
  { id: 'mergeNext',     label: '\u5408\u5e76\u4e0b\u4e00\u4e2a',   defaultKey: 'mod+m',          scope: 'waveform', category: 'editing' },
  { id: 'splitSegment',  label: '\u5206\u5272\u53e5\u6bb5',     defaultKey: 'mod+shift+s',    scope: 'waveform', category: 'editing' },
  { id: 'selectBefore',  label: '\u9009\u5230\u5f00\u5934',     defaultKey: 'shift+home',     scope: 'waveform', category: 'navigation' },
  { id: 'selectAfter',   label: '\u9009\u5230\u7ed3\u5c3e',     defaultKey: 'shift+end',      scope: 'waveform', category: 'navigation' },
  { id: 'selectAll',     label: '\u5168\u9009',         defaultKey: 'mod+a',          scope: 'waveform', category: 'navigation' },
  { id: 'navPrev',       label: '\u4e0a\u4e00\u4e2a\u53e5\u6bb5',   defaultKey: 'arrowleft',      scope: 'waveform', category: 'navigation' },
  { id: 'navNext',       label: '\u4e0b\u4e00\u4e2a\u53e5\u6bb5',   defaultKey: 'arrowright',     scope: 'waveform', category: 'navigation' },
  { id: 'tabNext',       label: 'Tab \u64ad\u653e\u4e0b\u4e00\u4e2a', defaultKey: 'tab',          scope: 'waveform', category: 'navigation' },
  { id: 'tabPrev',       label: 'Tab \u64ad\u653e\u4e0a\u4e00\u4e2a', defaultKey: 'shift+tab',    scope: 'waveform', category: 'navigation' },
  { id: 'stepBack',     label: '\u540e\u9000\u4e00\u5e27',       defaultKey: ',',            scope: 'waveform', category: 'navigation' },
  { id: 'stepForward',  label: '\u524d\u8fdb\u4e00\u5e27',       defaultKey: '.',            scope: 'waveform', category: 'navigation' },
  { id: 'reviewNext',   label: '\u8df3\u5230\u4e0b\u4e00\u4e2a\u4f4e\u7f6e\u4fe1\u5ea6\u53e5\u6bb5', defaultKey: ']', scope: 'waveform', category: 'navigation' },
  { id: 'reviewPrev',   label: '\u8df3\u5230\u4e0a\u4e00\u4e2a\u4f4e\u7f6e\u4fe1\u5ea6\u53e5\u6bb5', defaultKey: '[', scope: 'waveform', category: 'navigation' },

  // Voice agent
  { id: 'toggleVoice',   label: '\u8bed\u97f3\u667a\u80fd\u4f53',     defaultKey: 'mod+shift+.',  scope: 'global',   category: 'voice' },
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

/** Format keyboard combo for display. */
export function formatKeyComboForDisplay(combo: string): string {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return combo
    .split('|')[0]!
    .split('+')
    .map((part) => {
      if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'shift') return '⇧';
      if (part === 'alt') return isMac ? '⌥' : 'Alt';
      if (part === 'space') return '\u7a7a\u683c';
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
