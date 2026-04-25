export const APP_SHELL_OPEN_SEARCH_EVENT = 'jieyu:open-search';
export const WORKSPACE_UNIT_UPDATED_EVENT = 'jieyu:workspace.unit-updated.v1';
export const WORKSPACE_LEXEME_UPDATED_EVENT = 'jieyu:workspace.lexeme-updated.v1';
export const WORKSPACE_LEXEME_DELETED_EVENT = 'jieyu:workspace.lexeme-deleted.v1';
export const WORKSPACE_CONTEXT_SYNC_EVENT = 'jieyu:workspace.context-sync.v1';

export type AppShellSearchScope = 'current-layer' | 'current-unit' | 'global';

export interface AppShellOpenSearchDetail {
  query?: string;
  scope?: AppShellSearchScope;
  layerKinds?: Array<'transcription' | 'translation' | 'gloss'>;
}

export type WorkspaceEventName =
  | typeof WORKSPACE_UNIT_UPDATED_EVENT
  | typeof WORKSPACE_LEXEME_UPDATED_EVENT
  | typeof WORKSPACE_LEXEME_DELETED_EVENT
  | typeof WORKSPACE_CONTEXT_SYNC_EVENT;

export interface WorkspaceEventBaseDetail {
  eventId: string;
  occurredAt: string;
  idempotencyKey: string;
}

export interface WorkspaceUnitUpdatedDetail extends WorkspaceEventBaseDetail {
  unitId: string;
  layerId: string;
  revision: number | string;
}

export interface WorkspaceLexemeUpdatedDetail extends WorkspaceEventBaseDetail {
  lexemeId: string;
  revision: number | string;
  textId?: string;
}

export type WorkspaceLexemeDeletionMode = 'soft' | 'hard';

export interface WorkspaceLexemeDeletedDetail extends WorkspaceEventBaseDetail {
  lexemeId: string;
  deletionMode: WorkspaceLexemeDeletionMode;
  textId?: string;
}

export type WorkspaceContextSyncPage = 'transcription' | 'annotation' | 'lexicon' | 'corpus' | 'analysis';

export interface WorkspaceContextSyncDetail extends WorkspaceEventBaseDetail {
  sourcePage: WorkspaceContextSyncPage;
  targetPage: WorkspaceContextSyncPage;
  contextKeys: string[];
  unitId?: string;
  layerId?: string;
  lexemeId?: string;
}

export type WorkspaceEventDetailMap = {
  [WORKSPACE_UNIT_UPDATED_EVENT]: WorkspaceUnitUpdatedDetail;
  [WORKSPACE_LEXEME_UPDATED_EVENT]: WorkspaceLexemeUpdatedDetail;
  [WORKSPACE_LEXEME_DELETED_EVENT]: WorkspaceLexemeDeletedDetail;
  [WORKSPACE_CONTEXT_SYNC_EVENT]: WorkspaceContextSyncDetail;
};

export function dispatchWorkspaceEvent<Name extends WorkspaceEventName>(
  name: Name,
  detail: WorkspaceEventDetailMap[Name],
  target?: EventTarget,
): boolean {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!eventTarget) return false;
  return eventTarget.dispatchEvent(new CustomEvent(name, { detail }));
}

export function subscribeWorkspaceEvent<Name extends WorkspaceEventName>(
  name: Name,
  listener: (detail: WorkspaceEventDetailMap[Name], event: CustomEvent<WorkspaceEventDetailMap[Name]>) => void,
  target?: EventTarget,
): () => void {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!eventTarget) return () => undefined;
  const wrapped = (event: Event) => {
    const customEvent = event as CustomEvent<WorkspaceEventDetailMap[Name]>;
    listener(customEvent.detail, customEvent);
  };
  eventTarget.addEventListener(name, wrapped);
  return () => eventTarget.removeEventListener(name, wrapped);
}