/**
 * 本机协作记录（rev5 第 9 节、D6）| Local collaboration records (rev5 section 9, D6)
 *
 * 每个项目一条，只存在本机 localStorage，永远不发给服务器，也不进项目包或 JYB（`collab_state`）：
 * - `boundAt`：本机第一次确认云端有这个项目，也就是“协作绑定”
 * - `firstOutboundAt`：本机第一次为这个项目产生出站记录
 * - `removedLocallyAt`：用户选择“仅从本机移除”（9.1）
 * - `cloudDeletedAt`：本机看到了云端墓碑（9.2）
 * One record per project, in localStorage only; never sent to the server nor packaged.
 *
 * 读取失败（存储不可用、内容损坏）时返回 `ok: false`，调用方必须按“协作过”处理（D6）。
 * A failed read returns `ok: false`; callers must treat the project as collaborated (D6).
 */
export const COLLAB_LOCAL_PROJECT_REGISTRY_KEY = 'jieyu:collab-local-projects:v1';

export interface CollaborationLocalProjectRecord {
  boundAt?: string;
  firstOutboundAt?: string;
  removedLocallyAt?: string;
  /** 移除时的项目名，用于“已从本机移除的云端项目”列表 | Name shown in the removed list */
  removedProjectName?: string;
  cloudDeletedAt?: string;
  updatedAt: string;
}

export type CollaborationLocalProjectRegistry = Record<string, CollaborationLocalProjectRecord>;

export type CollaborationLocalRegistryReadResult =
  | { ok: true; records: CollaborationLocalProjectRegistry }
  | { ok: false; reason: 'storage-unavailable' | 'unreadable' };

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || window.localStorage === undefined) return undefined;
  return window.localStorage;
}

function optionalIso(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function sanitizeRecord(value: unknown): CollaborationLocalProjectRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const record: CollaborationLocalProjectRecord = {
    updatedAt: optionalIso(source.updatedAt) ?? new Date(0).toISOString(),
  };
  const boundAt = optionalIso(source.boundAt);
  if (boundAt !== undefined) record.boundAt = boundAt;
  const firstOutboundAt = optionalIso(source.firstOutboundAt);
  if (firstOutboundAt !== undefined) record.firstOutboundAt = firstOutboundAt;
  const removedLocallyAt = optionalIso(source.removedLocallyAt);
  if (removedLocallyAt !== undefined) record.removedLocallyAt = removedLocallyAt;
  const removedProjectName = optionalIso(source.removedProjectName);
  if (removedProjectName !== undefined) record.removedProjectName = removedProjectName;
  const cloudDeletedAt = optionalIso(source.cloudDeletedAt);
  if (cloudDeletedAt !== undefined) record.cloudDeletedAt = cloudDeletedAt;
  return record;
}

/** 读取全部记录；读不到时明确返回失败 | Read every record; failures are explicit */
export function readCollaborationLocalRegistry(
  storage: Storage | undefined = getDefaultStorage(),
): CollaborationLocalRegistryReadResult {
  if (storage === undefined) return { ok: false, reason: 'storage-unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY);
  } catch {
    return { ok: false, reason: 'storage-unavailable' };
  }
  if (raw === null || raw.length === 0) return { ok: true, records: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'unreadable' };
    }
    const records: CollaborationLocalProjectRegistry = {};
    for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (projectId.trim().length === 0) continue;
      const record = sanitizeRecord(value);
      if (record !== null) records[projectId] = record;
    }
    return { ok: true, records };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/**
 * 修改一条记录。记录损坏时不覆盖（否则会把“协作过”的证据抹掉），直接抛错。
 * Update one record. A corrupt registry is never overwritten (that would erase collaboration
 * evidence); the call throws instead.
 */
export function updateCollaborationLocalProjectRecord(
  projectId: string,
  updater: (
    existing: CollaborationLocalProjectRecord | undefined,
  ) => CollaborationLocalProjectRecord | null,
  storage: Storage | undefined = getDefaultStorage(),
): void {
  const id = projectId.trim();
  if (id.length === 0) return;
  const current = readCollaborationLocalRegistry(storage);
  if (!current.ok || storage === undefined) {
    throw new Error(
      `Collaboration local registry is ${current.ok ? 'storage-unavailable' : current.reason}`,
    );
  }
  const next = updater(current.records[id]);
  if (next === null) {
    delete current.records[id];
  } else {
    current.records[id] = { ...next, updatedAt: new Date().toISOString() };
  }
  storage.setItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY, JSON.stringify(current.records));
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 本机确认云端有这个项目（协作绑定）| This device confirmed the cloud project exists (binding) */
export function markProjectCollaborationBound(projectId: string, storage?: Storage): void {
  updateCollaborationLocalProjectRecord(
    projectId,
    (existing) => ({
      ...(existing ?? { updatedAt: nowIso() }),
      boundAt: existing?.boundAt ?? nowIso(),
    }),
    storage,
  );
}

/** 本机第一次为这个项目产生出站记录 | First outbound record for this project on this device */
export function markProjectOutboundRecorded(projectId: string, storage?: Storage): void {
  updateCollaborationLocalProjectRecord(
    projectId,
    (existing) =>
      existing?.firstOutboundAt !== undefined
        ? existing
        : { ...(existing ?? { updatedAt: nowIso() }), firstOutboundAt: nowIso() },
    storage,
  );
}

/** 9.1：仅从本机移除（永不发给服务器）| 9.1: removed from this device only (never sent) */
export function markProjectRemovedLocally(
  projectId: string,
  options: { projectName?: string } = {},
  storage?: Storage,
): void {
  updateCollaborationLocalProjectRecord(
    projectId,
    (existing) => ({
      ...(existing ?? { updatedAt: nowIso() }),
      removedLocallyAt: nowIso(),
      ...(options.projectName !== undefined && options.projectName.length > 0
        ? { removedProjectName: options.projectName }
        : {}),
    }),
    storage,
  );
}

/** 手动重新下载前清掉“已移除”标记 | Clear the removed mark before a manual re-download */
export function clearProjectRemovedLocally(projectId: string, storage?: Storage): void {
  updateCollaborationLocalProjectRecord(
    projectId,
    (existing) => {
      if (!existing) return null;
      const { removedLocallyAt: _removed, removedProjectName: _name, ...rest } = existing;
      return rest;
    },
    storage,
  );
}

/** 9.2：本机看到了云端墓碑 | 9.2: this device saw the cloud tombstone */
export function markProjectCloudDeleted(
  projectId: string,
  deletedAt: string,
  storage?: Storage,
): void {
  updateCollaborationLocalProjectRecord(
    projectId,
    (existing) => ({
      ...(existing ?? { updatedAt: nowIso() }),
      cloudDeletedAt: existing?.cloudDeletedAt ?? deletedAt,
    }),
    storage,
  );
}

/** 已从本机移除、云端没有删除的项目 | Projects removed locally whose cloud copy still exists */
export function listLocallyRemovedCloudProjects(
  storage?: Storage,
): Array<{ projectId: string; removedAt: string; projectName?: string }> {
  const registry = readCollaborationLocalRegistry(storage);
  if (!registry.ok) return [];
  return Object.entries(registry.records)
    .filter(
      ([, record]) => record.removedLocallyAt !== undefined && record.cloudDeletedAt === undefined,
    )
    .map(([projectId, record]) => ({
      projectId,
      removedAt: record.removedLocallyAt!,
      ...(record.removedProjectName !== undefined
        ? { projectName: record.removedProjectName }
        : {}),
    }))
    .sort((a, b) => b.removedAt.localeCompare(a.removedAt));
}

/**
 * 这个项目在本机是否不该再自动同步（已移除或云端已删除）。读不到记录时不阻止。
 * Whether this project must not auto-sync here (removed locally or tombstoned). Unknown = allowed.
 */
export function isProjectSyncBlockedLocally(projectId: string, storage?: Storage): boolean {
  const registry = readCollaborationLocalRegistry(storage);
  if (!registry.ok) return false;
  const record = registry.records[projectId.trim()];
  return record?.removedLocallyAt !== undefined || record?.cloudDeletedAt !== undefined;
}
