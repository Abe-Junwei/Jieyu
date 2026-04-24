import { describe, expect, it } from 'vitest';
import {
  collaborationSyncSurfaceIsConflict,
  collaborationSyncSurfaceIsConnecting,
  collaborationSyncSurfaceIsFullySynced,
  collaborationSyncSurfaceIsIdle,
  collaborationSyncSurfaceIsOfflineQueue,
  collaborationSyncSurfaceIsReadOnly,
  collaborationSyncSurfaceIsSyncing,
  type CollaborationSyncSurfaceInput,
} from './collaborationSyncSurfaceGates';

const postBridge: CollaborationSyncSurfaceInput = {
  supabaseConfigured: true,
  collaborationProjectId: 'p1',
  isBridgeReady: true,
  protocolWritesDisabled: false,
  conflictTicketCount: 0,
  pendingOutboundCount: 0,
  browserOnline: true,
};

describe('collaborationSyncSurfaceGates', () => {
  it('idle: missing config or project id', () => {
    expect(collaborationSyncSurfaceIsIdle({ supabaseConfigured: false, collaborationProjectId: 'p1' })).toBe(true);
    expect(collaborationSyncSurfaceIsIdle({ supabaseConfigured: true, collaborationProjectId: '' })).toBe(true);
    expect(collaborationSyncSurfaceIsIdle({ supabaseConfigured: true, collaborationProjectId: 'p1' })).toBe(false);
  });

  it('connecting: has project but bridge not ready', () => {
    expect(collaborationSyncSurfaceIsConnecting({ ...postBridge, isBridgeReady: false })).toBe(true);
    expect(collaborationSyncSurfaceIsConnecting(postBridge)).toBe(false);
  });

  it('fully synced predicate matches empty queue after conflict layer', () => {
    expect(collaborationSyncSurfaceIsFullySynced(postBridge)).toBe(true);
    expect(collaborationSyncSurfaceIsFullySynced({ ...postBridge, pendingOutboundCount: 1 })).toBe(false);
  });

  it('conflict and read_only are mutually exclusive with post-bridge + writes path', () => {
    expect(collaborationSyncSurfaceIsReadOnly({ ...postBridge, protocolWritesDisabled: true })).toBe(true);
    expect(collaborationSyncSurfaceIsConflict({ ...postBridge, conflictTicketCount: 1 })).toBe(true);
  });

  it('offline_queue vs syncing split by browserOnline with pending', () => {
    expect(
      collaborationSyncSurfaceIsOfflineQueue({ ...postBridge, browserOnline: false, pendingOutboundCount: 2 }),
    ).toBe(true);
    expect(
      collaborationSyncSurfaceIsSyncing({ ...postBridge, browserOnline: true, pendingOutboundCount: 2 }),
    ).toBe(true);
  });
});
