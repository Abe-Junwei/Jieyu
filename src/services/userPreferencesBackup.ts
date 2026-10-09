/**
 * JYB 里的用户偏好（rev5 7.5“单独的 settings 条目”；用户决定 2026-10-09：用户偏好进 JYB）。
 * User preferences inside a JYB (rev5 7.5 "separate settings entry"; user decision 2026-10-09).
 *
 * - 只收白名单里的 localStorage 键：界面、语言、播放与波形、AI 参数。凭据、会话、协作状态、缓存、
 *   日志一律不收；值是 JSON 对象时，再去掉名字像密钥的字段（apiKey、token、secret…）。
 * - 只在整库还原时、用户勾选后才写回（逐项目导入不导入）；写回时保留本机同名键里的密钥字段。
 * - Only allow-listed localStorage keys (UI, locale, playback / waveform, AI parameters). Credentials,
 *   sessions, collaboration state, caches and logs are never collected; JSON object values are
 *   additionally scrubbed of secret-looking fields. Restored only by a disaster restore the user
 *   opted into; local secret fields under the same key are kept.
 */

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
  'jieyu.embeddingProvider',
  'jieyu.acoustic.routingStrategy',
  'jieyu.voice.region',
  'jieyu.voice.intent.aliases',
  'jieyu.voiceAgent.localWhisper',
  'jieyu.voiceAgent.sttEnhancement',
];

const ALLOWED = new Set(USER_PREFERENCE_KEYS);
/** 单个值的上限 | Per-value size limit */
const MAX_VALUE_CHARS = 256 * 1024;

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

/** 去掉 JSON 值里的密钥字段；非 JSON 原样返回 | Strip secret fields from a JSON value */
function scrubValue(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed) || Array.isArray(parsed)) {
      return JSON.stringify(scrubSecrets(parsed));
    }
  } catch {
    // 非 JSON：原样 | not JSON: as is
  }
  return raw;
}

/** 收集本机偏好（白名单、去密钥）| Collect local preferences (allow-listed, scrubbed) */
export function collectUserPreferences(
  storage: StorageLike | null = defaultStorage(),
): PackagedUserPreferences {
  const entries: UserPreferenceEntry[] = [];
  if (!storage) return { entries };
  for (const key of USER_PREFERENCE_KEYS) {
    const raw = storage.getItem(key);
    if (raw === null || raw.length > MAX_VALUE_CHARS) continue;
    entries.push({ key, value: scrubValue(raw) });
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

/**
 * 写回偏好；本机同名 JSON 值里的密钥字段保留。返回写入的键。
 * Write preferences back, keeping secret fields of the local JSON value under the same key.
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
        if (isPlainObject(localParsed) && isPlainObject(incoming)) {
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
