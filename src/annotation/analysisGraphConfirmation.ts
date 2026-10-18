import {
  rejectPendingAnalysisGraphCandidatesAndInsert,
  writeAnalysisGraphCandidateStatus,
} from '../db/storagePortAiAnalysisGraph';
import type { ActorType, UnitRelationDocType } from '../db/types';
import { newId } from '../utils/transcriptionFormatters';
import { LayerUnitRelationQueryService } from '../services/LayerUnitRelationQueryService';
import {
  validateAnnotationAnalysisGraphFixture,
  type AnnotationAnalysisGraphFixture,
} from './analysisGraph';

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

type ConfirmAnalysisGraphCandidateInput = SubmitAnalysisGraphCandidateInput & {
  /** @deprecated Use actor instead. */
  actorId?: string;
};

function normalizeCandidateActor(
  input: SubmitAnalysisGraphCandidateInput | ConfirmAnalysisGraphCandidateInput,
): AnalysisGraphCandidateActor {
  if ('actor' in input && input.actor !== undefined) return input.actor;
  if ('actorId' in input && input.actorId !== undefined && input.actorId.length > 0)
    return { type: 'human', id: input.actorId };
  return { type: 'system' };
}

function resolveAnalysisGraphStatus(row: UnitRelationDocType): 'pending' | 'accepted' | 'rejected' {
  if (row.analysisGraphStatus !== undefined) return row.analysisGraphStatus;
  const rs = row.provenance?.reviewStatus;
  if (rs === 'confirmed') return 'accepted';
  if (rs === 'rejected') return 'rejected';
  return 'pending';
}

function parseCandidateRelation(row: UnitRelationDocType): AnalysisGraphCandidateRecord {
  if (row.relationType !== 'analysis_graph_candidate') {
    throw new Error(`unit relation is not an analysis graph candidate: ${row.id}`);
  }
  if (row.analysisGraphCandidate === undefined) {
    throw new Error(`analysis graph candidate is missing payload: ${row.id}`);
  }
  return {
    ...row,
    relationType: 'analysis_graph_candidate',
    analysisGraphCandidate: validateAnnotationAnalysisGraphFixture(row.analysisGraphCandidate),
    analysisGraphStatus: resolveAnalysisGraphStatus(row),
  };
}

async function listAnalysisGraphCandidateRows(unitId: string): Promise<UnitRelationDocType[]> {
  return LayerUnitRelationQueryService.listRelationsByUnitIds([unitId], {
    relationType: 'analysis_graph_candidate',
  });
}

export async function submitAnalysisGraphCandidate(
  input: SubmitAnalysisGraphCandidateInput,
): Promise<AnalysisGraphCandidateRecord> {
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
      ...(actor.id !== undefined && actor.id.length > 0 ? { actorId: actor.id } : {}),
      method: 'projection',
      createdAt: now,
      reviewStatus: 'suggested',
    },
    createdAt: now,
    updatedAt: now,
  };

  await rejectPendingAnalysisGraphCandidatesAndInsert({
    unitId: input.unitId,
    doc,
    now,
  });

  return parseCandidateRelation(doc);
}

export async function listPendingAnalysisGraphCandidates(
  unitId: string,
): Promise<AnalysisGraphCandidateRecord[]> {
  const rows = await listAnalysisGraphCandidateRows(unitId);
  return rows.map(parseCandidateRelation).filter((row) => row.analysisGraphStatus === 'pending');
}

async function updateAnalysisGraphCandidateStatus(
  id: string,
  status: 'accepted' | 'rejected',
  actor?: AnalysisGraphCandidateActor,
): Promise<AnalysisGraphCandidateRecord> {
  const existing = await LayerUnitRelationQueryService.getRelationById(id);
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
      ...(actor?.id !== undefined && actor.id.length > 0 ? { actorId: actor.id } : {}),
      method: parsed.provenance?.method ?? 'projection',
      createdAt: parsed.provenance?.createdAt ?? parsed.createdAt,
      updatedAt: now,
      reviewStatus: status === 'accepted' ? 'confirmed' : 'rejected',
    },
    updatedAt: now,
  };
  await writeAnalysisGraphCandidateStatus({
    id,
    next,
    ...(status === 'accepted' && parsed.unitId !== undefined && parsed.unitId.length > 0
      ? { exclusiveAcceptUnitId: parsed.unitId }
      : {}),
  });
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
