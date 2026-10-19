import { listUnitTextsByUnit } from '../services/LayerSegmentationTextService';
import { dexieStoresForGetUnitLinguisticMemoryRead } from './dexieTranscriptionGraphStores';
import { getDb } from './engine';
import type {
  LayerUnitDocType,
  TierDefinitionDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
  UserNoteDocType,
} from './types';

type NoteTargetType = 'unit' | 'translation' | 'token' | 'morpheme';

export interface UnitLinguisticMemoryRead {
  layerUnit: LayerUnitDocType | undefined;
  unitTexts: Awaited<ReturnType<typeof listUnitTextsByUnit>>;
  tokenRows: UnitTokenDocType[];
  morphemeRows: UnitMorphemeDocType[];
  layerRows: TierDefinitionDocType[];
  unitNotes: UserNoteDocType[];
  translationNoteRows: Array<{ textId: string; notes: UserNoteDocType[] }>;
  tokenNoteRows: Array<{ tokenId: string; notes: UserNoteDocType[] }>;
  morphemeNoteRows: Array<{ morphemeId: string; notes: UserNoteDocType[] }>;
}

async function listNotesByTarget(
  database: Awaited<ReturnType<typeof getDb>>,
  targetType: NoteTargetType,
  targetId: string,
): Promise<UserNoteDocType[]> {
  if (targetId.trim().length === 0) return [];
  return database.dexie.user_notes
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .toArray();
}

/** `null` when the database cannot be opened. Transaction errors still propagate. */
export async function readUnitLinguisticMemory(
  unitId: string,
  options: { includeNotes: boolean; includeMorphemes: boolean },
): Promise<UnitLinguisticMemoryRead | null> {
  let database: Awaited<ReturnType<typeof getDb>>;
  try {
    database = await getDb();
  } catch {
    return null;
  }

  return database.dexie.transaction(
    'r',
    [...dexieStoresForGetUnitLinguisticMemoryRead(database)],
    async () => {
      const [layerUnit, unitTexts, tokenRows, morphemeRows] = await Promise.all([
        database.dexie.layer_units.get(unitId),
        listUnitTextsByUnit(database, unitId),
        database.dexie.unit_tokens.where('unitId').equals(unitId).toArray(),
        options.includeMorphemes
          ? database.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()
          : Promise.resolve([]),
      ]);

      const layerIds = [
        ...new Set(
          unitTexts
            .map((row) => row.layerId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];

      const [layerRows, unitNotes, translationNoteRows, tokenNoteRows, morphemeNoteRows] =
        await Promise.all([
          layerIds.length > 0
            ? database.dexie.tier_definitions.where('id').anyOf(layerIds).toArray()
            : Promise.resolve([]),
          options.includeNotes ? listNotesByTarget(database, 'unit', unitId) : Promise.resolve([]),
          options.includeNotes
            ? Promise.all(
                unitTexts.map(async (row) => ({
                  textId: row.id,
                  notes: await listNotesByTarget(database, 'translation', row.id),
                })),
              )
            : Promise.resolve([]),
          options.includeNotes
            ? Promise.all(
                tokenRows.map(async (row) => ({
                  tokenId: row.id,
                  notes: await listNotesByTarget(database, 'token', row.id),
                })),
              )
            : Promise.resolve([]),
          options.includeNotes
            ? Promise.all(
                morphemeRows.map(async (row) => ({
                  morphemeId: row.id,
                  notes: await listNotesByTarget(database, 'morpheme', row.id),
                })),
              )
            : Promise.resolve([]),
        ]);

      return {
        layerUnit,
        unitTexts,
        tokenRows,
        morphemeRows,
        layerRows,
        unitNotes,
        translationNoteRows,
        tokenNoteRows,
        morphemeNoteRows,
      };
    },
  );
}
