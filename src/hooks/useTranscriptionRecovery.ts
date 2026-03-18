import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { getDb } from '../../db';
import type { TranslationLayerDocType, UtteranceDocType, UtteranceTextDocType } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { clearRecoverySnapshot, getRecoverySnapshot, saveRecoverySnapshot, type RecoveryData } from '../services/SnapshotService';
import { normalizeUtteranceTextDocForStorage } from '../utils/camDataUtils';
import { fireAndForget } from '../utils/fireAndForget';
import { useDebouncedCallback } from './useDebouncedCallback';
import type { SaveState } from './transcriptionTypes';

type Params = {
  utterancesRef: MutableRefObject<UtteranceDocType[]>;
  translationsRef: MutableRefObject<UtteranceTextDocType[]>;
  layersRef: MutableRefObject<TranslationLayerDocType[]>;
  loadSnapshot: () => Promise<void>;
  setSaveState: (value: SaveState) => void;
};

export function useTranscriptionRecovery({
  utterancesRef,
  translationsRef,
  layersRef,
  loadSnapshot,
  setSaveState,
}: Params) {
  const dbNameRef = useRef<string | undefined>(undefined);
  const dirtyRef = useRef(false);

  const recoverySave = useDebouncedCallback(() => {
    if (!dirtyRef.current) return;
    const name = dbNameRef.current;
    if (!name) return;
    fireAndForget(saveRecoverySnapshot(name, {
      utterances: utterancesRef.current,
      translations: translationsRef.current,
      layers: layersRef.current,
    }));
  }, 3000);

  const scheduleRecoverySave = recoverySave.run;

  const checkRecovery = useCallback(async (): Promise<RecoveryData | null> => {
    const name = dbNameRef.current;
    if (!name) return null;
    const snap = await getRecoverySnapshot(name);
    if (!snap || snap.utterances.length === 0) return null;

    const latestUpdatedAt = utterancesRef.current.reduce((max, u) => {
      const t = new Date(u.updatedAt).getTime();
      return t > max ? t : max;
    }, 0);

    if (snap.timestamp > latestUpdatedAt + 2000) return snap;
    fireAndForget(clearRecoverySnapshot(name));
    return null;
  }, [utterancesRef]);

  const applyRecovery = useCallback(async (data: RecoveryData) => {
    const db = await getDb();
    const recoveryTextId = data.utterances[0]?.textId ?? utterancesRef.current[0]?.textId;

    for (const u of data.utterances) await LinguisticService.saveUtterance(u);
    for (const t of data.translations) await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(t));
    for (const l of data.layers) {
      const normalizedTextId = l.textId ?? recoveryTextId;
      if (!normalizedTextId) continue;
      const normalizedLayer: TranslationLayerDocType = {
        ...l,
        textId: normalizedTextId,
      };
      await db.collections.translation_layers.insert(normalizedLayer);
    }

    await loadSnapshot();
    const name = dbNameRef.current;
    if (name) fireAndForget(clearRecoverySnapshot(name));
    setSaveState({ kind: 'done', message: '已从崩溃恢复数据中还原' });
  }, [loadSnapshot, setSaveState, utterancesRef]);

  const dismissRecovery = useCallback(async () => {
    const name = dbNameRef.current;
    if (name) await clearRecoverySnapshot(name);
  }, []);

  return {
    dbNameRef,
    dirtyRef,
    recoverySave,
    scheduleRecoverySave,
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  };
}
