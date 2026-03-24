import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { getDb } from '../db';
import type { SpeakerDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { createAsyncMutex } from '../utils/asyncMutex';
import { normalizeUtteranceTextDocForStorage } from '../utils/camDataUtils';
import { createLogger } from '../observability/logger';

const log = createLogger('useTranscriptionPersistence');

export class TranscriptionPersistenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionPersistenceConflictError';
  }
}

type SyncToDbOptions = {
  conflictGuard?: boolean;
};

type Params = {
  utterancesRef: MutableRefObject<UtteranceDocType[]>;
  translationsRef: MutableRefObject<UtteranceTextDocType[]>;
  speakersRef: MutableRefObject<SpeakerDocType[]>;
};

export function useTranscriptionPersistence({
  utterancesRef,
  translationsRef,
  speakersRef,
}: Params) {
  // Async mutex: serializes syncToDb / undo / redo to prevent interleaving
  const dbMutexRef = useRef(createAsyncMutex());

  /** Sync a snapshot of utterances + translations + speakers back to IndexedDB. */
  const syncToDb = useCallback(async (
    targetUtterances: UtteranceDocType[],
    targetTranslations: UtteranceTextDocType[],
    targetSpeakers: SpeakerDocType[],
    options?: SyncToDbOptions,
  ) => {
    await dbMutexRef.current.run(async () => {
      const db = await getDb();
      if (options?.conflictGuard) {
        const assertNoConflict = async <T extends { id: string; updatedAt?: string }>(
          label: string,
          baseRows: T[],
          fetchRows: () => Promise<Array<{ toJSON: () => T }>>,
        ): Promise<void> => {
          if (baseRows.length === 0) return;
          const expectedById = new Map(baseRows.map((row) => [row.id, row.updatedAt ?? ''] as const));
          const persistedRows = await fetchRows();
          const persistedById = new Map(
            persistedRows.map((row) => {
              const doc = row.toJSON();
              return [doc.id, doc.updatedAt ?? ''] as const;
            }),
          );

          for (const [id, expectedUpdatedAt] of expectedById) {
            if (!persistedById.has(id)) {
              throw new TranscriptionPersistenceConflictError(`${label} conflict: missing persisted row ${id}`);
            }
            const persistedUpdatedAt = persistedById.get(id) ?? '';
            if (persistedUpdatedAt !== expectedUpdatedAt) {
              throw new TranscriptionPersistenceConflictError(
                `${label} conflict: row ${id} changed externally (${expectedUpdatedAt} -> ${persistedUpdatedAt})`,
              );
            }
          }
        };

        try {
          await assertNoConflict('utterances', utterancesRef.current, async () => (
            db.collections.utterances.findByIndexAnyOf('id', utterancesRef.current.map((row) => row.id))
          ));
          await assertNoConflict('translations', translationsRef.current, async () => (
            db.collections.utterance_texts.findByIndexAnyOf('id', translationsRef.current.map((row) => row.id))
          ));
          await assertNoConflict('speakers', speakersRef.current, async () => (
            db.collections.speakers.findByIndexAnyOf('id', speakersRef.current.map((row) => row.id))
          ));
        } catch (error) {
          log.warn('Abort syncToDb because persistence conflict guard failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      const currentUttIds = new Set(utterancesRef.current.map((u) => u.id));
      const targetUttIds = new Set(targetUtterances.map((u) => u.id));
      // Remove deleted utterances
      for (const id of currentUttIds) {
        if (!targetUttIds.has(id)) await LinguisticService.removeUtterance(id);
      }
      // Upsert target utterances
      for (const u of targetUtterances) await LinguisticService.saveUtterance(u);

      const currentTrIds = new Set(translationsRef.current.map((t) => t.id));
      const targetTrIds = new Set(targetTranslations.map((t) => t.id));
      // Remove deleted translations
      for (const id of currentTrIds) {
        if (!targetTrIds.has(id)) await db.collections.utterance_texts.remove(id);
      }
      // Upsert target translations
      for (const t of targetTranslations) await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(t));

      const currentSpeakerIds = new Set(speakersRef.current.map((s) => s.id));
      const targetSpeakerIds = new Set(targetSpeakers.map((s) => s.id));
      // Remove deleted speakers
      for (const id of currentSpeakerIds) {
        if (!targetSpeakerIds.has(id)) await db.collections.speakers.remove(id);
      }
      // Upsert target speakers
      for (const speaker of targetSpeakers) await db.collections.speakers.insert(speaker);
    });
  }, [speakersRef, translationsRef, utterancesRef]);

  const runWithDbMutex = useCallback(async <T>(task: () => Promise<T>): Promise<T> => {
    return dbMutexRef.current.run(task);
  }, []);

  return {
    runWithDbMutex,
    syncToDb,
  };
}