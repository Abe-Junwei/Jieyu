import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { getDb } from '../db';
import type { SpeakerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { createAsyncMutex } from '../utils/asyncMutex';
import { createLogger } from '../observability/logger';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { listUnitDocsFromCanonicalLayerUnits } from '../services/LayerSegmentGraphService';
import { removeUnitTextFromSegmentationV2, syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';

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
  unitsRef: MutableRefObject<LayerUnitDocType[]>;
  translationsRef: MutableRefObject<LayerUnitContentDocType[]>;
  speakersRef: MutableRefObject<SpeakerDocType[]>;
};

export function useTranscriptionPersistence({
  unitsRef,
  translationsRef,
  speakersRef,
}: Params) {
  // Async mutex: serializes syncToDb / undo / redo to prevent interleaving
  const dbMutexRef = useRef(createAsyncMutex());

  /** Sync a snapshot of units + translations + speakers back to IndexedDB. */
  const syncToDb = useCallback(async (
    targetUnits: LayerUnitDocType[],
    targetTranslations: LayerUnitContentDocType[],
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
          await assertNoConflict('units', unitsRef.current, async () => {
            const ids = unitsRef.current.map((row) => row.id);
            const projections = await listUnitDocsFromCanonicalLayerUnits(db);
            const byId = new Map(projections.map((u) => [u.id, u] as const));
            return ids.flatMap((id) => {
              const doc = byId.get(id);
              return doc ? [{ toJSON: () => doc }] : [];
            });
          });
          await assertNoConflict('translations', translationsRef.current, async () => {
            const ids = translationsRef.current.map((row) => row.id);
            const contents = await LayerSegmentQueryService.listSegmentContentsByIds(ids);
            const contentById = new Map(contents.map((content) => [content.id, content] as const));
            return ids.flatMap((id) => {
              const content = contentById.get(id);
              return content ? [{ toJSON: () => content as unknown as LayerUnitContentDocType }] : [];
            });
          });
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

      const currentUttIds = new Set(unitsRef.current.map((u) => u.id));
      const targetUttIds = new Set(targetUnits.map((u) => u.id));
      // Remove deleted units
      for (const id of currentUttIds) {
        if (!targetUttIds.has(id)) await LinguisticService.removeUnit(id);
      }
      // Upsert target units
      for (const u of targetUnits) await LinguisticService.saveUnit(u);

      const currentTrIds = new Set(translationsRef.current.map((t) => t.id));
      const targetTrIds = new Set(targetTranslations.map((t) => t.id));
      // Remove deleted translations
      for (const id of currentTrIds) {
        if (!targetTrIds.has(id)) {
          await removeUnitTextFromSegmentationV2(db, { id });
        }
      }
      // Upsert target translations
      const targetUnitById = new Map(targetUnits.map((item) => [item.id, item]));
      for (const t of targetTranslations) {
        const unitId = t.unitId?.trim();
        if (!unitId) continue;
        const owner = targetUnitById.get(unitId);
        if (owner) {
          await syncUnitTextToSegmentationV2(db, owner, t);
        }
      }

      const currentSpeakerIds = new Set(speakersRef.current.map((s) => s.id));
      const targetSpeakerIds = new Set(targetSpeakers.map((s) => s.id));
      // Remove deleted speakers
      for (const id of currentSpeakerIds) {
        if (!targetSpeakerIds.has(id)) await db.collections.speakers.remove(id);
      }
      // Upsert target speakers — 使用 upsert 避免 undo/redo 时已有 speaker 抛主键重复异常
      // | Use upsert to avoid duplicate primary key errors during undo/redo
      for (const speaker of targetSpeakers) await db.collections.speakers.insert(speaker);
    });
  }, [speakersRef, translationsRef, unitsRef]);

  const runWithDbMutex = useCallback(async <T>(task: () => Promise<T>): Promise<T> => {
    return dbMutexRef.current.run(task);
  }, []);

  return {
    runWithDbMutex,
    syncToDb,
  };
}
