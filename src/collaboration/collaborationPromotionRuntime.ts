export type CollaborationPhaseId = 'm10' | 'm11' | 'm12' | 'm13';
export type CollaborationGateDecision = 'go' | 'go-with-gray' | 'no-go';

export interface CollaborationPhaseGateStatus {
  phaseId: CollaborationPhaseId;
  decision: CollaborationGateDecision;
  generatedAt: string;
  p0Count: number;
  p1Count: number;
  p2Count: number;
}

export interface CollaborationPromotionReadiness {
  ready: boolean;
  blockingPhaseIds: CollaborationPhaseId[];
  grayPhaseIds: CollaborationPhaseId[];
  digest: string;
}

export interface CollaborationPromotionStage {
  stage: 'hold' | 'gray' | 'full';
  reason: string;
  requiredApprovals: string[];
}

export interface CollaborationRollbackWatchItem {
  phaseId: CollaborationPhaseId;
  trigger: string;
  owner: string;
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const PHASE_ORDER: CollaborationPhaseId[] = ['m10', 'm11', 'm12', 'm13'];

export function collectPhaseGateStatuses(statuses: CollaborationPhaseGateStatus[]): CollaborationPhaseGateStatus[] {
  const deduped = new Map<CollaborationPhaseId, CollaborationPhaseGateStatus>();
  for (const status of statuses) {
    deduped.set(status.phaseId, status);
  }
  return PHASE_ORDER
    .filter((phaseId) => deduped.has(phaseId))
    .map((phaseId) => deduped.get(phaseId)!);
}

export function evaluatePromotionReadiness(statuses: CollaborationPhaseGateStatus[]): CollaborationPromotionReadiness {
  const normalized = collectPhaseGateStatuses(statuses);
  const blockingPhaseIds = normalized
    .filter((status) => status.decision === 'no-go' || status.p0Count > 0)
    .map((status) => status.phaseId);
  const grayPhaseIds = normalized
    .filter((status) => status.decision === 'go-with-gray' || status.p1Count > 0)
    .map((status) => status.phaseId);

  return {
    ready: normalized.length === PHASE_ORDER.length && blockingPhaseIds.length === 0,
    blockingPhaseIds,
    grayPhaseIds,
    digest: hashString(JSON.stringify(normalized)),
  };
}

export function determinePromotionStage(readiness: CollaborationPromotionReadiness): CollaborationPromotionStage {
  if (readiness.blockingPhaseIds.length > 0) {
    return {
      stage: 'hold',
      reason: `blocking phases: ${readiness.blockingPhaseIds.join(', ')}`,
      requiredApprovals: ['release-manager', 'tech-lead'],
    };
  }
  if (readiness.grayPhaseIds.length > 0) {
    return {
      stage: 'gray',
      reason: `gray rollout required for phases: ${readiness.grayPhaseIds.join(', ')}`,
      requiredApprovals: ['release-manager'],
    };
  }
  return {
    stage: 'full',
    reason: 'all collaboration phases are green',
    requiredApprovals: ['release-manager'],
  };
}

export function buildRollbackWatchlist(statuses: CollaborationPhaseGateStatus[]): CollaborationRollbackWatchItem[] {
  return collectPhaseGateStatuses(statuses)
    .filter((status) => status.decision !== 'go' || status.p1Count > 0 || status.p2Count > 0)
    .map((status) => ({
      phaseId: status.phaseId,
      trigger: status.decision === 'no-go'
        ? 'reopen blocking gate immediately'
        : status.p1Count > 0
          ? 'watch gray findings during rollout'
          : 'observe non-blocking findings post-release',
      owner: status.phaseId === 'm10' || status.phaseId === 'm11' ? 'collaboration-owner' : 'release-manager',
    }));
}
