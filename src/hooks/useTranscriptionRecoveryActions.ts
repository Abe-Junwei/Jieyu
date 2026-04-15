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
import { syncUtteranceTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { listUtteranceDocsFromCanonicalLayerUnits } from '../services/LayerSegmentGraphService';

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
          const ids = utterancesRef.current.map((u) => u.id);
          const persistedUtterances = await listUtteranceDocsFromCanonicalLayerUnits(db);
          const persistedById = new Map(
            persistedUtterances
              .filter((u) => ids.includes(u.id))
              .map((doc) => [doc.id, doc.updatedAt] as const),
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
      setSaveState({ kind: 'done', message: '\u5df2\u4ece\u5d29\u6e83\u6062\u590d\u6570\u636e\u4e2d\u8fd8\u539f' });
      return true;
    } catch (error) {
      log.error('Apply recovery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      reportActionError({
        actionLabel: '\u6062\u590d',
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