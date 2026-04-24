/**
 * 协同「同步状态徽章」门控 — 可单独单测的谓词。须与 `deriveCollaborationSyncBadge` 的**判定顺序**一致；靠前者优先。
 * collaboration sync badge gates — testable predicates; **order matters** (first match wins in `deriveCollaborationSyncBadge`).
 * @see docs/execution/collaboration-phase-surface-ARCH-6.md
 */

export interface CollaborationSyncSurfaceInput {
  supabaseConfigured: boolean;
  collaborationProjectId: string;
  isBridgeReady: boolean;
  protocolWritesDisabled: boolean;
  conflictTicketCount: number;
  pendingOutboundCount: number;
  browserOnline: boolean;
}

function hasProjectContext(input: Pick<CollaborationSyncSurfaceInput, 'supabaseConfigured' | 'collaborationProjectId'>): boolean {
  return input.supabaseConfigured && Boolean(input.collaborationProjectId);
}

function normalizedPending(input: Pick<CollaborationSyncSurfaceInput, 'pendingOutboundCount'>): number {
  return Math.max(0, Math.floor(input.pendingOutboundCount));
}

export function collaborationSyncSurfaceIsIdle(
  input: Pick<CollaborationSyncSurfaceInput, 'supabaseConfigured' | 'collaborationProjectId'>,
): boolean {
  return !input.supabaseConfigured || !input.collaborationProjectId;
}

export function collaborationSyncSurfaceIsConnecting(input: CollaborationSyncSurfaceInput): boolean {
  return hasProjectContext(input) && !input.isBridgeReady;
}

export function collaborationSyncSurfaceIsReadOnly(input: CollaborationSyncSurfaceInput): boolean {
  return hasProjectContext(input) && input.isBridgeReady && input.protocolWritesDisabled;
}

export function collaborationSyncSurfaceIsConflict(input: CollaborationSyncSurfaceInput): boolean {
  return (
    hasProjectContext(input) &&
    input.isBridgeReady &&
    !input.protocolWritesDisabled &&
    input.conflictTicketCount > 0
  );
}

export function collaborationSyncSurfaceIsOfflineQueue(input: CollaborationSyncSurfaceInput): boolean {
  const pending = normalizedPending(input);
  return (
    hasProjectContext(input) &&
    input.isBridgeReady &&
    !input.protocolWritesDisabled &&
    input.conflictTicketCount === 0 &&
    !input.browserOnline &&
    pending > 0
  );
}

export function collaborationSyncSurfaceIsSyncing(input: CollaborationSyncSurfaceInput): boolean {
  const pending = normalizedPending(input);
  return (
    hasProjectContext(input) &&
    input.isBridgeReady &&
    !input.protocolWritesDisabled &&
    input.conflictTicketCount === 0 &&
    input.browserOnline &&
    pending > 0
  );
}

/**
 * `deriveCollaborationSyncBadge` 在通过冲突门控后、又非 offline_queue / syncing 时的「与云端一致且队列为空」态（含离线+空队列=synced）。 |
 * “Synced” tail state: has context, bridge up, writes allowed, no conflicts, empty queue.
 */
export function collaborationSyncSurfaceIsFullySynced(input: CollaborationSyncSurfaceInput): boolean {
  const pending = normalizedPending(input);
  return (
    hasProjectContext(input) &&
    input.isBridgeReady &&
    !input.protocolWritesDisabled &&
    input.conflictTicketCount === 0 &&
    pending === 0
  );
}
