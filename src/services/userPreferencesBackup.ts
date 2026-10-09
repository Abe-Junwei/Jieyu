/**
 * JYB 里的用户偏好（rev5 7.5“单独的 settings 条目”；用户决定 2026-10-09：用户偏好进 JYB）。
 * User preferences inside a JYB (rev5 7.5 "separate settings entry"; user decision 2026-10-09).
 *
 * - 只收白名单里的 localStorage 键：界面、语言、播放与波形、AI 参数。凭据、会话、协作状态、缓存、
 *   日志一律不收；值是 JSON 对象时，再去掉名字像密钥或服务地址的字段。
 * - 带服务地址的键（向量服务、本地 Whisper、语音增强）不收（REV5-N1）。
 * - AI 聊天设置（REV5-N2）：明文键常被 keyVault 删掉；导出时从 vault 读出，只保留 provider / model
 *   等非敏感字段，不带 apiKey 和任何 URL。
 * - 只在整库还原时、用户勾选后才写回；写回时只有服务地址类字段与本机完全相同，才保留本机密钥。
 * - Allow-listed keys only. Secret- and URL-looking JSON fields are scrubbed. AI chat settings are
 *   loaded from the vault when the plain key is gone, and only non-sensitive fields are packaged
 *   (REV5-N2). Restored only by an opted-in disaster restore.
 */

import { loadAiChatSettingsFromStorage } from '../ai/config/aiChatSettingsStorage';
import type { AiChatSettings } from '../ai/providers/providerCatalog';

/** 进 JYB 的偏好键（白名单）| Preference keys a JYB carries (allow-list) */
export const USER_PREFERENCE_KEYS: readonly string[] = [
  // 界面与无障碍 | UI and accessibility
  'jieyu.locale',
  'jieyu-theme',
  'jieyu-theme-accent',
  'jieyu-appearance',
  'jieyu-high-contrast',
  'jieyu-reduced-motion',
  'jieyu-keybindings',
  'jieyu-side-pane-width',
  'jieyu-side-pane-collapsed',
  'jieyu.hub.height',
  'jieyu:ui-font-scale',
  'jieyu:accessibility-reduced-motion',
  'jieyu:accessibility-high-contrast',
  // 工作台、波形与播放 | Workspace, waveform and playback
  'jieyu:lane-label-width',
  'jieyu:waveform-height',
  'jieyu:waveform-visual-style',
  'jieyu:waveform-display-mode',
  'jieyu:waveform-double-click-action',
  'jieyu:amplitude-scale',
  'jieyu:acoustic-overlay-mode',
  'jieyu:default-playback-rate',
  'jieyu:workspace-snap-enabled',
  'jieyu:workspace-default-zoom-mode',
  'jieyu:workspace-auto-scroll-enabled',
  'jieyu:workspace-vertical-view',
  'jieyu:new-segment-selection-behavior',
  'jieyu:video-layout-mode',
  'jieyu:video-right-panel-width',
  'jieyu:video-preview-height',
  'jieyu.video.fitMode',
  'jieyu:paired-reading-editor-min-height',
  'jieyu:paired-reading-column-left-grow',
  'jieyu:map-provider',
  // 设置开关 | Settings toggles
  'jieyu.settings.backupReminderEnabled',
  'jieyu.settings.dbIntegrityProbeEnabled',
  // AI 与语音参数（不含凭据）| AI and voice parameters (no credentials)
  'jieyu.aiChat.settings',
  'jieyu.aiChat.sessionTokenBudget',
  'jieyu.aiChat.outputTokenCap',
  'jieyu.aiChat.outputTokenRetryCap',
  'jieyu.aiChat.ragContextTimeoutMs',
  'jieyu.aiChat.streamPersistIntervalMs',
  'jieyu.aiChat.autoProbeIntervalMs',
  'jieyu.ai.promptTemplates.v1',
  'jieyu.acoustic.routingStrategy',
  'jieyu.voice.region',
  'jieyu.voice.intent.aliases',
];

const ALLOWED = new Set(USER_PREFERENCE_KEYS);
/** 单个值的上限 | Per-value size limit */
const MAX_VALUE_CHARS = 256 * 1024;

/** 名字像服务地址的字段 | Field names that look like a service address */
const ENDPOINT_FIELD_RE = /(url|endpoint|host|origin|server)/i;

/** 名字像密钥的字段 | Field names that look like secrets */
const SECRET_FIELD_RE =
  /(api[-_]?keys?|secret|password|passphrase|credential|authorization|bearer|access[-_]?token|refresh[-_]?token|session[-_]?token|^token$)/i;

export interface UserPreferenceEntry {
  key: string;
  value: string;
}

export interface PackagedUserPreferences {
  entries: UserPreferenceEntry[];
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_FIELD_RE.test(key)) continue;
    next[key] = scrubSecrets(inner);
  }
  return next;
}

/** AI 聊天设置里可进 JYB 的非敏感字段（无密钥、无地址）| Non-sensitive AI chat fields for a JYB */
const AI_CHAT_SAFE_FIELDS = [
  'providerKind',
  'model',
  'explainModel',
  'toolFeedbackStyle',
  'fallbackProviderKind',
  'sessionTokenBudget',
  'outputTokenCap',
  'outputTokenRetryCap',
  'modelsByProvider',
] as const;

/** 从完整设置抽出可备份字段（REV5-N2）| Pick backup-safe fields from full settings (REV5-N2) */
export function packAiChatSettingsForBackup(settings: AiChatSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of AI_CHAT_SAFE_FIELDS) {
    const value = settings[field];
    if (value !== undefined) out[field] = value;
  }
  return out;
}

function scrubEndpoints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubEndpoints);
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (ENDPOINT_FIELD_RE.test(key)) continue;
    next[key] = scrubEndpoints(inner);
  }
  return next;
}

/** 去掉 JSON 值里的密钥与服务地址字段 | Strip secret and endpoint fields from a JSON value */
function scrubValue(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed) || Array.isArray(parsed)) {
      return JSON.stringify(scrubEndpoints(scrubSecrets(parsed)));
    }
  } catch {
    // 非 JSON：原样 | not JSON: as is
  }
  return raw;
}

/**
 * 收集本机偏好（白名单、去密钥与地址；AI 设置走 vault，REV5-N2）。
 * Collect local preferences (allow-listed, scrubbed; AI settings via vault, REV5-N2).
 */
export async function collectUserPreferences(
  storage: StorageLike | null = defaultStorage(),
): Promise<PackagedUserPreferences> {
  const entries: UserPreferenceEntry[] = [];
  if (!storage) return { entries };
  for (const key of USER_PREFERENCE_KEYS) {
    if (key === 'jieyu.aiChat.settings') continue; // 下面单独从 vault 取 | filled from vault below
    const raw = storage.getItem(key);
    if (raw === null || raw.length > MAX_VALUE_CHARS) continue;
    entries.push({ key, value: scrubValue(raw) });
  }
  try {
    const settings = await loadAiChatSettingsFromStorage();
    const packed = packAiChatSettingsForBackup(settings);
    const value = JSON.stringify(packed);
    if (value.length <= MAX_VALUE_CHARS && Object.keys(packed).length > 0) {
      entries.push({ key: 'jieyu.aiChat.settings', value });
    }
  } catch {
    // vault 读失败时跳过 AI 设置，其他偏好照常 | skip AI settings if vault fails
  }
  return { entries };
}

/**
 * 读入包里的偏好：只认白名单里的键，值必须是字符串；其他键忽略并列出。
 * Read packaged preferences: allow-listed keys with string values only; others are ignored and listed.
 */
export function readPackagedUserPreferences(raw: unknown): {
  entries: UserPreferenceEntry[];
  ignoredKeys: string[];
} {
  const entries: UserPreferenceEntry[] = [];
  const ignoredKeys: string[] = [];
  const list = isPlainObject(raw) && Array.isArray(raw.entries) ? raw.entries : [];
  const seen = new Set<string>();
  for (const item of list) {
    const key = isPlainObject(item) && typeof item.key === 'string' ? item.key : null;
    const value = isPlainObject(item) && typeof item.value === 'string' ? item.value : null;
    if (key === null) continue;
    if (!ALLOWED.has(key) || value === null || value.length > MAX_VALUE_CHARS || seen.has(key)) {
      ignoredKeys.push(key);
      continue;
    }
    seen.add(key);
    entries.push({ key, value: scrubValue(value) });
  }
  return { entries, ignoredKeys: [...new Set(ignoredKeys)].sort() };
}

/** 本机这些键的当前值（null = 不存在），写回前存进整库快照 | Current local values, kept in the snapshot */
export function readCurrentUserPreferences(
  keys: readonly string[],
  storage: StorageLike | null = defaultStorage(),
): Array<{ key: string; value: string | null }> {
  return keys.map((key) => ({ key, value: storage?.getItem(key) ?? null }));
}

function sameEndpoints(local: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  return [...new Set([...Object.keys(local), ...Object.keys(incoming)])]
    .filter((field) => ENDPOINT_FIELD_RE.test(field))
    .every((field) => JSON.stringify(local[field]) === JSON.stringify(incoming[field]));
}

/**
 * 写回偏好；服务地址类字段与本机完全相同时，才保留本机同名 JSON 值里的密钥字段（REV5-N1：
 * 密钥不能跟着包里给的新地址走）。返回写入的键。
 * Write preferences back. Local secret fields under the same key are kept only when every URL-like
 * field matches the local value (REV5-N1: a key must never follow a packaged address).
 */
export function applyUserPreferences(
  entries: readonly UserPreferenceEntry[],
  storage: StorageLike | null = defaultStorage(),
): string[] {
  if (!storage) return [];
  const applied: string[] = [];
  for (const { key, value } of entries) {
    if (!ALLOWED.has(key)) continue;
    let next = value;
    const local = storage.getItem(key);
    if (local !== null) {
      try {
        const localParsed = JSON.parse(local) as unknown;
        const incoming = JSON.parse(value) as unknown;
        if (
          isPlainObject(localParsed) &&
          isPlainObject(incoming) &&
          sameEndpoints(localParsed, incoming)
        ) {
          const secrets = Object.fromEntries(
            Object.entries(localParsed).filter(([field]) => SECRET_FIELD_RE.test(field)),
          );
          next = JSON.stringify({ ...incoming, ...secrets });
        }
      } catch {
        // 非 JSON：直接写 | not JSON: write as is
      }
    }
    storage.setItem(key, next);
    applied.push(key);
  }
  return applied;
}

/**
 * 把偏好写回快照里记下的原值（null = 原来没有，删掉）；返回写过的键。只用于从整库快照恢复。
 * Put preferences back to the raw values a snapshot recorded (null = absent, removed); returns the
 * keys touched. Only used when restoring a library snapshot.
 */
export function restoreRecordedUserPreferences(
  recorded: ReadonlyArray<{ key: string; value: string | null }>,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = defaultStorage(),
): string[] {
  if (!storage) return [];
  const allowed = new Set(USER_PREFERENCE_KEYS);
  const touched: string[] = [];
  for (const { key, value } of recorded) {
    if (!allowed.has(key)) continue;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    touched.push(key);
  }
  return touched;
}
