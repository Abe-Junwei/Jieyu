import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { SaveState, DbState } from './transcriptionTypes';
import type { LayerUnitDocType, LayerUnitContentDocType, LayerDocType } from '../../db';
import { clearRecoverySnapshot, saveRecoverySnapshot } from '../../services/SnapshotService';
import { fireAndForget } from '../../utils/fireAndForget';
import { LinguisticService } from '../../services/LinguisticService';
import {
  getActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';

type Params = {
  /** 必须传当前项目 textId（JY-02）| Must pass the current project textId (JY-02) */
  loadSnapshot: (textId: string) => Promise<void>;
  loadLinguisticAnnotations: (textId: string) => Promise<void>;
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

/**
 * 首屏要载入的项目：已发布的活动项目（深链 / 返回提示），否则第一个文本（与 `useDialogs` 的回退一致）。
 * 不再整库载入后按 `units[0]` 猜项目（JY-02）。
 * Project for the first load: the published active project (deep link / return hint), else the first
 * text (same fallback as `useDialogs`). No more whole-DB load + `units[0]` guess (JY-02).
 */
async function resolveInitialWorkspaceTextId(): Promise<string> {
  const active = getActiveProjectTextId();
  if (active.length > 0) return active;
  const first = (await LinguisticService.timeline.listTexts())[0]?.id?.trim() ?? '';
  if (first.length > 0) publishActiveProjectTextId(first);
  return first;
}

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
        const textId = await resolveInitialWorkspaceTextId();
        if (cancelled) return;
        await loadSnapshot(textId);
        // token/morpheme 延迟加载，不阻塞首屏 | Deferred linguistic load, non-blocking
        fireAndForget(loadLinguisticAnnotations(textId), {
          context: 'src/hooks/transcription/useTranscriptionLifecycle.ts:L42',
          policy: 'background-quiet',
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : '\u672a\u77e5\u9519\u8bef',
        });
      }
    };

    fireAndForget(load(), {
      context: 'src/hooks/transcription/useTranscriptionLifecycle.ts:L52',
      policy: 'background',
    });

    // Save recovery snapshot on page unload
    const onBeforeUnload = () => {
      const name = dbNameRef.current;
      if (name && dirtyRef.current && unitsRef.current.length > 0) {
        // Use synchronous-ish approach: navigator.sendBeacon is not suitable for IDB.
        // Instead, start the async save — the browser usually allows short IDB writes.
        fireAndForget(
          saveRecoverySnapshot(name, {
            liveLayerGraph: {
              layer_units: unitsRef.current,
              layer_unit_contents: translationsRef.current,
              layers: layersRef.current,
            },
          }),
          {
            context: 'src/hooks/transcription/useTranscriptionLifecycle.ts:L60',
            policy: 'background',
          },
        );
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
      fireAndForget(clearRecoverySnapshot(name), {
        context: 'src/hooks/transcription/useTranscriptionLifecycle.ts:L94',
        policy: 'background',
      });
    }
  }, [dbNameRef, dirtyRef, saveState.kind]);
}
