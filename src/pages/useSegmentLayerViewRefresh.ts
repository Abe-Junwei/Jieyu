import { useRef, type MutableRefObject } from 'react';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import { t, type Locale } from '../i18n';
import { refreshSegmentLayerView, type SegmentViewRefreshPending } from './segmentLayerWriteReload';
import { setSegmentMutationActionError } from './useTranscriptionSegmentMutationController.utils';

export function useSegmentLayerViewRefresh(input: {
  locale: Locale;
  generation: { current: number };
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  setSaveState: (state: SaveState) => void;
}): {
  pendingView: MutableRefObject<SegmentViewRefreshPending | null>;
  noteViewStale: MutableRefObject<(pending: SegmentViewRefreshPending) => void>;
} {
  const pendingView = useRef<SegmentViewRefreshPending | null>(null);
  const noteViewStale = useRef<(pending: SegmentViewRefreshPending) => void>(() => {});
  const retryRef = useRef<() => Promise<void>>(async () => {});

  noteViewStale.current = (pending) => {
    pendingView.current = pending;
    input.setSaveState({
      kind: 'viewStale',
      message: t(input.locale, 'transcription.toast.segmentWrittenViewStale'),
      actionLabel: t(input.locale, 'transcription.toast.segmentViewRetry'),
      onAction: () => {
        void retryRef.current();
      },
    });
  };

  retryRef.current = async () => {
    const pending = pendingView.current;
    if (!pending) return;
    try {
      const result = await refreshSegmentLayerView({
        generation: input.generation,
        expectedGeneration: pending.generation,
        reloadSegments: input.reloadSegments,
        refreshSegmentUndoSnapshot: input.refreshSegmentUndoSnapshot,
      });
      if (pendingView.current !== pending) return;
      if (result !== 'applied') {
        if (result === 'superseded') {
          pendingView.current = null;
          input.setSaveState({ kind: 'idle' });
        }
        return;
      }
      if (input.generation.current !== pending.generation) {
        pendingView.current = null;
        input.setSaveState({ kind: 'idle' });
        return;
      }
      pending.apply();
      if (pendingView.current !== pending) return;
      pendingView.current = null;
      input.setSaveState({ kind: 'idle' });
    } catch (error) {
      if (pendingView.current !== pending) return;
      pendingView.current = null;
      setSegmentMutationActionError(
        input.setSaveState,
        pending.actionLabel,
        pending.failureKey,
        error,
      );
    }
  };

  return { pendingView, noteViewStale };
}
