import { useCallback, useRef, useState } from 'react';
import {
  buildDeleteConfirmStats,
  nextSuppressFlag,
  shouldPromptDelete,
  type DeleteConfirmStats,
} from '../utils/deleteConfirmFlow';

type DeleteTargets = Set<string> | string;

export function useDeleteConfirmFlow(utteranceHasText: (id: string) => boolean) {
  const suppressDeleteConfirmRef = useRef(false);
  const pendingDeleteActionRef = useRef<(() => void) | null>(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState<DeleteConfirmStats | null>(null);
  const [muteDeleteConfirmInSession, setMuteDeleteConfirmInSession] = useState(false);

  const requestDeleteUtterances = useCallback((ids: DeleteTargets, onConfirm: () => void) => {
    const idSet = typeof ids === 'string' ? new Set([ids]) : ids;
    const idsArray = [...idSet];
    const stats = buildDeleteConfirmStats(idsArray, utteranceHasText);

    if (!shouldPromptDelete(stats, suppressDeleteConfirmRef.current)) {
      onConfirm();
      return;
    }

    pendingDeleteActionRef.current = onConfirm;
    setMuteDeleteConfirmInSession(false);
    setDeleteConfirmState(stats);
  }, [utteranceHasText]);

  const closeDeleteConfirmDialog = useCallback(() => {
    pendingDeleteActionRef.current = null;
    setDeleteConfirmState(null);
    setMuteDeleteConfirmInSession(false);
  }, []);

  const confirmDeleteFromDialog = useCallback(() => {
    suppressDeleteConfirmRef.current = nextSuppressFlag(
      suppressDeleteConfirmRef.current,
      true,
      muteDeleteConfirmInSession,
    );

    const action = pendingDeleteActionRef.current;
    closeDeleteConfirmDialog();
    action?.();
  }, [closeDeleteConfirmDialog, muteDeleteConfirmInSession]);

  return {
    requestDeleteUtterances,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  };
}
