/**
 * 托管协同协议类型草案 | Managed collaboration protocol type draft
 *
 * 目标：为 Supabase 托管协同定义最小可执行的协议类型，
 * 先冻结字段和约束，再接入具体同步实现。
 * Goal: define the minimum executable protocol types for Supabase-backed
 * collaboration so the field model is stable before implementation.
 */

export type CollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer';
export type ProjectVisibility = 'private' | 'team' | 'public_read';

/**
 * 实体类型 | Entity types that participate in sync
 */
export type ProjectEntityType =
  | 'text'
  | 'layer'
  | 'layer_unit'
  | 'layer_unit_content'
  | 'unit_relation'
  | 'asset'
  | 'comment';

/**
 * 协同操作类型 | Sync operation types
 */
export type ProjectChangeOperation =
  | 'upsert_text'
  | 'upsert_layer'
  | 'upsert_unit'
  | 'upsert_unit_content'
  | 'upsert_relation'
  | 'delete_entity'
  | 'batch_patch'
  | 'asset_attached'
  | 'comment_added';

/**
 * 变更来源 | Origin of a local or remote write
 */
export type ProjectChangeSourceKind = 'user' | 'sync' | 'migration';

/**
 * 协议守卫 | Protocol guard information stored on project root
 */
export interface ProjectProtocolGuard {
  protocolVersion: number;
  schemaVersion: number;
  appMinVersion: string;
}

/**
 * 项目根记录 | Root collaboration project record
 */
export interface CollaborationProjectRecord extends ProjectProtocolGuard {
  id: string;
  name: string;
  ownerId: string;
  visibility: ProjectVisibility;
  latestSnapshotId?: string;
  latestRevision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

/**
 * 项目成员记录 | Project member record
 */
export interface CollaborationProjectMemberRecord {
  projectId: string;
  userId: string;
  role: CollaborationRole;
  invitedBy?: string;
  joinedAt: string;
  disabledAt?: string;
}

/**
 * 快照元数据 | Snapshot metadata only, body lives in object storage
 */
export interface CollaborationProjectSnapshotRecord {
  id: string;
  projectId: string;
  version: number;
  schemaVersion: number;
  createdBy: string;
  snapshotStorageBucket: string;
  snapshotStoragePath: string;
  checksum: string;
  sizeBytes: number;
  changeCursor: number;
  note?: string;
  createdAt: string;
}

/**
 * 版本向量 | Vector clock for cross-device conflict analysis
 */
export type ProjectVectorClock = Record<string, number>;

/**
 * 基础 payload 结构 | Base payload shape for change events
 */
export interface BaseProjectChangePayload {
  [key: string]: unknown;
  /** 轻量 patch 内容 | Lightweight patch content */
  patch?: Record<string, unknown>;
  /** 附加说明 | Human-readable note */
  note?: string;
  /** 额外元数据 | Additional metadata */
  meta?: Record<string, unknown>;
}

/**
 * 删除 payload | Delete operation payload
 */
export interface DeleteEntityPayload extends BaseProjectChangePayload {
  reason?: string;
  deleted: true;
}

/**
 * 资源引用 payload | Asset reference payload
 */
export interface AssetAttachedPayload extends BaseProjectChangePayload {
  assetId: string;
  storageBucket: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
}

/**
 * 评论 payload | Comment payload
 */
export interface CommentAddedPayload extends BaseProjectChangePayload {
  commentId: string;
  content: string;
}

/**
 * 协同 payload 联合 | Collaboration payload union
 */
export type ProjectChangePayload =
  | BaseProjectChangePayload
  | DeleteEntityPayload
  | AssetAttachedPayload
  | CommentAddedPayload;

/**
 * 项目变更事件 | Project change event stored in cloud log
 */
export interface CollaborationProjectChangeRecord<TPayload = ProjectChangePayload> {
  id: string;
  projectId: string;
  actorId: string;
  clientId: string;
  clientOpId: string;
  sessionId?: string;
  protocolVersion: number;
  projectRevision: number;
  baseRevision: number;
  entityType: ProjectEntityType;
  entityId: string;
  opType: ProjectChangeOperation;
  payload?: TPayload;
  payloadRefPath?: string;
  vectorClock?: ProjectVectorClock;
  sourceKind: ProjectChangeSourceKind;
  createdAt: string;
}

/**
 * 在线状态记录 | Persisted low-frequency presence record
 */
export interface CollaborationPresenceRecord {
  projectId: string;
  userId: string;
  displayName?: string;
  state: 'online' | 'idle' | 'offline';
  focusedEntityType?: ProjectEntityType;
  focusedEntityId?: string;
  cursorPayload?: Record<string, unknown>;
  lastSeenAt: string;
}

/**
 * 附件索引记录 | Asset index record
 */
export interface CollaborationAssetRecord {
  id: string;
  projectId: string;
  assetType: 'audio' | 'export' | 'attachment';
  storageBucket: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes: number;
  checksum?: string;
  uploadedBy: string;
  createdAt: string;
}

/**
 * 单条 payload 软上限（字节） | Soft byte limit for inline payloads
 */
export const CHANGE_PAYLOAD_SOFT_LIMIT_BYTES = 32 * 1024;

/**
 * 判断是否应降级为外部引用 | Decide whether payload should move to object storage
 */
export function shouldUsePayloadRef(payloadBytes: number): boolean {
  return Number.isFinite(payloadBytes) && payloadBytes > CHANGE_PAYLOAD_SOFT_LIMIT_BYTES;
}

/**
 * 是否是评论专属操作 | Whether the op is comment-only
 */
export function isCommentOnlyOperation(op: ProjectChangeOperation): boolean {
  return op === 'comment_added';
}

/**
 * 是否属于远端/迁移写入 | Whether the change originates from sync or migration
 */
export function shouldSuppressOutboundEcho(sourceKind: ProjectChangeSourceKind): boolean {
  return sourceKind === 'sync' || sourceKind === 'migration';
}

/**
 * 比较两个变更顺序 | Compare two changes by deterministic replay order
 */
export function compareProjectChangeOrder(
  left: Pick<CollaborationProjectChangeRecord, 'projectRevision' | 'createdAt' | 'clientOpId'>,
  right: Pick<CollaborationProjectChangeRecord, 'projectRevision' | 'createdAt' | 'clientOpId'>,
): number {
  if (left.projectRevision !== right.projectRevision) {
    return left.projectRevision - right.projectRevision;
  }
  const timeDelta = left.createdAt.localeCompare(right.createdAt);
  if (timeDelta !== 0) return timeDelta;
  return left.clientOpId.localeCompare(right.clientOpId);
}
