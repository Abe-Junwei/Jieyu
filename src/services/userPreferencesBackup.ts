/**
 * JYB 里的用户偏好（rev5 7.5“单独的 settings 条目”；用户决定 2026-10-09：用户偏好进 JYB）。
 * User preferences inside a JYB (rev5 7.5 "separate settings entry"; user decision 2026-10-09).
 *
 * - 只收白名单里的 localStorage 键：界面、语言、播放与波形、AI 参数。凭据、会话、协作状态、缓存、
 *   日志一律不收。
 * - 带服务地址的键（向量服务、本地 Whisper、语音增强）不收（REV5-N1）。
 * - AI 聊天设置（REV5-N2 / R2-5/6/7）：从未配置过就不打包；打包与恢复都只过类型化白名单字段，
 *   不靠字段名启发式；恢复时合进 vault，本机密钥与地址不动。
 * - AI chat settings (REV5-N2 / R2-5/6/7): never pack defaults; pack and restore only typed
 *   allow-listed fields (no field-name heuristics); restore merges into the vault so local secrets
 *   and URLs stay put.
 * - 其他偏好值若是 JSON，再按名字去掉像密钥或地址的嵌套字段（防御）。
 * - 只在整库还原时、用户勾选后才写回。
 */

import {
  loadAiChatSettingsFromStorage,
  persistAiChatSettings,
} from '../ai/config/aiChatSettingsStorage';
import { browserAiChatKeyVault } from '../ai/config/keyVault';
import { normalizeAiChatSettings, type AiChatSettings } from '../ai/providers/providerCatalog';

/** 进 JYB 的偏好键（白名单）| Preference keys a JYB carries (allow-list) */
export const USER_PREFERENCE_KEYS: readonly string[] = [
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
  'jieyu.settings.backupReminderEnabled',
  'jieyu.settings.dbIntegrityProbeEnabled',
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
const MAX_VALUE_CHARS = 256 * 1024;

/** 嵌套 JSON 里按名字丢掉的字段（非 AI 偏好的防御）| Nested JSON fields dropped by name (non-AI prefs only) */
const NESTED_SECRET_OR_URL_RE =
  /(api[-_]?keys?|secret|password|passphrase|credential|authorization|bearer|access[-_]?token|refresh[-_]?token|session[-_]?token|^token$|url|endpoint|host|origin|server)/i;

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

function scrubNestedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubNestedFields);
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (NESTED_SECRET_OR_URL_RE.test(key)) continue;
    next[key] = scrubNestedFields(inner);
  }
  return next;
}

/** AI 聊天设置里可进 JYB 的非敏感字段（类型化白名单，R2-7）| Typed allow-list of AI chat fields (R2-7) */
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
] as const satisfies ReadonlyArray<keyof AiChatSettings>;

/** 从完整设置抽出可备份字段（REV5-N2）| Pick backup-safe fields from full settings (REV5-N2) */
export function packAiChatSettingsForBackup(settings: AiChatSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of AI_CHAT_SAFE_FIELDS) {
    const value = settings[field];
    if (value !== undefined) out[field] = value;
  }
  return out;
}

function scrubValue(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed) || Array.isArray(parsed)) {
      return JSON.stringify(scrubNestedFields(parsed));
    }
  } catch {
    // 非 JSON：原样 | not JSON: as is
  }
  return raw;
}

function isDefaultAiChatPack(packed: Record<string, unknown>): boolean {
  return (
    JSON.stringify(packed) ===
    JSON.stringify(packAiChatSettingsForBackup(normalizeAiChatSettings()))
  );
}

/**
 * 收集本机偏好（白名单；AI 从未配置就不打包，R2-6；AI 只过类型化白名单，R2-7）。
 * Collect local preferences (allow-listed; skip never-configured AI, R2-6; typed AI fields, R2-7).
 */
export async function collectUserPreferences(
  storage: StorageLike | null = defaultStorage(),
): Promise<PackagedUserPreferences> {
  const entries: UserPreferenceEntry[] = [];
  if (!storage) return { entries };
  for (const key of USER_PREFERENCE_KEYS) {
    if (key === 'jieyu.aiChat.settings') continue;
    const raw = storage.getItem(key);
    if (raw === null || raw.length > MAX_VALUE_CHARS) continue;
    entries.push({ key, value: scrubValue(raw) });
  }
  try {
    // vault.load() 为 null 且明文键也不在 = 从未配置（R2-6）| null vault and no plain key = never configured
    const fromVault = await browserAiChatKeyVault.load();
    const plain = storage.getItem('jieyu.aiChat.settings');
    if (fromVault === null && plain === null) return { entries };
    const settings = fromVault ?? (await loadAiChatSettingsFromStorage());
    const packed = packAiChatSettingsForBackup(settings);
    if (isDefaultAiChatPack(packed)) return { entries };
    const value = JSON.stringify(packed);
    if (value.length <= MAX_VALUE_CHARS && Object.keys(packed).length > 0) {
      entries.push({ key: 'jieyu.aiChat.settings', value });
    }
  } catch {
    // vault 读失败时跳过 AI 设置 | skip AI settings if vault fails
  }
  return { entries };
}

/**
 * 读入包里的偏好：只认白名单里的键；AI 设置再过类型化字段白名单。
 * Read packaged preferences: allow-listed keys; AI settings re-filtered to typed fields.
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
    if (key === 'jieyu.aiChat.settings') {
      try {
        const parsed = JSON.parse(value) as unknown;
        const packed = isPlainObject(parsed)
          ? packAiChatSettingsForBackup(parsed as unknown as AiChatSettings)
          : {};
        entries.push({ key, value: JSON.stringify(packed) });
      } catch {
        ignoredKeys.push(key);
      }
      continue;
    }
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

/**
 * 写回偏好。AI 设置合进 vault（R2-5）：只应用类型化白名单字段，本机密钥与地址保留。
 * Write preferences back. AI settings merge into the vault (R2-5): only typed allow-listed fields
 * apply; local secrets and URLs stay put.
 */
export async function applyUserPreferences(
  entries: readonly UserPreferenceEntry[],
  storage: StorageLike | null = defaultStorage(),
): Promise<string[]> {
  if (!storage) return [];
  const applied: string[] = [];
  for (const { key, value } of entries) {
    if (!ALLOWED.has(key)) continue;
    if (key === 'jieyu.aiChat.settings') {
      try {
        const incoming = JSON.parse(value) as unknown;
        if (!isPlainObject(incoming)) continue;
        const current = await loadAiChatSettingsFromStorage();
        const patch: Partial<AiChatSettings> = {};
        for (const field of AI_CHAT_SAFE_FIELDS) {
          if (field in incoming) {
            (patch as Record<string, unknown>)[field] = incoming[field];
          }
        }
        await persistAiChatSettings(normalizeAiChatSettings({ ...current, ...patch }));
        applied.push(key);
      } catch {
        // 坏 JSON 或 vault 失败：跳过这一项 | bad JSON or vault failure: skip this entry
      }
      continue;
    }
    storage.setItem(key, value);
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
