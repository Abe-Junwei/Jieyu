export const WORKSPACE_UNIT_UPDATED_EVENT = 'jieyu:workspace.unit-updated.v1';
export const WORKSPACE_LEXEME_UPDATED_EVENT = 'jieyu:workspace.lexeme-updated.v1';
export const WORKSPACE_LEXEME_DELETED_EVENT = 'jieyu:workspace.lexeme-deleted.v1';
export const WORKSPACE_CONTEXT_SYNC_EVENT = 'jieyu:workspace.context-sync.v1';

export type WorkspaceEventName =
  | typeof WORKSPACE_UNIT_UPDATED_EVENT
  | typeof WORKSPACE_LEXEME_UPDATED_EVENT
  | typeof WORKSPACE_LEXEME_DELETED_EVENT
  | typeof WORKSPACE_CONTEXT_SYNC_EVENT;

export type WorkspaceUnitUpdatedDetail = {
  eventId: string;
  occurredAt: string;
  unitId: string;
  layerId: string;
  revision: number;
  idempotencyKey: string;
};

export type WorkspaceLexemeUpdatedDetail = {
  eventId: string;
  occurredAt: string;
  lexemeId: string;
  revision: number;
  idempotencyKey: string;
  textId?: string;
};

export type WorkspaceLexemeDeletedDetail = {
  eventId: string;
  occurredAt: string;
  lexemeId: string;
  deletionMode: 'soft' | 'hard';
  idempotencyKey: string;
  textId?: string;
};

export type WorkspaceContextSyncDetail = {
  eventId: string;
  occurredAt: string;
  sourcePage: string;
  targetPage: string;
  unitId?: string;
  layerId?: string;
  lexemeId?: string;
  contextKeys: string[];
  idempotencyKey: string;
};

export type WorkspaceEventDetail =
  | WorkspaceUnitUpdatedDetail
  | WorkspaceLexemeUpdatedDetail
  | WorkspaceLexemeDeletedDetail
  | WorkspaceContextSyncDetail;

export type WorkspaceRefreshDecision = 'apply' | 'drop-duplicate' | 'mark-dirty';

function newWorkspaceEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function envelope(revision: number, idempotencyKey: string) {
  return {
    eventId: newWorkspaceEventId(),
    occurredAt: new Date().toISOString(),
    revision,
    idempotencyKey,
  };
}

export function buildUnitUpdatedIdempotencyKey(unitId: string, revision: number): string {
  return `unit:${unitId}:rev:${revision}`;
}

export function buildLexemeUpdatedIdempotencyKey(lexemeId: string, revision: number): string {
  return `lexeme:${lexemeId}:rev:${revision}`;
}

export function buildContextSyncIdempotencyKey(
  sourcePage: string,
  targetPage: string,
  eventId: string,
): string {
  return `context:${sourcePage}->${targetPage}:${eventId}`;
}

export function decideWorkspaceUnitRefresh(input: {
  idempotencyKey: string;
  seenKeys: ReadonlySet<string>;
  hasUncommittedDraft: boolean;
}): WorkspaceRefreshDecision {
  if (input.seenKeys.has(input.idempotencyKey)) return 'drop-duplicate';
  if (input.hasUncommittedDraft) return 'mark-dirty';
  return 'apply';
}

export function rememberWorkspaceEventKey(
  seenKeys: Set<string>,
  idempotencyKey: string,
  max = 200,
): void {
  seenKeys.add(idempotencyKey);
  if (seenKeys.size <= max) return;
  const oldest = seenKeys.values().next().value;
  if (typeof oldest === 'string') seenKeys.delete(oldest);
}

function canUseWindowEvents(): boolean {
  return typeof window !== 'undefined' && typeof CustomEvent !== 'undefined';
}

export function dispatchWorkspaceEvent(
  type: WorkspaceEventName,
  detail: WorkspaceEventDetail,
): void {
  if (!canUseWindowEvents()) return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function subscribeWorkspaceEvent(
  type: WorkspaceEventName,
  handler: (detail: WorkspaceEventDetail) => void,
): () => void {
  if (!canUseWindowEvents()) return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceEventDetail>).detail;
    if (!detail) return;
    handler(detail);
  };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}

export function dispatchWorkspaceUnitUpdated(input: {
  unitId: string;
  layerId?: string;
  revision?: number;
}): WorkspaceUnitUpdatedDetail | null {
  const unitId = input.unitId.trim();
  if (unitId.length === 0) return null;
  const revision = input.revision ?? Date.now();
  const detail: WorkspaceUnitUpdatedDetail = {
    ...envelope(revision, buildUnitUpdatedIdempotencyKey(unitId, revision)),
    unitId,
    layerId: input.layerId?.trim() ?? '',
  };
  dispatchWorkspaceEvent(WORKSPACE_UNIT_UPDATED_EVENT, detail);
  return detail;
}

export function dispatchWorkspaceLexemeUpdated(input: {
  lexemeId: string;
  revision?: number;
  textId?: string;
}): WorkspaceLexemeUpdatedDetail | null {
  const lexemeId = input.lexemeId.trim();
  if (lexemeId.length === 0) return null;
  const revision = input.revision ?? Date.now();
  const detail: WorkspaceLexemeUpdatedDetail = {
    ...envelope(revision, buildLexemeUpdatedIdempotencyKey(lexemeId, revision)),
    lexemeId,
    ...(input.textId && input.textId.trim().length > 0 ? { textId: input.textId.trim() } : {}),
  };
  dispatchWorkspaceEvent(WORKSPACE_LEXEME_UPDATED_EVENT, detail);
  return detail;
}

export function dispatchWorkspaceLexemeDeleted(input: {
  lexemeId: string;
  deletionMode: 'soft' | 'hard';
  textId?: string;
}): WorkspaceLexemeDeletedDetail | null {
  const lexemeId = input.lexemeId.trim();
  if (lexemeId.length === 0) return null;
  const eventId = newWorkspaceEventId();
  const detail: WorkspaceLexemeDeletedDetail = {
    eventId,
    occurredAt: new Date().toISOString(),
    lexemeId,
    deletionMode: input.deletionMode,
    idempotencyKey: `lexeme:${lexemeId}:rev:${eventId}`,
    ...(input.textId && input.textId.trim().length > 0 ? { textId: input.textId.trim() } : {}),
  };
  dispatchWorkspaceEvent(WORKSPACE_LEXEME_DELETED_EVENT, detail);
  return detail;
}

export function dispatchWorkspaceContextSync(
  input: Omit<WorkspaceContextSyncDetail, 'eventId' | 'occurredAt' | 'idempotencyKey'> & {
    eventId?: string;
  },
): WorkspaceContextSyncDetail | null {
  if (!canUseWindowEvents()) return null;
  const eventId = input.eventId?.trim() || newWorkspaceEventId();
  const detail: WorkspaceContextSyncDetail = {
    eventId,
    occurredAt: new Date().toISOString(),
    sourcePage: input.sourcePage,
    targetPage: input.targetPage,
    contextKeys: [...input.contextKeys],
    idempotencyKey: buildContextSyncIdempotencyKey(input.sourcePage, input.targetPage, eventId),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.layerId ? { layerId: input.layerId } : {}),
    ...(input.lexemeId ? { lexemeId: input.lexemeId } : {}),
  };
  dispatchWorkspaceEvent(WORKSPACE_CONTEXT_SYNC_EVENT, detail);
  return detail;
}
