import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './collaborationSupabaseFacade';
import { subscribeRealtimeChannel } from './realtimeSubscription';
import { CollaborationInboundApplier } from './CollaborationInboundApplier';
import { CollaborationOutboundQueue } from './CollaborationOutboundQueue';
import {
  CollaborationAssetService,
  type ListAssetsInput,
  type RegisterAssetInput,
} from './CollaborationAssetService';
import {
  CollaborationSnapshotService,
  type CreateSnapshotVersionInput,
  type ListSnapshotsInput,
} from './CollaborationSnapshotService';
import {
  CollaborationAuditLogService,
  type ChangeTimelineResult,
  type QueryChangeTimelineInput,
} from './CollaborationAuditLogService';
import {
  loadProjectPendingOutboundChanges,
  saveProjectPendingOutboundChanges,
} from './CollaborationClientStateStore';
import type {
  CollaborationAssetRecord,
  CollaborationProjectChangeRecord,
  CollaborationProjectSnapshotRecord,
  ProjectChangeOperation,
  ProjectChangePayload,
  ProjectChangeSourceKind,
  ProjectEntityType,
} from './syncTypes';

export interface CollaborationSyncBridgeOptions {
  projectId: string;
  onApplyRemoteChange: (change: CollaborationProjectChangeRecord) => Promise<void>;
  onSendLocalChanges: (changes: CollaborationProjectChangeRecord[]) => Promise<void>;
  onError?: (error: unknown, context: string) => void;
  /** 出站队列长度变化（含持久化恢复的待发送批次）| Pending outbound batch size changes */
  onOutboundPendingSizeChanged?: (pendingCount: number) => void;
  /**
   * 覆盖出站初始队列（默认从 CollaborationClientStateStore 读取）。
   * 协议禁止写云时应传 []，避免把持久化 pending 读入内存后又被「抑制发送」静默丢弃。
   */
  initialOutboundPending?: CollaborationProjectChangeRecord[];
  flushIntervalMs?: number;
  maxBatchSize?: number;
  channelPrefix?: string;
  subscribeTimeoutMs?: number;
}

export type RegisterProjectAssetInput = Omit<RegisterAssetInput, 'projectId'>;
export type ListProjectAssetsInput = Omit<ListAssetsInput, 'projectId'>;
export type CreateProjectSnapshotInput = Omit<CreateSnapshotVersionInput, 'projectId'>;
export type ListProjectSnapshotsInput = Omit<ListSnapshotsInput, 'projectId'>;
export type QueryProjectTimelineInput = Omit<QueryChangeTimelineInput, 'projectId'>;

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// 允许的枚举值白名单 | Allowed enum value sets for runtime validation
const VALID_ENTITY_TYPES: ReadonlySet<string> = new Set<ProjectEntityType>([
  'text', 'layer', 'layer_unit', 'layer_unit_content',
  'unit_relation', 'asset', 'comment',
]);
const VALID_OP_TYPES: ReadonlySet<string> = new Set<ProjectChangeOperation>([
  'upsert_text', 'upsert_layer', 'upsert_unit', 'upsert_unit_content',
  'upsert_relation', 'delete_entity', 'batch_patch',
  'asset_attached', 'comment_added',
]);
const VALID_SOURCE_KINDS: ReadonlySet<string> = new Set<ProjectChangeSourceKind>([
  'user', 'sync', 'migration',
]);

function parseRealtimeChangeRow(row: unknown): CollaborationProjectChangeRecord | null {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;

  const id = toStringValue(source.id);
  const projectId = toStringValue(source.project_id);
  const actorId = toStringValue(source.actor_id);
  const clientId = toStringValue(source.client_id);
  const clientOpId = toStringValue(source.client_op_id);
  const protocolVersion = toNumberValue(source.protocol_version);
  const projectRevision = toNumberValue(source.project_revision);
  const baseRevision = toNumberValue(source.base_revision);
  const entityType = toStringValue(source.entity_type);
  const entityId = toStringValue(source.entity_id);
  const opType = toStringValue(source.op_type);
  const sourceKind = toStringValue(source.source_kind);
  const createdAt = toStringValue(source.created_at);

  if (
    !id
    || !projectId
    || !actorId
    || !clientId
    || !clientOpId
    || protocolVersion === null
    || projectRevision === null
    || baseRevision === null
    || !entityType
    || !entityId
    || !opType
    || !sourceKind
    || !createdAt
  ) {
    return null;
  }

  // 校验枚举字段 | Validate enum fields against known values
  if (!VALID_ENTITY_TYPES.has(entityType)) return null;
  if (!VALID_OP_TYPES.has(opType)) return null;
  if (!VALID_SOURCE_KINDS.has(sourceKind)) return null;

  const sessionId = toStringValue(source.session_id);
  const payloadRefPath = toStringValue(source.payload_ref_path);

  return {
    id,
    projectId,
    actorId,
    clientId,
    clientOpId,
    ...(sessionId ? { sessionId } : {}),
    protocolVersion,
    projectRevision,
    baseRevision,
    entityType: entityType as ProjectEntityType,
    entityId,
    opType: opType as ProjectChangeOperation,
    ...(source.payload !== undefined && source.payload !== null
      ? { payload: source.payload as ProjectChangePayload }
      : {}),
    ...(payloadRefPath ? { payloadRefPath } : {}),
    ...(source.vector_clock && typeof source.vector_clock === 'object'
      ? { vectorClock: source.vector_clock as Record<string, number> }
      : {}),
    sourceKind: sourceKind as ProjectChangeSourceKind,
    createdAt,
  };
}

export class CollaborationSyncBridge {
  private readonly inbound: CollaborationInboundApplier;
  private readonly outbound: CollaborationOutboundQueue;
  private readonly assetService = new CollaborationAssetService();
  private readonly snapshotService = new CollaborationSnapshotService();
  private readonly auditLogService = new CollaborationAuditLogService();
  private channel: RealtimeChannel | null = null;
  private started = false;

  constructor(private readonly options: CollaborationSyncBridgeOptions) {
    this.inbound = new CollaborationInboundApplier({
      applier: options.onApplyRemoteChange,
    });
    const initialPendingChanges = options.initialOutboundPending
      ?? loadProjectPendingOutboundChanges(options.projectId);
    this.outbound = new CollaborationOutboundQueue({
      sender: options.onSendLocalChanges,
      initialPending: initialPendingChanges,
      onPendingChanged: (pending) => {
        saveProjectPendingOutboundChanges(options.projectId, pending);
        options.onOutboundPendingSizeChanged?.(pending.length);
      },
      ...(options.flushIntervalMs !== undefined ? { flushIntervalMs: options.flushIntervalMs } : {}),
      ...(options.maxBatchSize !== undefined ? { maxBatchSize: options.maxBatchSize } : {}),
    });
  }

  async start(): Promise<void> {
    if (this.started) return;

    const client = getSupabaseBrowserClient();
    const prefix = this.options.channelPrefix ?? 'project';
    const channel = client.channel(`${prefix}:${this.options.projectId}:changes`);

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'project_changes',
        filter: `project_id=eq.${this.options.projectId}`,
      },
      (payload) => {
        const change = parseRealtimeChangeRow(payload.new);
        if (!change) return;
        this.inbound.apply(change).catch((error) => {
          this.options.onError?.(error, `inbound apply entityId=${change.entityId}`);
        });
      },
    );

    await subscribeRealtimeChannel(channel, {
      channelLabel: 'Change channel',
      ...(this.options.subscribeTimeoutMs !== undefined ? { timeoutMs: this.options.subscribeTimeoutMs } : {}),
    });

    this.channel = channel;
    this.outbound.start();
    this.started = true;
    this.options.onOutboundPendingSizeChanged?.(this.outbound.size());
  }

  async stop(): Promise<void> {
    this.outbound.stop();
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
    this.started = false;
    this.options.onOutboundPendingSizeChanged?.(this.outbound.size());
  }

  enqueueLocalChange(change: CollaborationProjectChangeRecord): void {
    this.outbound.enqueue(change);
  }

  async applyRemoteChanges(changes: CollaborationProjectChangeRecord[]): Promise<void> {
    await this.inbound.applyMany(changes);
  }

  async flushLocalChanges(): Promise<void> {
    await this.outbound.flush();
  }

  pendingLocalChangeCount(): number {
    return this.outbound.size();
  }

  /**
   * 注册项目资产（主路径接入） | Register project asset on collaboration main path
   */
  async registerProjectAsset(input: RegisterProjectAssetInput): Promise<CollaborationAssetRecord> {
    return this.assetService.register({
      projectId: this.options.projectId,
      ...input,
    });
  }

  /**
   * 查询项目资产列表 | List project assets
   */
  async listProjectAssets(input: ListProjectAssetsInput = {}): Promise<CollaborationAssetRecord[]> {
    return this.assetService.list({
      projectId: this.options.projectId,
      ...input,
    });
  }

  /**
   * 删除项目资产 | Remove project asset
   */
  async removeProjectAsset(assetId: string): Promise<void> {
    await this.assetService.remove(assetId);
  }

  /**
   * 获取项目资产签名下载地址 | Get signed URL for project asset
   */
  async getProjectAssetSignedUrl(
    asset: Pick<CollaborationAssetRecord, 'storageBucket' | 'storagePath'>,
    expiresInSeconds = 30 * 60,
  ): Promise<string> {
    return this.assetService.getSignedUrl(asset, expiresInSeconds);
  }

  /**
   * 创建项目快照版本（上传+落表） | Create project snapshot version (upload + metadata)
   */
  async createProjectSnapshot(input: CreateProjectSnapshotInput): Promise<CollaborationProjectSnapshotRecord> {
    return this.snapshotService.createSnapshotVersion({
      projectId: this.options.projectId,
      ...input,
    });
  }

  /**
   * 列出项目快照历史 | List project snapshot history
   */
  async listProjectSnapshots(input: ListProjectSnapshotsInput = {}): Promise<CollaborationProjectSnapshotRecord[]> {
    return this.snapshotService.listSnapshots({
      projectId: this.options.projectId,
      ...input,
    });
  }

  /**
   * 按快照 ID 恢复正文 | Restore snapshot payload by id
   */
  async restoreProjectSnapshotById(
    snapshotId: string,
  ): Promise<{ record: CollaborationProjectSnapshotRecord; payloadJson: string }> {
    return this.snapshotService.downloadSnapshotById(snapshotId);
  }

  /**
   * 查询项目变更时间线 | Query project change timeline
   */
  async queryProjectChangeTimeline(input: QueryProjectTimelineInput = {}): Promise<ChangeTimelineResult> {
    return this.auditLogService.queryTimeline({
      projectId: this.options.projectId,
      ...input,
    });
  }

  /**
   * 查询单实体变更历史 | Query single-entity change history
   */
  async queryProjectEntityHistory(
    entityId: string,
    limit = 50,
    entityType?: ProjectEntityType,
  ): Promise<CollaborationProjectChangeRecord[]> {
    return this.auditLogService.queryEntityHistory(this.options.projectId, entityId, limit, entityType);
  }
}
