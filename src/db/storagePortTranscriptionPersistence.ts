import { getDb } from './engine';
import { validateSpeakerDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { LayerUnitContentDocType, LayerUnitDocType, SpeakerDocType } from './types';
import { withTransaction } from './withTransaction';
import { LinguisticService } from '../services/LinguisticService';
import { listUnitDocsByIds } from '../services/LayerSegmentGraphService';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import {
  removeUnitTextFromSegmentationV2,
  syncUnitTextToSegmentationV2,
} from '../services/LayerSegmentationTextService';
import { createLogger } from '../observability/logger';

const log = createLogger('storagePortTranscriptionPersistence');

export class TranscriptionPersistenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionPersistenceConflictError';
  }
}

export async function syncTranscriptionWorkspace(input: {
  currentUnits: LayerUnitDocType[];
  currentTranslations: LayerUnitContentDocType[];
  currentSpeakers: SpeakerDocType[];
  targetUnits: LayerUnitDocType[];
  targetTranslations: LayerUnitContentDocType[];
  targetSpeakers: SpeakerDocType[];
  conflictGuard?: boolean;
}): Promise<void> {
  const database = await getDb();
  try {
    await withTransaction(
      database,
      'rw',
      database.dexie.tables,
      async () => {
        if (input.conflictGuard === true) {
          const assertNoConflict = async <T extends { id: string; updatedAt?: string }>(
            label: string,
            baseRows: T[],
            fetchRows: () => Promise<Array<{ toJSON: () => T }>>,
          ): Promise<void> => {
            if (baseRows.length === 0) return;
            const expectedById = new Map(
              baseRows.map((row) => [row.id, row.updatedAt ?? ''] as const),
            );
            const persistedRows = await fetchRows();
            const persistedById = new Map(
              persistedRows.map((row) => {
                const doc = row.toJSON();
                return [doc.id, doc.updatedAt ?? ''] as const;
              }),
            );

            for (const [id, expectedUpdatedAt] of expectedById) {
              if (!persistedById.has(id)) {
                throw new TranscriptionPersistenceConflictError(
                  `${label} conflict: missing persisted row ${id}`,
                );
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
            await assertNoConflict('units', input.currentUnits, async () => {
              const ids = input.currentUnits.map((row) => row.id);
              const projections = await listUnitDocsByIds(database, ids);
              const byId = new Map(projections.map((unit) => [unit.id, unit] as const));
              return ids.flatMap((id) => {
                const doc = byId.get(id);
                return doc ? [{ toJSON: () => doc }] : [];
              });
            });
            await assertNoConflict('translations', input.currentTranslations, async () => {
              const ids = input.currentTranslations.map((row) => row.id);
              const contents = await LayerSegmentQueryService.listSegmentContentsByIds(ids);
              const contentById = new Map(
                contents.map((content) => [content.id, content] as const),
              );
              return ids.flatMap((id) => {
                const content = contentById.get(id);
                return content
                  ? [{ toJSON: () => content as unknown as LayerUnitContentDocType }]
                  : [];
              });
            });
            await assertNoConflict('speakers', input.currentSpeakers, async () => {
              const ids = input.currentSpeakers.map((row) => row.id);
              const rows = await database.dexie.speakers.bulkGet(ids);
              return rows.flatMap((row) => (row ? [{ toJSON: () => row }] : []));
            });
          } catch (error) {
            log.warn('Abort syncToDb because persistence conflict guard failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }

        const currentUnitIds = new Set(input.currentUnits.map((unit) => unit.id));
        const targetUnitIds = new Set(input.targetUnits.map((unit) => unit.id));
        for (const id of currentUnitIds) {
          if (!targetUnitIds.has(id)) await LinguisticService.cleanup.removeUnit(id);
        }
        for (const unit of input.targetUnits) await LinguisticService.units.save(unit);

        const currentTranslationIds = new Set(input.currentTranslations.map((row) => row.id));
        const targetTranslationIds = new Set(input.targetTranslations.map((row) => row.id));
        for (const id of currentTranslationIds) {
          if (!targetTranslationIds.has(id)) {
            await removeUnitTextFromSegmentationV2(database, { id });
          }
        }
        const targetUnitById = new Map(input.targetUnits.map((item) => [item.id, item]));
        for (const translation of input.targetTranslations) {
          const unitId = translation.unitId?.trim() ?? '';
          if (unitId.length === 0) continue;
          const owner = targetUnitById.get(unitId);
          if (owner) {
            await syncUnitTextToSegmentationV2(database, owner, translation);
          }
        }

        const currentSpeakerIds = new Set(input.currentSpeakers.map((speaker) => speaker.id));
        const targetSpeakerIds = new Set(input.targetSpeakers.map((speaker) => speaker.id));
        for (const id of currentSpeakerIds) {
          if (!targetSpeakerIds.has(id)) await database.dexie.speakers.delete(id);
        }
        for (const speaker of input.targetSpeakers) {
          validateSpeakerDoc(speaker);
          await database.dexie.speakers.put(speaker);
        }
      },
      { label: 'syncToDbCore' },
    );
    for (const speaker of input.targetSpeakers) {
      const stored = await database.dexie.speakers.get(speaker.id);
      if (!stored || stored.id !== speaker.id) {
        throw new StorageReadbackError('syncTranscriptionWorkspace');
      }
    }
    const removedSpeakerIds = input.currentSpeakers
      .map((speaker) => speaker.id)
      .filter((id) => !input.targetSpeakers.some((speaker) => speaker.id === id));
    for (const id of removedSpeakerIds) {
      const stored = await database.dexie.speakers.get(id);
      if (stored) throw new StorageReadbackError('syncTranscriptionWorkspace');
    }
  } catch (error) {
    if (error instanceof Error && error.cause instanceof TranscriptionPersistenceConflictError) {
      throw error.cause;
    }
    throw error;
  }
}
