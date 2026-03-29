import type { ActionId } from './IntentRouter';

const VOICE_ALIAS_LEARNING_LOG_KEY = 'jieyu.voice.intent.aliasLearningLog';
const MAX_VOICE_ALIAS_LOG_SIZE = 50;

const ACTION_LABELS: Record<ActionId, string> = {
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
  navToIndex: '跳到指定句段',
  tabNext: 'Tab下一个',
  tabPrev: 'Tab上一个',
  search: '搜索',
  toggleNotes: '备注面板',
  toggleVoice: '语音',
};

export interface VoiceAliasLearningLogEntry {
  timestamp: number;
  phrase: string;
  actionId: ActionId;
  reason: 'empty' | 'updated' | 'unchanged' | 'conflict';
  previousActionId?: ActionId;
}

function isVoiceAliasLearningLogEntry(entry: unknown): entry is VoiceAliasLearningLogEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Record<string, unknown>;
  return typeof candidate.timestamp === 'number'
    && typeof candidate.phrase === 'string'
    && typeof candidate.actionId === 'string'
    && candidate.actionId in ACTION_LABELS
    && typeof candidate.reason === 'string';
}

export function getActionLabel(actionId: ActionId): string {
  return ACTION_LABELS[actionId] ?? String(actionId);
}

export function loadVoiceAliasLearningLog(): VoiceAliasLearningLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VOICE_ALIAS_LEARNING_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVoiceAliasLearningLogEntry);
  } catch (err) {
    console.debug('[voiceIntentUi] loadVoiceAliasLearningLog failed, using empty log:', err);
    return [];
  }
}

export function clearVoiceAliasLearningLog(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(VOICE_ALIAS_LEARNING_LOG_KEY);
}

export function appendVoiceAliasLearningLog(entry: VoiceAliasLearningLogEntry): void {
  if (typeof window === 'undefined') return;
  const current = loadVoiceAliasLearningLog();
  const next = [...current, entry];
  if (next.length > MAX_VOICE_ALIAS_LOG_SIZE) {
    next.splice(0, next.length - MAX_VOICE_ALIAS_LOG_SIZE);
  }
  window.localStorage.setItem(VOICE_ALIAS_LEARNING_LOG_KEY, JSON.stringify(next));
}