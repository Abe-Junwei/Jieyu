import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { SaveState, DbState } from './transcriptionTypes';
import type { LayerUnitDocType, LayerUnitContentDocType, LayerDocType } from '../db';
import { clearRecoverySnapshot, saveRecoverySnapshot } from '../services/SnapshotService';
import { fireAndForget } from '../utils/fireAndForget';

type Params = {
  loadSnapshot: () => Promise<void>;
  loadLinguisticAnnotations: () => Promise<void>;
  setState: Dispatch<SetStateAction<DbState>>;
  dbNameRef: MutableRefObject<string | undefined>;
  dirtyRef: MutableRefObject<boolean>;
  unitsRef: MutableRefObject<LayerUnitDocType[]>;
  translationsRef: MutableRefObject<LayerUnitContentDocType[]>;
  layersRef: MutableRefObject<LayerDocType[]>;
  autoSaveTimersRef: MutableRefObject<Record<string, number>>;
  recoveryCancel: () => void;
  saveState: SaveState;
};

export function useTranscriptionLifecycle({
  loadSnapshot,
  loadLinguisticAnnotations,
  setState,
  dbNameRef,
  dirtyRef,
  unitsRef,
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
        // token/morpheme 延迟加载，不阻塞首屏 | Deferred linguistic load, non-blocking
        fireAndForget(loadLinguisticAnnotations());
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : '\u672a\u77e5\u9519\u8bef',
        });
      }
    };

    fireAndForget(load());

    // Save recovery snapshot on page unload
    const onBeforeUnload = () => {
      const name = dbNameRef.current;
      if (name && dirtyRef.current && unitsRef.current.length > 0) {
        // Use synchronous-ish approach: navigator.sendBeacon is not suitable for IDB.
        // Instead, start the async save — the browser usually allows short IDB writes.
        fireAndForget(saveRecoverySnapshot(name, {
          units: unitsRef.current,
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
    loadLinguisticAnnotations,
    loadSnapshot,
    recoveryCancel,
    setState,
    translationsRef,
    unitsRef,
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