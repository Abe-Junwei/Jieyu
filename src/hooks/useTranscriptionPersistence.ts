import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { getDb } from '../../db';
import type { SpeakerDocType, UtteranceDocType, UtteranceTextDocType } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { createAsyncMutex } from '../utils/asyncMutex';
import { normalizeUtteranceTextDocForStorage } from '../utils/camDataUtils';

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
  ) => {
    await dbMutexRef.current.run(async () => {
      const currentUttIds = new Set(utterancesRef.current.map((u) => u.id));
      const targetUttIds = new Set(targetUtterances.map((u) => u.id));
      // Remove deleted utterances
      for (const id of currentUttIds) {
        if (!targetUttIds.has(id)) await LinguisticService.removeUtterance(id);
      }
      // Upsert target utterances
      for (const u of targetUtterances) await LinguisticService.saveUtterance(u);
      const db = await getDb();

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