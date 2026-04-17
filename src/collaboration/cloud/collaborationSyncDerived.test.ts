import { describe, expect, it } from 'vitest';
import { deriveCollaborationSyncBadge } from './collaborationSyncDerived';

describe('deriveCollaborationSyncBadge', () => {
  const base = {
    supabaseConfigured: true,
    collaborationProjectId: 'p1',
    isBridgeReady: true,
    protocolWritesDisabled: false,
    conflictTicketCount: 0,
    pendingOutboundCount: 0,
    browserOnline: true,
  };

  it('returns idle when not configured or no project id', () => {
    expect(deriveCollaborationSyncBadge({ ...base, supabaseConfigured: false }).kind).toBe('idle');
    expect(deriveCollaborationSyncBadge({ ...base, collaborationProjectId: '' }).kind).toBe('idle');
  });

  it('returns connecting when bridge not ready', () => {
    expect(deriveCollaborationSyncBadge({ ...base, isBridgeReady: false }).kind).toBe('connecting');
  });

  it('prioritizes read_only over conflict', () => {
    expect(deriveCollaborationSyncBadge({
      ...base,
      protocolWritesDisabled: true,
      conflictTicketCount: 3,
    }).kind).toBe('read_only');
  });

  it('returns conflict when tickets exist', () => {
    expect(deriveCollaborationSyncBadge({ ...base, conflictTicketCount: 1 }).kind).toBe('conflict');
  });

  it('returns offline_queue when offline with pending', () => {
    expect(deriveCollaborationSyncBadge({
      ...base,
      browserOnline: false,
      pendingOutboundCount: 2,
    }).kind).toBe('offline_queue');
  });

  it('returns syncing when online with pending', () => {
    expect(deriveCollaborationSyncBadge({
      ...base,
      pendingOutboundCount: 2,
    }).kind).toBe('syncing');
  });

  it('returns synced when online with empty queue', () => {
    expect(deriveCollaborationSyncBadge({ ...base }).kind).toBe('synced');
  });
});
