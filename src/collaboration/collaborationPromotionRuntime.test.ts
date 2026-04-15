import { describe, expect, it } from 'vitest';
import {
  buildRollbackWatchlist,
  collectPhaseGateStatuses,
  determinePromotionStage,
  evaluatePromotionReadiness,
  type CollaborationPhaseGateStatus,
} from './collaborationPromotionRuntime';

function buildStatus(overrides?: Partial<CollaborationPhaseGateStatus>): CollaborationPhaseGateStatus {
  return {
    phaseId: 'm10',
    decision: 'go',
    generatedAt: '2026-04-14T00:00:00.000Z',
    p0Count: 0,
    p1Count: 0,
    p2Count: 0,
    ...overrides,
  };
}

describe('collaboration promotion runtime', () => {
  it('[aggregate] normalizes phase order and deduplicates by phase id', () => {
    const statuses = collectPhaseGateStatuses([
      buildStatus({ phaseId: 'm13', generatedAt: 'old' }),
      buildStatus({ phaseId: 'm10' }),
      buildStatus({ phaseId: 'm13', generatedAt: 'new', decision: 'go-with-gray', p1Count: 1 }),
    ]);

    expect(statuses.map((item) => item.phaseId)).toEqual(['m10', 'm13']);
    expect(statuses[1]?.generatedAt).toBe('new');
  });

  it('[readiness] is ready only when m10-m13 are all present and none are blocking', () => {
    const readiness = evaluatePromotionReadiness([
      buildStatus({ phaseId: 'm10' }),
      buildStatus({ phaseId: 'm11' }),
      buildStatus({ phaseId: 'm12' }),
      buildStatus({ phaseId: 'm13' }),
    ]);

    expect(readiness.ready).toBe(true);
    expect(readiness.blockingPhaseIds).toEqual([]);
    expect(readiness.grayPhaseIds).toEqual([]);
  });

  it('[stage] selects gray rollout when any phase is go-with-gray', () => {
    const readiness = evaluatePromotionReadiness([
      buildStatus({ phaseId: 'm10' }),
      buildStatus({ phaseId: 'm11', decision: 'go-with-gray', p1Count: 1 }),
      buildStatus({ phaseId: 'm12' }),
      buildStatus({ phaseId: 'm13' }),
    ]);

    const stage = determinePromotionStage(readiness);
    expect(stage.stage).toBe('gray');
    expect(stage.reason).toContain('m11');
  });

  it('[rollback] creates watch items for gray and observation phases', () => {
    const watchlist = buildRollbackWatchlist([
      buildStatus({ phaseId: 'm10', decision: 'go-with-gray', p1Count: 1 }),
      buildStatus({ phaseId: 'm11', p2Count: 2 }),
      buildStatus({ phaseId: 'm12' }),
    ]);

    expect(watchlist).toHaveLength(2);
    expect(watchlist[0]).toMatchObject({ phaseId: 'm10', owner: 'collaboration-owner' });
    expect(watchlist[1]).toMatchObject({ phaseId: 'm11', owner: 'collaboration-owner' });
  });
});
