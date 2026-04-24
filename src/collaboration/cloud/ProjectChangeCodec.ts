import type {
  CollaborationProjectChangeRecord,
  ProjectChangePayload,
  ProjectChangeSourceKind,
  ProjectEntityType,
  ProjectChangeOperation,
  ProjectVectorClock,
} from './syncTypes';

export interface LocalChangeEnvelope<TPayload = ProjectChangePayload> {
  projectId: string;
  entityType: ProjectEntityType;
  entityId: string;
  opType: ProjectChangeOperation;
  payload?: TPayload;
  payloadRefPath?: string;
  baseRevision: number;
  sourceKind: ProjectChangeSourceKind;
  vectorClock?: ProjectVectorClock;
  createdAt?: string;
}

export interface ProjectChangeCodecOptions {
  protocolVersion: number;
  actorId: string;
  clientId: string;
  sessionId?: string;
}

function createClientOpId(clientId: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  return `${clientId}:${suffix}`;
}

export class ProjectChangeCodec {
  constructor(private readonly options: ProjectChangeCodecOptions) {}

  encode<TPayload = ProjectChangePayload>(
    change: LocalChangeEnvelope<TPayload>,
  ): CollaborationProjectChangeRecord<TPayload> {
    const createdAt = change.createdAt ?? new Date().toISOString();

    return {
      id: '',
      projectId: change.projectId,
      actorId: this.options.actorId,
      clientId: this.options.clientId,
      clientOpId: createClientOpId(this.options.clientId),
      ...(this.options.sessionId ? { sessionId: this.options.sessionId } : {}),
      protocolVersion: this.options.protocolVersion,
      projectRevision: 0,
      baseRevision: change.baseRevision,
      entityType: change.entityType,
      entityId: change.entityId,
      opType: change.opType,
      ...(change.payload !== undefined ? { payload: change.payload } : {}),
      ...(change.payloadRefPath ? { payloadRefPath: change.payloadRefPath } : {}),
      ...(change.vectorClock ? { vectorClock: change.vectorClock } : {}),
      sourceKind: change.sourceKind,
      createdAt,
    };
  }

  decode<TPayload = ProjectChangePayload>(
    record: CollaborationProjectChangeRecord<TPayload>,
  ): LocalChangeEnvelope<TPayload> {
    return {
      projectId: record.projectId,
      entityType: record.entityType,
      entityId: record.entityId,
      opType: record.opType,
      ...(record.payload !== undefined ? { payload: record.payload } : {}),
      ...(record.payloadRefPath ? { payloadRefPath: record.payloadRefPath } : {}),
      baseRevision: record.baseRevision,
      sourceKind: record.sourceKind,
      ...(record.vectorClock ? { vectorClock: record.vectorClock } : {}),
      createdAt: record.createdAt,
    };
  }
}
