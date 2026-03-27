import { useCallback } from 'react';
import { getDb } from '../db';
import type { LayerDocType, UtteranceDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import {
  clearRecoverySnapshot,
  getRecoverySnapshot,
  type RecoveryData,
} from '../services/SnapshotService';
import { fireAndForget } from '../utils/fireAndForget';
import type { SaveState } from './transcriptionTypes';
import { createLogger } from '../observability/logger';
import { reportActionError } from '../utils/actionErrorReporter';
import { syncUtteranceTextToSegmentationV2 } from '../services/LayerSegmentationV2BridgeService';

const log = createLogger('useTranscriptionRecoveryActions');

class RecoveryApplyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryApplyConflictError';
  }
}

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

  const applyRecovery = useCallback(async (data: RecoveryData): Promise<boolean> => {
    try {
      await runWithDbMutex(async () => {
        const db = await getDb();
        if (utterancesRef.current.length > 0) {
          const expectedById = new Map(
            utterancesRef.current.map((u) => [u.id, u.updatedAt] as const),
          );
          const persistedUtterances = await db.collections.utterances.findByIndexAnyOf(
            'id',
            utterancesRef.current.map((u) => u.id),
          );
          const persistedById = new Map(
            persistedUtterances.map((u) => {
              const doc = u.toJSON();
              return [doc.id, doc.updatedAt] as const;
            }),
          );

          for (const [id, expectedUpdatedAt] of expectedById) {
            if (!persistedById.has(id)) {
              throw new RecoveryApplyConflictError(`missing persisted utterance ${id}`);
            }
            const persistedUpdatedAt = persistedById.get(id);
            if (persistedUpdatedAt !== expectedUpdatedAt) {
              throw new RecoveryApplyConflictError(
                `utterance ${id} changed externally (${expectedUpdatedAt} -> ${persistedUpdatedAt})`,
              );
            }
          }
        }

        const recoveryTextId = data.utterances[0]?.textId ?? utterancesRef.current[0]?.textId;

        for (const u of data.utterances) await LinguisticService.saveUtterance(u);
        for (const t of data.translations) {
          const owner = data.utterances.find((item) => item.id === t.utteranceId);
          if (owner) {
            await syncUtteranceTextToSegmentationV2(db, owner, t);
          }
        }
        for (const l of data.layers) {
          const normalizedTextId = l.textId ?? recoveryTextId;
          if (!normalizedTextId) continue;
          const normalizedLayer: LayerDocType = {
            ...l,
            textId: normalizedTextId,
          };
          await db.collections.layers.insert(normalizedLayer);
        }
      });

      await loadSnapshot();
      const name = dbNameRef.current;
      if (name) fireAndForget(clearRecoverySnapshot(name));
      setSaveState({ kind: 'done', message: '已从崩溃恢复数据中还原' });
      return true;
    } catch (error) {
      log.error('Apply recovery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      reportActionError({
        actionLabel: '恢复',
        error,
        conflictNames: ['RecoveryApplyConflictError'],
          conflictI18nKey: 'transcription.error.conflict.recoveryApply',
          fallbackI18nKey: 'transcription.error.action.recoveryApplyFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return false;
    }
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