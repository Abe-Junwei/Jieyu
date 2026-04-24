/**
 * Shared validation + mapping for `project_changes` rows (Realtime INSERT payload.new
 * and PostgREST select rows). Keeps audit timeline replay aligned with inbound Realtime.
 */
import { createLogger } from '../../observability/logger';
import type {
  CollaborationProjectChangeRecord,
  ProjectChangeOperation,
  ProjectChangePayload,
  ProjectChangeSourceKind,
  ProjectEntityType,
} from './syncTypes';

const log = createLogger('projectChangeRowParse');

function rowPreview(row: unknown): string {
  try {
    if (row && typeof row === 'object') return JSON.stringify(row).slice(0, 400);
    return String(row).slice(0, 200);
  } catch {
    return '[unserializable]';
  }
}

function invalidRow(reason: string, row: unknown): null {
  const preview = rowPreview(row);
  log.warn('dropped invalid project_changes row', { reason, rowPreview: preview });
  if (import.meta.env.PROD) {
    void import('@sentry/react')
      .then((Sentry) => {
        Sentry.captureMessage('project_changes row dropped (parse)', {
          level: 'warning',
          tags: { jieyu_module: 'projectChangeRowParse' },
          extra: { reason, rowPreview: preview },
        });
      })
      .catch(() => { /* Sentry 未安装或 DSN 关闭 | Sentry absent */ });
  }
  return null;
}

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

/**
 * Parse a `project_changes` row (snake_case keys). Returns null if required fields
 * or enum values are invalid — callers should skip invalid rows instead of casting.
 */
export function parsePostgresProjectChangeRow(row: unknown): CollaborationProjectChangeRecord | null {
  if (!row || typeof row !== 'object') return invalidRow('not-a-record', row);
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
    return invalidRow('missing-or-invalid-required-field', row);
  }

  if (!VALID_ENTITY_TYPES.has(entityType)) return invalidRow('invalid-entity-type', row);
  if (!VALID_OP_TYPES.has(opType)) return invalidRow('invalid-op-type', row);
  if (!VALID_SOURCE_KINDS.has(sourceKind)) return invalidRow('invalid-source-kind', row);

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
