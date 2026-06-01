import { useCallback } from 'react';
import { getDb, importDatabaseFromJson } from '../../db';
import type { LayerUnitDocType } from '../../db';
import {
  clearRecoverySnapshot,
  getRecoveryLayerUnits,
  getRecoverySnapshot,
  type RecoveryData,
} from '../../services/SnapshotService';
import { fireAndForget } from '../../utils/fireAndForget';
import type { SaveState } from './transcriptionTypes';
import { createLogger } from '../../observability/logger';
import { reportActionError } from '../../utils/actionErrorReporter';
import { listUnitDocsFromCanonicalLayerUnits } from '../../services/LayerSegmentGraphService';

const log = createLogger('useTranscriptionRecoveryActions');

class RecoveryApplyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryApplyConflictError';
  }
}

type Params = {
  dbNameRef: React.MutableRefObject<string | undefined>;
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
  loadSnapshot: () => Promise<void>;
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  setSaveState: (s: SaveState) => void;
};

export function useTranscriptionRecoveryActions({
  dbNameRef,
  unitsRef,
  loadSnapshot,
  runWithDbMutex,
  setSaveState,
}: Params) {
  const checkRecovery = useCallback(async (): Promise<RecoveryData | null> => {
    const name = dbNameRef.current;
    if (!name) return null;
    const snap = await getRecoverySnapshot(name);
    const recoveryUnits = snap ? getRecoveryLayerUnits(snap) : [];
    if (!snap || recoveryUnits.length === 0) return null;

    const latestUpdatedAt = unitsRef.current.reduce((max, u) => {
      const t = new Date(u.updatedAt).getTime();
      return t > max ? t : max;
    }, 0);

    if (snap.timestamp > latestUpdatedAt + 2000) return snap;

    fireAndForget(clearRecoverySnapshot(name), {
      context: 'src/hooks/transcription/useTranscriptionRecoveryActions.ts:L50',
      policy: 'background',
    });
    return null;
  }, [dbNameRef, unitsRef]);

  const applyRecovery = useCallback(
    async (data: RecoveryData): Promise<boolean> => {
      try {
        await runWithDbMutex(async () => {
          if (unitsRef.current.length > 0) {
            const expectedById = new Map(unitsRef.current.map((u) => [u.id, u.updatedAt] as const));
            const ids = unitsRef.current.map((u) => u.id);
            const db = await getDb();
            const persistedUnits = await listUnitDocsFromCanonicalLayerUnits(db);
            const persistedById = new Map(
              persistedUnits
                .filter((u) => ids.includes(u.id))
                .map((doc) => [doc.id, doc.updatedAt] as const),
            );

            for (const [id, expectedUpdatedAt] of expectedById) {
              if (!persistedById.has(id)) {
                throw new RecoveryApplyConflictError(`missing persisted unit ${id}`);
              }
              const persistedUpdatedAt = persistedById.get(id);
              if (persistedUpdatedAt !== expectedUpdatedAt) {
                throw new RecoveryApplyConflictError(
                  `unit ${id} changed externally (${expectedUpdatedAt} -> ${persistedUpdatedAt})`,
                );
              }
            }
          }

          await importDatabaseFromJson(data.snapshot, { strategy: 'upsert' });
        });

        await loadSnapshot();
        const name = dbNameRef.current;
        if (name) {
          fireAndForget(clearRecoverySnapshot(name), {
            context: 'src/hooks/transcription/useTranscriptionRecoveryActions.ts:L88',
            policy: 'background',
          });
        }
        setSaveState({
          kind: 'done',
          message: '\u5df2\u4ece\u5d29\u6e83\u6062\u590d\u6570\u636e\u4e2d\u8fd8\u539f',
        });
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
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return false;
      }
    },
    [dbNameRef, loadSnapshot, runWithDbMutex, setSaveState, unitsRef],
  );

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
