export const APP_SHELL_OPEN_SEARCH_EVENT = 'jieyu:open-search';

export type AppShellSearchScope = 'current-layer' | 'current-unit' | 'global';

export interface AppShellOpenSearchDetail {
  query?: string;
  scope?: AppShellSearchScope;
  layerKinds?: Array<'transcription' | 'translation' | 'gloss'>;
}

export {
  dispatchWorkspaceContextSync,
  dispatchWorkspaceEvent,
  dispatchWorkspaceLexemeDeleted,
  dispatchWorkspaceLexemeUpdated,
  dispatchWorkspaceUnitUpdated,
  subscribeWorkspaceEvent,
  WORKSPACE_CONTEXT_SYNC_EVENT,
  WORKSPACE_LEXEME_DELETED_EVENT,
  WORKSPACE_LEXEME_UPDATED_EVENT,
  WORKSPACE_UNIT_UPDATED_EVENT,
} from './workspaceEvents';
export type {
  WorkspaceContextSyncDetail,
  WorkspaceEventDetail,
  WorkspaceEventName,
  WorkspaceLexemeDeletedDetail,
  WorkspaceLexemeUpdatedDetail,
  WorkspaceUnitUpdatedDetail,
} from './workspaceEvents';
