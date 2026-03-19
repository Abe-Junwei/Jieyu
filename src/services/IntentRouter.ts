/**
 * IntentRouter — 语音指令意图路由
 *
 * 将 STT 转写文本匹配到 UI ActionId、AI 工具调用、听写模式或闲聊。
 * 采用优先级从高到低的正则规则链。
 *
 * 有两套规则层：
 *   1. 精确规则（INTENT_RULES）— 优先级高，锚定 ^ … $
 *   2. 模糊规则（FUZZY_RULES）— 优先级低，仅做子串包含匹配；
 *      专门处理口语化表达（"播放一下"、"撤一下"、"算了"等），
 *      减少对 LLM fallback 的依赖。
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
  /** True when matched via fuzzy (substring) rules rather than exact regex. */
  fromFuzzy?: boolean;
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

// ── Fuzzy (substring) Rules ───────────────────────────────────────────────────

interface FuzzyRule {
  /** Space-separated keywords; matches if ANY keyword is contained in the cleaned text. */
  keywords: string;
  actionId: ActionId;
  priority: number;
}

/**
 * Fuzzy rules — matched after exact rules fail.
 * Keywords are lower-cased; Chinese text uses pinyin romanisation or Chinese characters.
 * These handle colloquial / partial expressions ("播放一下", "撤一下", "算了").
 *
 * Coverage is intentionally broad so that most common commands succeed even with
 * imperfect STT output or offline (no LLM) conditions.
 */
const FUZZY_RULES: FuzzyRule[] = [
  // Playback — very high recall (play/pause/stop are the same action)
  { keywords: '播放 播一下 播放一下 播呗 播放呗 停一下 暂停 停止 关了 关上 打开 开', actionId: 'playPause', priority: 50 },
  // Navigation — also very high recall
  { keywords: '上一 前一个 上一个 上  previous prev 向后', actionId: 'navPrev', priority: 50 },
  { keywords: '下一 后一个 下一个 下  next 向后', actionId: 'navNext', priority: 50 },
  // Segment editing — common partial speech forms
  { keywords: '标记 标一下 标记一下 标记句段 mark segment mark一下 标注', actionId: 'markSegment', priority: 50 },
  { keywords: '删除 删掉 删一下 删除一下 删除这句 删了 删', actionId: 'deleteSegment', priority: 50 },
  { keywords: '合并上 合并上一个 合并上 合并前', actionId: 'mergePrev', priority: 50 },
  { keywords: '合并下 合并下一个 合并下 合并后', actionId: 'mergeNext', priority: 50 },
  { keywords: '分割 split 分割一下 分一下 切开 切', actionId: 'splitSegment', priority: 50 },
  // Cancel / undo — multiple forms
  { keywords: '取消 算了 不要了 算了算了 取消吧 不做了', actionId: 'cancel', priority: 50 },
  { keywords: '撤销 撤一下 撤销一下 撤销 撤  undo 取消操作', actionId: 'undo', priority: 50 },
  { keywords: '重做 重来 再做一遍 重试 重新做 再做', actionId: 'redo', priority: 50 },
  // Selection
  { keywords: '全选 select all 选中全部 全部选中', actionId: 'selectAll', priority: 50 },
  { keywords: '选前 选到前面 选开头 选到开头', actionId: 'selectBefore', priority: 50 },
  { keywords: '选后 选到后面 选结尾 选到结尾', actionId: 'selectAfter', priority: 50 },
  // View
  { keywords: '搜索 搜一下 查找 找一下 搜索一下 查一下', actionId: 'search', priority: 50 },
  { keywords: '备注 笔记 note 备注一下', actionId: 'toggleNotes', priority: 50 },
  // Voice toggle
  { keywords: '语音 语音助手 开关语音 打开语音 关闭语音', actionId: 'toggleVoice', priority: 50 },
  // Tab navigation
  { keywords: 'tab下一个 下一个tab 切到下tab', actionId: 'tabNext', priority: 50 },
  { keywords: 'tab上一个 上一个tab 切到上tab', actionId: 'tabPrev', priority: 50 },
];

// Sort fuzzy rules by priority descending
const SORTED_FUZZY_RULES = [...FUZZY_RULES].sort((a, b) => b.priority - a.priority);

// ── Public API ──

/**
 * Route a raw STT transcript to a VoiceIntent.
 *
 * Rules are always tried first (filtered by mode). If no rule matches,
 * the fuzzy rules are tried. Finally, the mode-specific fallback is used.
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
  const cleaned = trimmed.replace(/[。！？，、,.!?]+$/, '').toLowerCase();

  // Try all exact rules in priority order, respecting mode filter
  for (const rule of SORTED_RULES) {
    if (rule.mode !== undefined && rule.mode !== mode) continue;
    const match = cleaned.match(rule.pattern);
    if (match) {
      const intent = rule.extract(match);
      return { ...intent, raw: text } as VoiceIntent;
    }
  }

  // Try fuzzy rules (command mode only) — substring contains match
  if (mode === 'command') {
    for (const rule of SORTED_FUZZY_RULES) {
      const kwList = rule.keywords.split(' ').filter(Boolean);
      if (kwList.some((kw) => cleaned.includes(kw))) {
        return { type: 'action', actionId: rule.actionId, raw: text, fromFuzzy: true };
      }
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
