// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  buildVerticalAdoptionEvidencePacketIds,
  canAcceptAdoptionItem,
  createAdoptionItem,
  transitionAdoptionItem,
  pruneExpiredItems,
  filterAdoptionItemsByStatus,
  buildAdoptionOutcomeAuditMetadata,
} from './adoptionQueue';
import type { VerticalWorkflowAuditMetadataV1 } from './verticalWorkflowAudit';

function makeItem(overrides: Partial<Parameters<typeof createAdoptionItem>[0]> = {}): ReturnType<typeof createAdoptionItem> {
  return createAdoptionItem({
    workflowId: 'segment_qa',
    requestId: 'req-001',
    summary: 'test summary',
    evidencePacketIds: ['ep-001'],
    ...overrides,
  });
}

function makeVerticalMeta(evidencePacketCount: number): VerticalWorkflowAuditMetadataV1 {
  return {
    schemaVersion: 1,
    phase: 'stream_completion',
    completionPath: 'stream_done',
    completionStatus: 'done',
    workflowId: 'segment_qa',
    writeMode: 'propose',
    outputKind: 'qa',
    envelope: {
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      evidencePacketCount,
    },
    selection: null,
  };
}

describe('createAdoptionItem', () => {
  it('creates item with pending status and generated id', () => {
    const item = makeItem();
    expect(item.status).toBe('pending');
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
  });
});

describe('buildVerticalAdoptionEvidencePacketIds', () => {
  it('uses max of envelope count and citation length', () => {
    const ids = buildVerticalAdoptionEvidencePacketIds({
      assistantMessageId: 'asst-1',
      metadata: makeVerticalMeta(2),
      citations: [{ type: 'unit', refId: 'u1' }, { type: 'unit', refId: 'u2' }, { type: 'unit', refId: 'u3' }],
    });
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('vertical_evidence:asst-1:0');
  });

  it('returns empty when no envelope packets and no citations', () => {
    const ids = buildVerticalAdoptionEvidencePacketIds({
      assistantMessageId: 'asst-1',
      metadata: makeVerticalMeta(0),
      citations: [],
    });
    expect(ids).toEqual([]);
  });
});

describe('canAcceptAdoptionItem', () => {
  it('is false when pending but no evidence ids', () => {
    const item = makeItem({ evidencePacketIds: [] });
    expect(canAcceptAdoptionItem(item)).toBe(false);
  });

  it('is true when pending with evidence', () => {
    expect(canAcceptAdoptionItem(makeItem())).toBe(true);
  });
});

describe('transitionAdoptionItem', () => {
  it('accepts pending item', () => {
    const item = makeItem();
    const next = transitionAdoptionItem(item, 'accept', { outcomeContent: 'accepted result' });
    expect(next.status).toBe('accepted');
    expect(next.outcomeContent).toBe('accepted result');
  });

  it('ignores pending item', () => {
    const item = makeItem();
    const next = transitionAdoptionItem(item, 'ignore', { reasonCode: 'not_relevant' });
    expect(next.status).toBe('ignored');
    expect(next.reasonCode).toBe('not_relevant');
  });

  it('copies pending item', () => {
    const item = makeItem();
    const next = transitionAdoptionItem(item, 'copy');
    expect(next.status).toBe('copied');
  });

  it('jump_to_evidence does not change status', () => {
    const item = makeItem();
    const next = transitionAdoptionItem(item, 'jump_to_evidence');
    expect(next.status).toBe('pending');
  });

  it('throws when accepting non-pending item', () => {
    const item = { ...makeItem(), status: 'accepted' as const };
    expect(() => transitionAdoptionItem(item, 'accept')).toThrow();
  });

  it('throws when accepting pending item without evidence', () => {
    const item = makeItem({ evidencePacketIds: [] });
    expect(() => transitionAdoptionItem(item, 'accept')).toThrow(/without evidence/);
  });
});

describe('pruneExpiredItems', () => {
  it('expires old pending items', () => {
    const oldItem = makeItem();
    oldItem.createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const state = pruneExpiredItems({ items: [oldItem] }, Date.now());
    expect(state.items[0]!.status).toBe('expired');
    expect(state.items[0]!.reasonCode).toBe('auto_expired');
  });

  it('does not expire recent items', () => {
    const recentItem = makeItem();
    const state = pruneExpiredItems({ items: [recentItem] }, Date.now());
    expect(state.items[0]!.status).toBe('pending');
  });
});

describe('filterAdoptionItemsByStatus', () => {
  it('filters by status', () => {
    const items = [
      makeItem(),
      { ...makeItem(), status: 'accepted' as const },
      { ...makeItem(), status: 'ignored' as const },
    ];
    expect(filterAdoptionItemsByStatus(items, 'pending')).toHaveLength(1);
    expect(filterAdoptionItemsByStatus(items, 'accepted')).toHaveLength(1);
  });
});

describe('buildAdoptionOutcomeAuditMetadata', () => {
  it('builds metadata for accept action', () => {
    const item = makeItem();
    const meta = buildAdoptionOutcomeAuditMetadata(item, 'accept');
    expect(meta.phase).toBe('adoption_outcome');
    expect(meta.action).toBe('accept');
    expect(meta.toStatus).toBe('accepted');
  });
});
