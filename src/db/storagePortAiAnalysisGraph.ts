import { LayerUnitRelationQueryService } from '../services/LayerUnitRelationQueryService';
import { getDb } from './engine';
import { validateUnitRelationDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { UnitRelationDocType } from './types';
import { withTransaction } from './withTransaction';

function resolveAnalysisGraphStatus(row: UnitRelationDocType): 'pending' | 'accepted' | 'rejected' {
  if (row.analysisGraphStatus !== undefined) return row.analysisGraphStatus;
  const reviewStatus = row.provenance?.reviewStatus;
  if (reviewStatus === 'confirmed') return 'accepted';
  if (reviewStatus === 'rejected') return 'rejected';
  return 'pending';
}

function rethrowStorageReadback(error: unknown): never {
  if (error instanceof StorageReadbackError) throw error;
  if (error instanceof Error && error.cause instanceof StorageReadbackError) throw error.cause;
  throw error;
}

async function putUnitRelation(
  database: Awaited<ReturnType<typeof getDb>>,
  doc: UnitRelationDocType,
  operation: string,
): Promise<void> {
  validateUnitRelationDoc(doc);
  await database.dexie.transaction('rw', database.dexie.unit_relations, async () => {
    await database.dexie.unit_relations.put(doc);
    const stored = await database.dexie.unit_relations.get(doc.id);
    if (!stored || stored.id !== doc.id) throw new StorageReadbackError(operation);
  });
}

export async function rejectPendingAnalysisGraphCandidatesAndInsert(input: {
  unitId: string;
  doc: UnitRelationDocType;
  now: string;
}): Promise<void> {
  const database = await getDb();
  try {
    await withTransaction(
      database,
      'rw',
      [database.dexie.unit_relations],
      async () => {
        const pendingPeers = await LayerUnitRelationQueryService.listRelationsByUnitIds(
          [input.unitId],
          { relationType: 'analysis_graph_candidate' },
          database,
        );
        await Promise.all(
          pendingPeers
            .filter((row) => resolveAnalysisGraphStatus(row) === 'pending')
            .map((row) =>
              putUnitRelation(
                database,
                {
                  ...row,
                  analysisGraphStatus: 'rejected',
                  provenance: {
                    ...row.provenance,
                    actorType: row.provenance?.actorType ?? 'system',
                    method: row.provenance?.method ?? 'projection',
                    createdAt: row.provenance?.createdAt ?? row.createdAt,
                    updatedAt: input.now,
                    reviewStatus: 'rejected',
                  },
                  updatedAt: input.now,
                },
                'rejectPendingAnalysisGraphCandidatesAndInsert',
              ),
            ),
        );
        await putUnitRelation(database, input.doc, 'rejectPendingAnalysisGraphCandidatesAndInsert');
      },
      { label: 'submitAnalysisGraphCandidate' },
    );
  } catch (error) {
    rethrowStorageReadback(error);
  }
}

export async function writeAnalysisGraphCandidateStatus(input: {
  id: string;
  next: UnitRelationDocType;
  exclusiveAcceptUnitId?: string;
}): Promise<void> {
  const database = await getDb();
  try {
    await withTransaction(
      database,
      'rw',
      [database.dexie.unit_relations],
      async () => {
        const exclusiveAcceptUnitId = input.exclusiveAcceptUnitId?.trim() ?? '';
        if (exclusiveAcceptUnitId.length > 0) {
          const peers = await LayerUnitRelationQueryService.listRelationsByUnitIds(
            [exclusiveAcceptUnitId],
            { relationType: 'analysis_graph_candidate' },
            database,
          );
          const otherAccepted = peers.some(
            (row) =>
              row.id !== input.id &&
              (row.analysisGraphStatus ?? resolveAnalysisGraphStatus(row)) === 'accepted',
          );
          if (otherAccepted) {
            throw new Error(
              `an accepted analysis graph candidate already exists for unit ${exclusiveAcceptUnitId}`,
            );
          }
        }
        await putUnitRelation(database, input.next, 'writeAnalysisGraphCandidateStatus');
      },
      { label: 'updateAnalysisGraphCandidateStatus' },
    );
  } catch (error) {
    rethrowStorageReadback(error);
  }
}
