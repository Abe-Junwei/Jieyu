/**
 * 存储耐久性（方案 6.2 / T44）：在用户第一次导入或保存时伴随手势申请 persist，记录结果；
 * 读取 `estimate()` 与 `persisted()` 供诊断面板显示。
 * Storage durability (plan 6.2 / T44): request persist() alongside the user's first import or save
 * gesture and record the outcome; read `estimate()` / `persisted()` for the diagnostics panel.
 */

export type PersistTrigger = 'startup' | 'import' | 'save' | 'manual';
export type PersistOutcome = 'granted' | 'denied' | 'unsupported' | 'error';

export type PersistRecord = {
  outcome: PersistOutcome;
  trigger: PersistTrigger;
  /** ISO 时间 | ISO timestamp */
  at: string;
  error?: string;
};

export type StorageDiagnostics = {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
  lastPersistRequest: PersistRecord | null;
};

export const PERSIST_RECORD_KEY = 'jieyu.storage.persistRequest.v1';
export const STORAGE_DURABILITY_EVENT = 'jieyu:storage-durability-changed';

function storageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.storage ?? null;
}

export function readPersistRecord(): PersistRecord | null {
  try {
    const raw = globalThis.localStorage?.getItem(PERSIST_RECORD_KEY);
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = JSON.parse(raw) as PersistRecord | null;
    return parsed !== null &&
      typeof parsed.outcome === 'string' &&
      typeof parsed.trigger === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writePersistRecord(record: PersistRecord): void {
  try {
    globalThis.localStorage?.setItem(PERSIST_RECORD_KEY, JSON.stringify(record));
  } catch {
    // 记录失败不影响主流程 | Recording failure must not affect the caller
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORAGE_DURABILITY_EVENT));
  }
}

async function runPersist(trigger: PersistTrigger): Promise<PersistRecord> {
  const manager = storageManager();
  const at = new Date().toISOString();
  if (!manager || typeof manager.persist !== 'function') {
    return { outcome: 'unsupported', trigger, at };
  }
  try {
    if (typeof manager.persisted === 'function' && (await manager.persisted())) {
      return { outcome: 'granted', trigger, at };
    }
    const granted = await manager.persist();
    return { outcome: granted ? 'granted' : 'denied', trigger, at };
  } catch (error) {
    return {
      outcome: 'error',
      trigger,
      at,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 伴随用户手势申请 persist。导入 / 保存只在第一次（或此前只有启动时的申请）真正发起；
 * `manual`（诊断面板按钮）每次都发起。结果写入本机记录。必须在手势处理函数里第一个 await 之前调用。
 * Request persist() alongside a user gesture. Import / save only request the first time (or when
 * only the startup attempt is on record); `manual` (diagnostics button) always requests. Call it
 * before the handler's first await.
 */
export function requestPersistOnGesture(
  trigger: Exclude<PersistTrigger, 'startup'>,
): Promise<PersistRecord> {
  const previous = readPersistRecord();
  if (
    trigger !== 'manual' &&
    previous !== null &&
    previous.trigger !== 'startup' &&
    previous.outcome !== 'error'
  ) {
    return Promise.resolve(previous);
  }
  return runPersist(trigger).then((record) => {
    writePersistRecord(record);
    return record;
  });
}

/**
 * 启动时的申请（无手势；Chromium 按站点参与度静默决定）。只在还没有手势申请记录时写入结果。
 * Startup attempt (no gesture; Chromium decides silently by engagement). The outcome is recorded
 * only while no gesture request is on record.
 */
export async function requestPersistAtStartup(): Promise<PersistRecord> {
  const record = await runPersist('startup');
  const previous = readPersistRecord();
  if (previous === null || previous.trigger === 'startup') writePersistRecord(record);
  return record;
}

export async function readStorageDiagnostics(): Promise<StorageDiagnostics> {
  const manager = storageManager();
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let persisted: boolean | null = null;
  if (manager && typeof manager.estimate === 'function') {
    try {
      const estimate = await manager.estimate();
      usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
      quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    } catch {
      // 保持 null，界面显示“未知” | Keep null; the UI shows "unknown"
    }
  }
  if (manager && typeof manager.persisted === 'function') {
    try {
      persisted = await manager.persisted();
    } catch {
      persisted = null;
    }
  }
  return {
    usageBytes,
    quotaBytes,
    persisted,
    lastPersistRequest: readPersistRecord(),
  };
}
