/**
 * 审计日志与变更时间线服务 | Audit log & change timeline service
 *
 * 查询 project_changes 表，提供变更时间线、筛选与分页。
 * Queries project_changes table for change timeline, filtering, and pagination.
 */
import { getSupabaseBrowserClient } from '../../integrations/supabase/client';
import type {
  CollaborationProjectChangeRecord,
  ProjectChangePayload,
  ProjectEntityType,
  ProjectChangeOperation,
} from './syncTypes';

// ── 输入类型 | Input types ──

export interface QueryChangeTimelineInput {
  projectId: string;
  /** 按实体类型筛选 | Filter by entity type */
  entityType?: ProjectEntityType;
  /** 按操作类型筛选 | Filter by operation type */
  opType?: ProjectChangeOperation;
  /** 按操作者筛选 | Filter by actor */
  actorId?: string;
  /** 按实体 ID 筛选 | Filter by entity ID */
  entityId?: string;
  /** 起始时间（ISO 字符串）| Since timestamp (ISO string) */
  since?: string;
  /** 截止时间（ISO 字符串）| Until timestamp (ISO string) */
  until?: string;
  /** 起始 revision（含）| Minimum project revision (inclusive) */
  sinceRevision?: number;
  limit?: number;
  offset?: number;
}

export interface ChangeTimelineResult {
  changes: CollaborationProjectChangeRecord[];
  total: number | null;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

// ── 服务 | Service ──

export class CollaborationAuditLogService {
  /**
   * 查询项目变更时间线 | Query change timeline for a project
   */
  async queryTimeline(input: QueryChangeTimelineInput): Promise<ChangeTimelineResult> {
    const client = getSupabaseBrowserClient();
    let query = client
      .from('project_changes')
      .select('*', { count: 'exact' })
      .eq('project_id', input.projectId)
      .order('project_revision', { ascending: false });

    if (input.entityType) {
      query = query.eq('entity_type', input.entityType);
    }
    if (input.opType) {
      query = query.eq('op_type', input.opType);
    }
    if (input.actorId) {
      query = query.eq('actor_id', input.actorId);
    }
    if (input.entityId) {
      query = query.eq('entity_id', input.entityId);
    }
    if (input.since) {
      query = query.gte('created_at', input.since);
    }
    if (input.until) {
      query = query.lte('created_at', input.until);
    }
    if (input.sinceRevision !== undefined) {
      query = query.gte('project_revision', input.sinceRevision);
    }

    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      changes: (data ?? []).map(mapChangeRow),
      total: count,
    };
  }

  /**
   * 查询单个实体的变更历史 | Query change history for a single entity
   */
  async queryEntityHistory(
    projectId: string,
    entityId: string,
    limit = 50,
    entityType?: ProjectEntityType,
  ): Promise<CollaborationProjectChangeRecord[]> {
    const result = await this.queryTimeline({
      projectId,
      entityId,
      limit,
      ...(entityType !== undefined && { entityType }),
    });
    return result.changes;
  }
}

// ── 行映射 | Row mapper ──

function mapChangeRow(row: Record<string, unknown>): CollaborationProjectChangeRecord {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    actorId: row.actor_id as string,
    clientId: row.client_id as string,
    clientOpId: row.client_op_id as string,
    ...(row.session_id ? { sessionId: row.session_id as string } : {}),
    protocolVersion: row.protocol_version as number,
    projectRevision: row.project_revision as number,
    baseRevision: row.base_revision as number,
    entityType: row.entity_type as ProjectEntityType,
    entityId: row.entity_id as string,
    opType: row.op_type as ProjectChangeOperation,
    ...(row.payload !== undefined && row.payload !== null
      ? { payload: row.payload as ProjectChangePayload }
      : {}),
    ...(row.payload_ref_path ? { payloadRefPath: row.payload_ref_path as string } : {}),
    ...(row.vector_clock && typeof row.vector_clock === 'object'
      ? { vectorClock: row.vector_clock as Record<string, number> }
      : {}),
    sourceKind: row.source_kind as CollaborationProjectChangeRecord['sourceKind'],
    createdAt: row.created_at as string,
  };
}
