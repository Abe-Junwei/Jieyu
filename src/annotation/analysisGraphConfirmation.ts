import {
  getDb,
  withTransaction,
  type UnitRelationDocType,
  type ActorType,
  type JieyuDatabase,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { LayerUnitRelationQueryService } from '../services/LayerUnitRelationQueryService';
import { validateAnnotationAnalysisGraphFixture, type AnnotationAnalysisGraphFixture } from './analysisGraph';

export type AnalysisGraphCandidateActor = {
  type: ActorType;
  id?: string;
};

export type SubmitAnalysisGraphCandidateInput = {
  textId: string;
  unitId: string;
  candidateGraph: AnnotationAnalysisGraphFixture;
  actor?: AnalysisGraphCandidateActor;
};

export type AnalysisGraphCandidateRecord = UnitRelationDocType & {
  relationType: 'analysis_graph_candidate';
  analysisGraphCandidate: AnnotationAnalysisGraphFixture;
  analysisGraphStatus: 'pending' | 'accepted' | 'rejected';
};

export type ConfirmAnalysisGraphCandidateInput = SubmitAnalysisGraphCandidateInput & {
  /** @deprecated Use actor instead. */
  actorId?: string;
};

function normalizeCandidateActor(input: SubmitAnalysisGraphCandidateInput | ConfirmAnalysisGraphCandidateInput): AnalysisGraphCandidateActor {
  if ('actor' in input && input.actor) return input.actor;
  if ('actorId' in input && input.actorId) return { type: 'human', id: input.actorId };
  return { type: 'system' };
}

function resolveAnalysisGraphStatus(row: UnitRelationDocType): 'pending' | 'accepted' | 'rejected' {
  if (row.analysisGraphStatus) return row.analysisGraphStatus;
  const rs = row.provenance?.reviewStatus;
  if (rs === 'confirmed') return 'accepted';
  if (rs === 'rejected') return 'rejected';
  return 'pending';
}

function parseCandidateRelation(row: UnitRelationDocType): AnalysisGraphCandidateRecord {
  if (row.relationType !== 'analysis_graph_candidate') {
    throw new Error(`unit relation is not an analysis graph candidate: ${row.id}`);
  }
  if (!row.analysisGraphCandidate) {
    throw new Error(`analysis graph candidate is missing payload: ${row.id}`);
  }
  return {
    ...row,
    relationType: 'analysis_graph_candidate',
    analysisGraphCandidate: validateAnnotationAnalysisGraphFixture(row.analysisGraphCandidate),
    analysisGraphStatus: resolveAnalysisGraphStatus(row),
  };
}

async function listAnalysisGraphCandidateRows(db: JieyuDatabase, unitId: string): Promise<UnitRelationDocType[]> {
  return await LayerUnitRelationQueryService.listRelationsByUnitIds(
    [unitId],
    { relationType: 'analysis_graph_candidate' },
    db,
  );
}

export async function submitAnalysisGraphCandidate(
  input: SubmitAnalysisGraphCandidateInput,
): Promise<AnalysisGraphCandidateRecord> {
  const db = await getDb();
  const now = new Date().toISOString();
  const actor = normalizeCandidateActor(input);
  const candidateGraph = validateAnnotationAnalysisGraphFixture(input.candidateGraph);
  const doc: UnitRelationDocType = {
    id: newId('analysis_graph_candidate'),
    textId: input.textId,
    sourceUnitId: input.unitId,
    relationType: 'analysis_graph_candidate',
    linkType: 'projection',
    unitId: input.unitId,
    analysisGraphStatus: 'pending',
    analysisGraphCandidate: candidateGraph as unknown as Record<string, unknown>,
    provenance: {
      actorType: actor.type,
      ...(actor.id ? { actorId: actor.id } : {}),
      method: 'projection',
      createdAt: now,
      reviewStatus: 'suggested',
    },
    createdAt: now,
    updatedAt: now,
  };

  await withTransaction(db, 'rw', [db.dexie.unit_relations], async () => {
    const pendingPeers = await listAnalysisGraphCandidateRows(db, input.unitId);
    await Promise.all(pendingPeers
      .filter((row) => resolveAnalysisGraphStatus(row) === 'pending')
      .map((row) => db.collections.unit_relations.insert({
        ...row,
        analysisGraphStatus: 'rejected',
        provenance: {
          ...row.provenance,
          actorType: row.provenance?.actorType ?? 'system',
          method: row.provenance?.method ?? 'projection',
          createdAt: row.provenance?.createdAt ?? row.createdAt,
          updatedAt: now,
          reviewStatus: 'rejected',
        },
        updatedAt: now,
      })));
    await db.collections.unit_relations.insert(doc);
  }, { label: 'submitAnalysisGraphCandidate' });

  return parseCandidateRelation(doc);
}

export async function confirmAnalysisGraphCandidate(
  input: ConfirmAnalysisGraphCandidateInput,
): Promise<AnalysisGraphCandidateRecord> {
  return submitAnalysisGraphCandidate(input);
}

export async function listPendingAnalysisGraphCandidates(unitId: string): Promise<AnalysisGraphCandidateRecord[]> {
  const db = await getDb();
  const rows = await listAnalysisGraphCandidateRows(db, unitId);
  return rows
    .map(parseCandidateRelation)
    .filter((row) => row.analysisGraphStatus === 'pending');
}

async function updateAnalysisGraphCandidateStatus(
  id: string,
  status: 'accepted' | 'rejected',
  actor?: AnalysisGraphCandidateActor,
): Promise<AnalysisGraphCandidateRecord> {
  const db = await getDb();
  const existing = await LayerUnitRelationQueryService.getRelationById(id, db);
  if (!existing) {
    throw new Error(`analysis graph candidate not found: ${id}`);
  }
  const parsed = parseCandidateRelation(existing);
  const now = new Date().toISOString();
  const next: UnitRelationDocType = {
    ...parsed,
    analysisGraphCandidate: parsed.analysisGraphCandidate as unknown as Record<string, unknown>,
    analysisGraphStatus: status,
    manualConfirmed: status === 'accepted' ? true : parsed.manualConfirmed,
    provenance: {
      ...parsed.provenance,
      actorType: actor?.type ?? parsed.provenance?.actorType ?? 'human',
      ...(actor?.id ? { actorId: actor.id } : {}),
      method: parsed.provenance?.method ?? 'projection',
      createdAt: parsed.provenance?.createdAt ?? parsed.createdAt,
      updatedAt: now,
      reviewStatus: status === 'accepted' ? 'confirmed' : 'rejected',
    },
    updatedAt: now,
  };
  await withTransaction(db, 'rw', [db.dexie.unit_relations], async () => {
    if (status === 'accepted' && parsed.unitId) {
      const peers = await listAnalysisGraphCandidateRows(db, parsed.unitId);
      const otherAccepted = peers.some((row) => row.id !== id && (row.analysisGraphStatus ?? resolveAnalysisGraphStatus(row)) === 'accepted');
      if (otherAccepted) {
        throw new Error(`an accepted analysis graph candidate already exists for unit ${parsed.unitId}`);
      }
    }
    await db.collections.unit_relations.insert(next);
  }, { label: 'updateAnalysisGraphCandidateStatus' });
  return parseCandidateRelation(next);
}

export async function acceptAnalysisGraphCandidate(
  id: string,
  actor?: AnalysisGraphCandidateActor,
): Promise<AnalysisGraphCandidateRecord> {
  return updateAnalysisGraphCandidateStatus(id, 'accepted', actor);
}

export async function rejectAnalysisGraphCandidate(
  id: string,
  actor?: AnalysisGraphCandidateActor,
): Promise<AnalysisGraphCandidateRecord> {
  return updateAnalysisGraphCandidateStatus(id, 'rejected', actor);
}
