import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { SpeakerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../../db/types';
import {
  syncTranscriptionWorkspace,
  TranscriptionPersistenceConflictError,
} from '../../db/storagePortTranscriptionPersistence';
import { createAsyncMutex } from '../../utils/asyncMutex';

export { TranscriptionPersistenceConflictError };

type SyncToDbOptions = {
  conflictGuard?: boolean;
};

type Params = {
  unitsRef: MutableRefObject<LayerUnitDocType[]>;
  translationsRef: MutableRefObject<LayerUnitContentDocType[]>;
  speakersRef: MutableRefObject<SpeakerDocType[]>;
};

export function useTranscriptionPersistence({ unitsRef, translationsRef, speakersRef }: Params) {
  // Async mutex: serializes syncToDb / undo / redo to prevent interleaving
  const dbMutexRef = useRef(createAsyncMutex());

  /** Sync a snapshot of units + translations + speakers back to IndexedDB (caller must hold db mutex). */
  const syncToDbCore = useCallback(
    async (
      targetUnits: LayerUnitDocType[],
      targetTranslations: LayerUnitContentDocType[],
      targetSpeakers: SpeakerDocType[],
      options?: SyncToDbOptions,
    ) => {
      await syncTranscriptionWorkspace({
        currentUnits: unitsRef.current,
        currentTranslations: translationsRef.current,
        currentSpeakers: speakersRef.current,
        targetUnits,
        targetTranslations,
        targetSpeakers,
        ...(options?.conflictGuard === true ? { conflictGuard: true } : {}),
      });
    },
    [speakersRef, translationsRef, unitsRef],
  );

  const syncToDb = useCallback(
    async (
      targetUnits: LayerUnitDocType[],
      targetTranslations: LayerUnitContentDocType[],
      targetSpeakers: SpeakerDocType[],
      options?: SyncToDbOptions,
    ) => {
      await dbMutexRef.current.run(() =>
        syncToDbCore(targetUnits, targetTranslations, targetSpeakers, options),
      );
    },
    [syncToDbCore],
  );

  const runWithDbMutex = useCallback(async <T>(task: () => Promise<T>): Promise<T> => {
    return dbMutexRef.current.run(task);
  }, []);

  return {
    runWithDbMutex,
    syncToDb,
    syncToDbCore,
  };
}
