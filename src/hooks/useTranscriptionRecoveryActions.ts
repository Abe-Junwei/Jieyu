import { useCallback } from 'react';
import { getDb } from '../../db';
import type { TranslationLayerDocType, UtteranceDocType } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  clearRecoverySnapshot,
  getRecoverySnapshot,
  type RecoveryData,
} from '../services/SnapshotService';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeUtteranceTextDocForStorage } from '../utils/camDataUtils';
import type { SaveState } from './transcriptionTypes';

type Params = {
  dbNameRef: React.MutableRefObject<string | undefined>;
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  loadSnapshot: () => Promise<void>;
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  setSaveState: (s: SaveState) => void;
};

export function useTranscriptionRecoveryActions({
  dbNameRef,
  utterancesRef,
  loadSnapshot,
  runWithDbMutex,
  setSaveState,
}: Params) {
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
  }, [dbNameRef, utterancesRef]);

  const applyRecovery = useCallback(async (data: RecoveryData) => {
    await runWithDbMutex(async () => {
      const db = await getDb();
      const recoveryTextId = data.utterances[0]?.textId ?? utterancesRef.current[0]?.textId;

      for (const u of data.utterances) await LinguisticService.saveUtterance(u);
      for (const t of data.translations) {
        await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(t));
      }
      for (const l of data.layers) {
        const normalizedTextId = l.textId ?? recoveryTextId;
        if (!normalizedTextId) continue;
        const normalizedLayer: TranslationLayerDocType = {
          ...l,
          textId: normalizedTextId,
        };
        await db.collections.translation_layers.insert(normalizedLayer);
      }
    });

    await loadSnapshot();
    const name = dbNameRef.current;
    if (name) fireAndForget(clearRecoverySnapshot(name));
    setSaveState({ kind: 'done', message: '已从崩溃恢复数据中还原' });
  }, [dbNameRef, loadSnapshot, runWithDbMutex, setSaveState, utterancesRef]);

  const dismissRecovery = useCallback(async () => {
    const name = dbNameRef.current;
    if (name) await clearRecoverySnapshot(name);
  }, [dbNameRef]);

  return {
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  };
}