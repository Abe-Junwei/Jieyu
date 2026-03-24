import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { SaveState, DbState } from './transcriptionTypes';
import type { UtteranceDocType, UtteranceTextDocType, TranslationLayerDocType } from '../db';
import {
  clearRecoverySnapshot,
  saveRecoverySnapshot,
} from '../services/SnapshotService';
import { fireAndForget } from '../utils/fireAndForget';

type Params = {
  loadSnapshot: () => Promise<void>;
  setState: Dispatch<SetStateAction<DbState>>;
  dbNameRef: MutableRefObject<string | undefined>;
  dirtyRef: MutableRefObject<boolean>;
  utterancesRef: MutableRefObject<UtteranceDocType[]>;
  translationsRef: MutableRefObject<UtteranceTextDocType[]>;
  layersRef: MutableRefObject<TranslationLayerDocType[]>;
  autoSaveTimersRef: MutableRefObject<Record<string, number>>;
  recoveryCancel: () => void;
  saveState: SaveState;
};

export function useTranscriptionLifecycle({
  loadSnapshot,
  setState,
  dbNameRef,
  dirtyRef,
  utterancesRef,
  translationsRef,
  layersRef,
  autoSaveTimersRef,
  recoveryCancel,
  saveState,
}: Params) {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await loadSnapshot();
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }
    };

    fireAndForget(load());

    // Save recovery snapshot on page unload
    const onBeforeUnload = () => {
      const name = dbNameRef.current;
      if (name && dirtyRef.current && utterancesRef.current.length > 0) {
        // Use synchronous-ish approach: navigator.sendBeacon is not suitable for IDB.
        // Instead, start the async save — the browser usually allows short IDB writes.
        fireAndForget(saveRecoverySnapshot(name, {
          utterances: utterancesRef.current,
          translations: translationsRef.current,
          layers: layersRef.current,
        }));
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      recoveryCancel();
      Object.values(autoSaveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      autoSaveTimersRef.current = {};
    };
  }, [
    autoSaveTimersRef,
    dbNameRef,
    dirtyRef,
    layersRef,
    loadSnapshot,
    recoveryCancel,
    setState,
    translationsRef,
    utterancesRef,
  ]);

  useEffect(() => {
    if (saveState.kind !== 'done') return;
    dirtyRef.current = false;
    const name = dbNameRef.current;
    if (name) {
      fireAndForget(clearRecoverySnapshot(name));
    }
  }, [dbNameRef, dirtyRef, saveState.kind]);
}