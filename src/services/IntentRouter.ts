/**
 * IntentRouter — 语音指令意图路由
 *
 * 将 STT 转写文本匹配到 UI ActionId、AI 工具调用、听写模式或闲聊。
 * 采用优先级从高到低的正则规则链。
 *
 * @see 解语-语音智能体架构设计方案 §4.4
 */

// ── Action IDs ──

/** All dispatchable UI action IDs (matches KeybindingService + voice-only actions). */
export type ActionId =
  // Playback
  | 'playPause'
  // Editing
  | 'markSegment'
  | 'cancel'
  | 'deleteSegment'
  | 'mergePrev'
  | 'mergeNext'
  | 'splitSegment'
  | 'undo'
  | 'redo'
  // Navigation
  | 'selectBefore'
  | 'selectAfter'
  | 'selectAll'
  | 'navPrev'
  | 'navNext'
  | 'tabNext'
  | 'tabPrev'
  // View
  | 'search'
  | 'toggleNotes'
  // Voice-specific
  | 'toggleVoice';

const ACTION_ID_SET: ReadonlySet<ActionId> = new Set<ActionId>([
  'playPause',
  'markSegment',
  'cancel',
  'deleteSegment',
  'mergePrev',
  'mergeNext',
  'splitSegment',
  'undo',
  'redo',
  'selectBefore',
  'selectAfter',
  'selectAll',
  'navPrev',
  'navNext',
  'tabNext',
  'tabPrev',
  'search',
  'toggleNotes',
  'toggleVoice',
]);

export function isActionId(value: string): value is ActionId {
  return ACTION_ID_SET.has(value as ActionId);
}

// ── Intent Types ──

export type VoiceIntentType = 'action' | 'tool' | 'dictation' | 'slot-fill' | 'chat';

export interface ActionIntent {
  type: 'action';
  actionId: ActionId;
  raw: string;
}

export interface ToolIntent {
  type: 'tool';
  toolName: string;
  params: Record<string, string>;
  raw: string;
}

export interface DictationIntent {
  type: 'dictation';
  text: string;
  raw: string;
}

export interface SlotFillIntent {
  type: 'slot-fill';
  slotName: string;
  value: string;
  raw: string;
}

export interface ChatIntent {
  type: 'chat';
  text: string;
  raw: string;
}

export type VoiceIntent = ActionIntent | ToolIntent | DictationIntent | SlotFillIntent | ChatIntent;

// ── Voice Session ──

export interface VoiceSessionEntry {
  timestamp: number;
  intent: VoiceIntent;
  sttText: string;
  confidence: number;
}

export interface VoiceSession {
  id: string;
  startedAt: number;
  entries: VoiceSessionEntry[];
  mode: 'command' | 'dictation' | 'analysis';
}

export interface VoiceReplayAction {
  actionId: ActionId;
  label: string;
  timestamp: number;
  confidence: number;
  sourceText: string;
}

export function createVoiceSession(): VoiceSession {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    entries: [],
    mode: 'command',
  };
}

/**
 * Export replayable UI actions from a voice session.
 *
 * Only direct action intents are exported. Tool/chat/dictation events are ignored.
 */
export function exportReplaySequence(session: VoiceSession): VoiceReplayAction[] {
  return session.entries
    .filter((entry): entry is VoiceSessionEntry & { intent: ActionIntent } => entry.intent.type === 'action')
    .map((entry) => ({
      actionId: entry.intent.actionId,
      label: getActionLabel(entry.intent.actionId),
      timestamp: entry.timestamp,
      confidence: entry.confidence,
      sourceText: entry.sttText,
    }));
}

// ── Regex Intent Rules ──

interface IntentRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => VoiceIntent;
  priority: number;
  /** Modes where this rule is active. Undefined = all modes. */
  mode?: VoiceAgentMode;
}

/** Matches VoiceAgentMode values used for rule filtering. */
type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

/**
 * Intent rules — ordered by priority (higher number = higher priority).
 *
 * Chinese patterns primary, with English aliases for common commands.
 * All patterns test against normalized (trimmed, lower-cased for English) text.
 */
const INTENT_RULES: IntentRule[] = [
  // ── Priority 100: Playback (all modes — always useful) ──
  {
    pattern: /^(播放|暂停|停|play|pause|stop)$/,
    extract: (m) => ({ type: 'action', actionId: 'playPause', raw: m[0] }),
    priority: 100,
  },

  // ── Priority 90: Navigation (all modes) ──
  {
    pattern: /^(上一[个句段条]|前一[个句段条]|previous|prev)$/,
    extract: (m) => ({ type: 'action', actionId: 'navPrev', raw: m[0] }),
    priority: 90,
  },
  {
    pattern: /^(下一[个句段条]|后一[个句段条]|next)$/,
    extract: (m) => ({ type: 'action', actionId: 'navNext', raw: m[0] }),
    priority: 90,
  },

  // ── Priority 85: Editing (all modes) ──
  {
    pattern: /^(标记|mark|mark\s*segment)$/,
    extract: (m) => ({ type: 'action', actionId: 'markSegment', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(删除|删掉|delete|remove)$/,
    extract: (m) => ({ type: 'action', actionId: 'deleteSegment', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(合并上一个|merge\s*prev(?:ious)?)$/,
    extract: (m) => ({ type: 'action', actionId: 'mergePrev', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(合并下一个|merge\s*next)$/,
    extract: (m) => ({ type: 'action', actionId: 'mergeNext', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(分割|split|分割句段)$/,
    extract: (m) => ({ type: 'action', actionId: 'splitSegment', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(取消|cancel|escape)$/,
    extract: (m) => ({ type: 'action', actionId: 'cancel', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(撤销|undo)$/,
    extract: (m) => ({ type: 'action', actionId: 'undo', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(重做|redo)$/,
    extract: (m) => ({ type: 'action', actionId: 'redo', raw: m[0] }),
    priority: 85,
  },
  {
    pattern: /^(全选|select\s*all)$/,
    extract: (m) => ({ type: 'action', actionId: 'selectAll', raw: m[0] }),
    priority: 85,
  },

  // ── Priority 80: View (all modes) ──
  {
    pattern: /^(搜索|查找|search|find)$/,
    extract: (m) => ({ type: 'action', actionId: 'search', raw: m[0] }),
    priority: 80,
  },
  {
    pattern: /^(备注|笔记|notes|toggle\s*notes)$/,
    extract: (m) => ({ type: 'action', actionId: 'toggleNotes', raw: m[0] }),
    priority: 80,
  },

  // ── Priority 70: AI Tool shortcuts (all modes — useful in dictation too) ──
  {
    pattern: /^(?:自动|auto)\s*(?:标注|gloss|注释)/,
    extract: (m) => ({
      type: 'tool',
      toolName: 'auto_gloss_utterance',
      params: {},
      raw: m[0],
    }),
    priority: 70,
  },
  {
    pattern: /^(?:翻译|translate)\s*(?:成|to|为)\s*(.+)$/,
    extract: (m) => ({
      type: 'tool',
      toolName: 'set_translation_text',
      params: { targetLang: m[1] ?? '' },
      raw: m[0],
    }),
    priority: 70,
  },

  // ── Priority 65: Dictation-mode control (all modes) ──
  {
    pattern: /^(?:退出听写|停止听写|结束听写|exit\s*dictation|stop\s*dictation)$/,
    extract: (m) => ({ type: 'action', actionId: 'cancel', raw: m[0] }),
    priority: 65,
  },

  // ── Priority 60: Slot-fill (all modes) ──
  {
    pattern: /^(?:文本|内容|text)[是为:：]\s*(.+)$/,
    extract: (m) => ({
      type: 'slot-fill',
      slotName: 'text',
      value: m[1] ?? '',
      raw: m[0],
    }),
    priority: 60,
  },
  {
    pattern: /^(?:语言|lang(?:uage)?)[是为:：]\s*(.+)$/,
    extract: (m) => ({
      type: 'slot-fill',
      slotName: 'language',
      value: m[1] ?? '',
      raw: m[0],
    }),
    priority: 60,
  },
];

// Sort rules by priority descending (highest first)
const SORTED_RULES = [...INTENT_RULES].sort((a, b) => b.priority - a.priority);

// ── Public API ──

/**
 * Route a raw STT transcript to a VoiceIntent.
 *
 * Rules are always tried first (filtered by mode). If no rule matches,
 * the mode-specific fallback is used.
 *
 * @param text  Raw transcript from STT, may include whitespace / punctuation.
 * @param mode  Current voice agent mode.
 * @returns Matched intent, or a chat/dictation fallback.
 */
export function routeIntent(
  text: string,
  mode: VoiceAgentMode = 'command',
): VoiceIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: 'chat', text: '', raw: text };
  }

  // Strip trailing punctuation for matching (e.g. "播放。" → "播放")
  const cleaned = trimmed.replace(/[。！？，、,.!?]+$/, '');

  // Try all rules in priority order, respecting mode filter
  for (const rule of SORTED_RULES) {
    // Skip rules that don't apply to this mode
    if (rule.mode !== undefined && rule.mode !== mode) continue;
    const match = cleaned.match(rule.pattern);
    if (match) {
      const intent = rule.extract(match);
      // Preserve original (untrimmed, unpunctuated) text as raw
      return { ...intent, raw: text } as VoiceIntent;
    }
  }

  // Fallback: mode-specific behaviour for unmatched input
  if (mode === 'dictation') {
    return { type: 'dictation', text: trimmed, raw: text };
  }
  if (mode === 'analysis') {
    return { type: 'chat', text: trimmed, raw: text };
  }
  // command mode: treat as chat (let AI decide)
  return { type: 'chat', text: trimmed, raw: text };
}

/**
 * Check if a given ActionId requires safeMode confirmation.
 * Destructive actions (delete, merge, split) need confirmation when safeMode is on.
 */
export function isDestructiveAction(actionId: ActionId): boolean {
  const destructive: ReadonlySet<ActionId> = new Set([
    'deleteSegment',
    'mergePrev',
    'mergeNext',
    'splitSegment',
  ]);
  return destructive.has(actionId);
}

/**
 * Get the human-readable label for an ActionId (for confirmation dialog / earcon feedback).
 */
export function getActionLabel(actionId: ActionId): string {
  const labels: Record<ActionId, string> = {
    playPause: '播放/暂停',
    markSegment: '标记句段',
    cancel: '取消',
    deleteSegment: '删除句段',
    mergePrev: '合并上一个',
    mergeNext: '合并下一个',
    splitSegment: '分割句段',
    undo: '撤销',
    redo: '重做',
    selectBefore: '选到开头',
    selectAfter: '选到结尾',
    selectAll: '全选',
    navPrev: '上一个句段',
    navNext: '下一个句段',
    tabNext: 'Tab下一个',
    tabPrev: 'Tab上一个',
    search: '搜索',
    toggleNotes: '备注面板',
    toggleVoice: '语音',
  };
  return labels[actionId];
}
