/**
 * CorpusSourceSet 完整生命周期管理
 *
 * 职责：
 * - 定义 SavedCorpusSourceSet（可保存、可复用的 source set）
 * - 提供纯函数生命周期操作：create / rename / bind / switch / invalidate / delete / export_summary
 * - 失效检测：source 被删除、media/layer/text 不匹配、source count 为 0 时标记失效
 * - 不直接操作 DB；DB 读写由调用方负责
 */

import type { CorpusSourceSet } from './sourceResolver';

export type SourceSetMemberType =
  | 'segment'
  | 'layer'
  | 'note'
  | 'document'
  | 'lexeme'
  | 'audio_region';

export interface SourceSetMember {
  id: string;
  type: SourceSetMemberType;
  label?: string;
}

export type SavedCorpusSourceSetStatus = 'active' | 'inactive' | 'invalidated';

export interface SavedCorpusSourceSet {
  /** 全局唯一标识（由调用方生成，如 crypto.randomUUID） */
  id: string;
  /** 用户可见名称 */
  name: string;
  /** 基础 scope 定义（与 sourceResolver.CorpusSourceSet 兼容） */
  scope: CorpusSourceSet['scope'];
  /** 显式列出的成员（若为空数组，则按 scope 隐式解析） */
  members: SourceSetMember[];
  /** 关联的 mediaId */
  mediaId?: string;
  /** 关联的 layerId */
  layerId?: string;
  /** 关联的 projectId */
  projectId?: string;
  /** 当前状态 */
  status: SavedCorpusSourceSetStatus;
  /** 绑定的会话 ID（session-bound source set 不污染长期记忆） */
  boundSessionId?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 失效原因（仅 status === 'invalidated' 时存在） */
  invalidationReason?: string;
}

export interface CreateSavedSourceSetInput {
  name: string;
  scope: CorpusSourceSet['scope'];
  members?: SourceSetMember[];
  mediaId?: string;
  layerId?: string;
  projectId?: string;
  boundSessionId?: string;
}

export interface SourceSetValidationResult {
  valid: boolean;
  missingMemberIds: string[];
  mismatchedMediaId?: string;
  mismatchedLayerId?: string;
  zeroSourceCount: boolean;
}

/** 生成 ISO 时间戳（供测试可注入） */
function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `css_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 创建一个新的 SavedCorpusSourceSet。
 * 默认 status 为 'active'。
 */
export function createSavedSourceSet(
  input: CreateSavedSourceSetInput,
  options?: { id?: string; timestamp?: string },
): SavedCorpusSourceSet {
  const timestamp = options?.timestamp ?? nowIso();
  return {
    id: options?.id ?? generateId(),
    name: input.name.trim(),
    scope: input.scope,
    members: input.members ?? [],
    ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
    ...(input.layerId !== undefined ? { layerId: input.layerId } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.boundSessionId !== undefined ? { boundSessionId: input.boundSessionId } : {}),
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * 重命名 source set。
 */
export function renameSavedSourceSet(
  sourceSet: SavedCorpusSourceSet,
  newName: string,
  options?: { timestamp?: string },
): SavedCorpusSourceSet {
  return {
    ...sourceSet,
    name: newName.trim(),
    updatedAt: options?.timestamp ?? nowIso(),
  };
}

/**
 * 绑定 source set 到指定会话。
 * 绑定后，该 source set 随会话生命周期存在，不进入长期存储。
 */
export function bindSourceSetToSession(
  sourceSet: SavedCorpusSourceSet,
  sessionId: string,
  options?: { timestamp?: string },
): SavedCorpusSourceSet {
  return {
    ...sourceSet,
    boundSessionId: sessionId,
    updatedAt: options?.timestamp ?? nowIso(),
  };
}

/**
 * 解除 source set 的会话绑定。
 */
export function unbindSourceSetFromSession(
  sourceSet: SavedCorpusSourceSet,
  options?: { timestamp?: string },
): SavedCorpusSourceSet {
  const next: SavedCorpusSourceSet = {
    ...sourceSet,
    updatedAt: options?.timestamp ?? nowIso(),
  };
  delete (next as unknown as Record<string, unknown>).boundSessionId;
  return next;
}

/**
 * 切换 active source set。
 * 将目标 source set 置为 'active'，其余同 boundSessionId 的置为 'inactive'。
 */
export function switchActiveSourceSet(
  sourceSets: readonly SavedCorpusSourceSet[],
  targetId: string,
  options?: { timestamp?: string },
): SavedCorpusSourceSet[] {
  const target = sourceSets.find((s) => s.id === targetId);
  if (!target) return [...sourceSets];

  const timestamp = options?.timestamp ?? nowIso();
  return sourceSets.map((s) => {
    if (s.id === targetId) {
      return { ...s, status: 'active' as const, updatedAt: timestamp };
    }
    if (s.boundSessionId === target.boundSessionId && s.status === 'active') {
      return { ...s, status: 'inactive' as const, updatedAt: timestamp };
    }
    return s;
  });
}

/**
 * 验证 source set 成员是否仍然有效。
 * @param existsChecker 回调函数，接收 member id 和 type，返回是否仍存在
 * @param mediaExistsChecker 可选回调，验证 mediaId 是否仍存在
 * @param layerExistsChecker 可选回调，验证 layerId 是否仍存在
 */
export function validateSourceSetMembers(
  sourceSet: SavedCorpusSourceSet,
  existsChecker: (id: string, type: SourceSetMemberType) => boolean,
  mediaExistsChecker?: (mediaId: string) => boolean,
  layerExistsChecker?: (layerId: string) => boolean,
): SourceSetValidationResult {
  const missingMemberIds: string[] = [];
  for (const member of sourceSet.members) {
    if (!existsChecker(member.id, member.type)) {
      missingMemberIds.push(member.id);
    }
  }

  let mismatchedMediaId: string | undefined;
  if (sourceSet.mediaId !== undefined && mediaExistsChecker !== undefined) {
    if (!mediaExistsChecker(sourceSet.mediaId)) {
      mismatchedMediaId = sourceSet.mediaId;
    }
  }

  let mismatchedLayerId: string | undefined;
  if (sourceSet.layerId !== undefined && layerExistsChecker !== undefined) {
    if (!layerExistsChecker(sourceSet.layerId)) {
      mismatchedLayerId = sourceSet.layerId;
    }
  }

  const zeroSourceCount =
    sourceSet.members.length > 0 && missingMemberIds.length === sourceSet.members.length;

  return {
    valid:
      missingMemberIds.length === 0 &&
      mismatchedMediaId === undefined &&
      mismatchedLayerId === undefined &&
      !zeroSourceCount,
    missingMemberIds,
    ...(mismatchedMediaId !== undefined ? { mismatchedMediaId } : {}),
    ...(mismatchedLayerId !== undefined ? { mismatchedLayerId } : {}),
    zeroSourceCount,
  };
}

/**
 * 对失效 source set 进行标记。
 * 要求调用方先执行 validateSourceSetMembers，再根据结果调用本函数。
 */
export function invalidateSourceSet(
  sourceSet: SavedCorpusSourceSet,
  reason: string,
  options?: { timestamp?: string },
): SavedCorpusSourceSet {
  return {
    ...sourceSet,
    status: 'invalidated',
    invalidationReason: reason,
    updatedAt: options?.timestamp ?? nowIso(),
  };
}

/**
 * 删除指定 source set。
 */
export function deleteSavedSourceSet(
  sourceSets: readonly SavedCorpusSourceSet[],
  targetId: string,
): SavedCorpusSourceSet[] {
  return sourceSets.filter((s) => s.id !== targetId);
}

/**
 * 批量检查并标记失效 source set。
 * 返回更新后的列表 + 被标记失效的 id 列表。
 */
export function pruneInvalidatedSourceSets(
  sourceSets: readonly SavedCorpusSourceSet[],
  existsChecker: (id: string, type: SourceSetMemberType) => boolean,
  mediaExistsChecker?: (mediaId: string) => boolean,
  layerExistsChecker?: (layerId: string) => boolean,
  options?: { timestamp?: string },
): {
  updated: SavedCorpusSourceSet[];
  invalidatedIds: string[];
} {
  const timestamp = options?.timestamp ?? nowIso();
  const invalidatedIds: string[] = [];
  const updated = sourceSets.map((s) => {
    const validation = validateSourceSetMembers(s, existsChecker, mediaExistsChecker, layerExistsChecker);
    if (!validation.valid && s.status !== 'invalidated') {
      const reasons: string[] = [];
      if (validation.missingMemberIds.length > 0) {
        reasons.push(`missing members: ${validation.missingMemberIds.join(', ')}`);
      }
      if (validation.mismatchedMediaId) {
        reasons.push(`media removed: ${validation.mismatchedMediaId}`);
      }
      if (validation.mismatchedLayerId) {
        reasons.push(`layer removed: ${validation.mismatchedLayerId}`);
      }
      if (validation.zeroSourceCount) {
        reasons.push('all sources removed');
      }
      invalidatedIds.push(s.id);
      return invalidateSourceSet(s, reasons.join('; '), { timestamp });
    }
    return s;
  });
  return { updated, invalidatedIds };
}

/**
 * 将 SavedCorpusSourceSet 转换为运行时 CorpusSourceSet。
 * 用于将保存的 source set 喂给 sourceResolver / RAG 流程。
 */
export function toRuntimeCorpusSourceSet(saved: SavedCorpusSourceSet): CorpusSourceSet {
  const sourceIds = saved.members.map((m) => m.id);
  const result: CorpusSourceSet = {
    scope: saved.scope,
    sourceIds,
  };
  if (saved.mediaId !== undefined) result.mediaId = saved.mediaId;
  if (saved.layerId !== undefined) result.layerId = saved.layerId;
  if (saved.projectId !== undefined) result.projectId = saved.projectId;
  return result;
}

/**
 * 从运行时 CorpusSourceSet + 成员详情构建 SavedCorpusSourceSet。
 */
export function fromRuntimeCorpusSourceSet(
  runtime: CorpusSourceSet,
  members: SourceSetMember[],
  name: string,
  options?: { id?: string; boundSessionId?: string; timestamp?: string },
): SavedCorpusSourceSet {
  let meta: { id?: string; timestamp?: string } | undefined;
  if (options?.id !== undefined || options?.timestamp !== undefined) {
    meta = {};
    if (options.id !== undefined) {
      meta.id = options.id;
    }
    if (options.timestamp !== undefined) {
      meta.timestamp = options.timestamp;
    }
  }
  return createSavedSourceSet(
    {
      name,
      scope: runtime.scope,
      members,
      ...(runtime.mediaId !== undefined ? { mediaId: runtime.mediaId } : {}),
      ...(runtime.layerId !== undefined ? { layerId: runtime.layerId } : {}),
      ...(runtime.projectId !== undefined ? { projectId: runtime.projectId } : {}),
      ...(options?.boundSessionId !== undefined ? { boundSessionId: options.boundSessionId } : {}),
    },
    meta,
  );
}

/**
 * 导出 source set 引用摘要（用于 markdown / JSON bundle 导出）。
 */
export interface SourceSetReferenceSummary {
  id: string;
  name: string;
  scope: string;
  memberCount: number;
  memberTypes: Record<string, number>;
  mediaId?: string;
  layerId?: string;
  projectId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function exportReferenceSummary(
  sourceSet: SavedCorpusSourceSet,
): SourceSetReferenceSummary {
  const memberTypes: Record<string, number> = {};
  for (const member of sourceSet.members) {
    memberTypes[member.type] = (memberTypes[member.type] ?? 0) + 1;
  }
  const summary: SourceSetReferenceSummary = {
    id: sourceSet.id,
    name: sourceSet.name,
    scope: sourceSet.scope,
    memberCount: sourceSet.members.length,
    memberTypes,
    status: sourceSet.status,
    createdAt: sourceSet.createdAt,
    updatedAt: sourceSet.updatedAt,
  };
  if (sourceSet.mediaId !== undefined) summary.mediaId = sourceSet.mediaId;
  if (sourceSet.layerId !== undefined) summary.layerId = sourceSet.layerId;
  if (sourceSet.projectId !== undefined) summary.projectId = sourceSet.projectId;
  return summary;
}

/**
 * 构建 source set 的 fallback 原因文本。
 * 当 source set 失效时，AI run 必须进入可解释 fallback，不允许静默退回全项目检索。
 */
export function buildSourceSetFallbackReason(
  sourceSet: SavedCorpusSourceSet,
): string | null {
  if (sourceSet.status !== 'invalidated') return null;
  const base = `Source set "${sourceSet.name}" (${sourceSet.id}) is invalidated`;
  const reason = sourceSet.invalidationReason ?? 'unknown reason';
  return `${base}: ${reason}. Please re-scope your query or select a different source set.`;
}
