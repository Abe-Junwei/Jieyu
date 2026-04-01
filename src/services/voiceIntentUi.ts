import type { ActionId } from './IntentRouter';
import { getStoredLocalePreference, t, type DictKey, type Locale } from '../i18n';

const VOICE_ALIAS_LEARNING_LOG_KEY = 'jieyu.voice.intent.aliasLearningLog';
const MAX_VOICE_ALIAS_LOG_SIZE = 50;

const ACTION_LABEL_KEYS: Record<ActionId, DictKey> = {
  playPause: 'transcription.voiceAction.playPause',
  markSegment: 'transcription.voiceAction.markSegment',
  cancel: 'transcription.voiceAction.cancel',
  deleteSegment: 'transcription.voiceAction.deleteSegment',
  mergePrev: 'transcription.voiceAction.mergePrev',
  mergeNext: 'transcription.voiceAction.mergeNext',
  splitSegment: 'transcription.voiceAction.splitSegment',
  undo: 'transcription.voiceAction.undo',
  redo: 'transcription.voiceAction.redo',
  selectBefore: 'transcription.voiceAction.selectBefore',
  selectAfter: 'transcription.voiceAction.selectAfter',
  selectAll: 'transcription.voiceAction.selectAll',
  navPrev: 'transcription.voiceAction.navPrev',
  navNext: 'transcription.voiceAction.navNext',
  navToIndex: 'transcription.voiceAction.navToIndex',
  tabNext: 'transcription.voiceAction.tabNext',
  tabPrev: 'transcription.voiceAction.tabPrev',
  search: 'transcription.voiceAction.search',
  toggleNotes: 'transcription.voiceAction.toggleNotes',
  toggleVoice: 'transcription.voiceAction.toggleVoice',
};

export interface VoiceAliasLearningLogEntry {
  timestamp: number;
  phrase: string;
  actionId: ActionId;
  reason: 'empty' | 'updated' | 'unchanged' | 'conflict';
  previousActionId?: ActionId;
}

const VOICE_ALIAS_REASON_KEYS = {
  empty: 'transcription.voiceWidget.learningReason.new',
  updated: 'transcription.voiceWidget.learningReason.updated',
  unchanged: 'transcription.voiceWidget.learningReason.unchanged',
  conflict: 'transcription.voiceWidget.learningReason.conflict',
} as const satisfies Record<VoiceAliasLearningLogEntry['reason'], DictKey>;

function isVoiceAliasLearningLogEntry(entry: unknown): entry is VoiceAliasLearningLogEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Record<string, unknown>;
  return typeof candidate.timestamp === 'number'
    && typeof candidate.phrase === 'string'
    && typeof candidate.actionId === 'string'
    && candidate.actionId in ACTION_LABEL_KEYS
    && typeof candidate.reason === 'string';
}

function resolveVoiceIntentLocale(locale?: Locale): Locale {
  return locale ?? getStoredLocalePreference() ?? 'zh-CN';
}

export function getActionLabel(actionId: ActionId, locale?: Locale): string {
  return t(resolveVoiceIntentLocale(locale), ACTION_LABEL_KEYS[actionId]);
}

export function getVoiceAliasLearningReasonLabel(reason: VoiceAliasLearningLogEntry['reason'], locale?: Locale): string {
  return t(resolveVoiceIntentLocale(locale), VOICE_ALIAS_REASON_KEYS[reason]);
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
