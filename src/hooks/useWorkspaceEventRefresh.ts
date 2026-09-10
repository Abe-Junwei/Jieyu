import { useEffect, useRef } from 'react';
import {
  decideWorkspaceUnitRefresh,
  rememberWorkspaceEventKey,
  subscribeWorkspaceEvent,
  WORKSPACE_CONTEXT_SYNC_EVENT,
  WORKSPACE_LEXEME_DELETED_EVENT,
  WORKSPACE_LEXEME_UPDATED_EVENT,
  WORKSPACE_UNIT_UPDATED_EVENT,
  type WorkspaceContextSyncDetail,
  type WorkspaceLexemeDeletedDetail,
  type WorkspaceLexemeUpdatedDetail,
  type WorkspaceUnitUpdatedDetail,
} from '../utils/workspaceEvents';

export type UseWorkspaceEventRefreshOptions = {
  hasDraftForUnit?: (unitId: string) => boolean;
  onUnitUpdated?: (detail: WorkspaceUnitUpdatedDetail) => void;
  onUnitRefreshBlocked?: (detail: WorkspaceUnitUpdatedDetail) => void;
  onLexemeUpdated?: (detail: WorkspaceLexemeUpdatedDetail) => void;
  onLexemeDeleted?: (detail: WorkspaceLexemeDeletedDetail) => void;
  onContextSync?: (detail: WorkspaceContextSyncDetail) => void;
};

export function useWorkspaceEventRefresh(options: UseWorkspaceEventRefreshOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const seenKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const seenKeys = seenKeysRef.current;
    const stopUnit = subscribeWorkspaceEvent(WORKSPACE_UNIT_UPDATED_EVENT, (raw) => {
      const detail = raw as WorkspaceUnitUpdatedDetail;
      if (!detail.unitId) return;
      const decision = decideWorkspaceUnitRefresh({
        idempotencyKey: detail.idempotencyKey,
        seenKeys,
        hasUncommittedDraft: optionsRef.current.hasDraftForUnit?.(detail.unitId) === true,
      });
      if (decision === 'drop-duplicate') return;
      rememberWorkspaceEventKey(seenKeys, detail.idempotencyKey);
      if (decision === 'mark-dirty') {
        optionsRef.current.onUnitRefreshBlocked?.(detail);
        return;
      }
      optionsRef.current.onUnitUpdated?.(detail);
    });
    const stopLexemeUpdated = subscribeWorkspaceEvent(WORKSPACE_LEXEME_UPDATED_EVENT, (raw) => {
      const detail = raw as WorkspaceLexemeUpdatedDetail;
      if (!detail.lexemeId) return;
      if (seenKeys.has(detail.idempotencyKey)) return;
      rememberWorkspaceEventKey(seenKeys, detail.idempotencyKey);
      optionsRef.current.onLexemeUpdated?.(detail);
    });
    const stopLexemeDeleted = subscribeWorkspaceEvent(WORKSPACE_LEXEME_DELETED_EVENT, (raw) => {
      const detail = raw as WorkspaceLexemeDeletedDetail;
      if (!detail.lexemeId) return;
      if (seenKeys.has(detail.idempotencyKey)) return;
      rememberWorkspaceEventKey(seenKeys, detail.idempotencyKey);
      optionsRef.current.onLexemeDeleted?.(detail);
    });
    const stopContext = subscribeWorkspaceEvent(WORKSPACE_CONTEXT_SYNC_EVENT, (raw) => {
      const detail = raw as WorkspaceContextSyncDetail;
      if (seenKeys.has(detail.idempotencyKey)) return;
      rememberWorkspaceEventKey(seenKeys, detail.idempotencyKey);
      optionsRef.current.onContextSync?.(detail);
    });
    return () => {
      stopUnit();
      stopLexemeUpdated();
      stopLexemeDeleted();
      stopContext();
    };
  }, []);
}
