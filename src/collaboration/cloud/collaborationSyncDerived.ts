/**
 * 协同同步 UI 派生状态 | Derived collaboration sync surface state for UI
 */

export type CollaborationSyncBadgeKind =
  | 'idle'
  | 'connecting'
  | 'read_only'
  | 'conflict'
  | 'offline_queue'
  | 'syncing'
  | 'synced';

export interface CollaborationSyncBadgeState {
  kind: CollaborationSyncBadgeKind;
  pendingOutboundCount: number;
}

/** 云项目目录行 | Cloud project row for directory UI */
export interface CollaborationCloudDirectoryProject {
  id: string;
  name: string;
  visibility: string;
  updatedAt: string;
  latestRevision: number;
}

/** 云项目成员行 | Cloud project member row for directory UI */
export interface CollaborationCloudDirectoryMember {
  userId: string;
  role: string;
  joinedAt: string;
  disabledAt: string | null;
}

export function deriveCollaborationSyncBadge(input: {
  supabaseConfigured: boolean;
  collaborationProjectId: string;
  isBridgeReady: boolean;
  protocolWritesDisabled: boolean;
  conflictTicketCount: number;
  pendingOutboundCount: number;
  browserOnline: boolean;
}): CollaborationSyncBadgeState {
  const pending = Math.max(0, Math.floor(input.pendingOutboundCount));
  if (!input.supabaseConfigured || !input.collaborationProjectId) {
    return { kind: 'idle', pendingOutboundCount: pending };
  }
  if (!input.isBridgeReady) {
    return { kind: 'connecting', pendingOutboundCount: pending };
  }
  if (input.protocolWritesDisabled) {
    return { kind: 'read_only', pendingOutboundCount: pending };
  }
  if (input.conflictTicketCount > 0) {
    return { kind: 'conflict', pendingOutboundCount: pending };
  }
  if (!input.browserOnline && pending > 0) {
    return { kind: 'offline_queue', pendingOutboundCount: pending };
  }
  if (pending > 0) {
    return { kind: 'syncing', pendingOutboundCount: pending };
  }
  return { kind: 'synced', pendingOutboundCount: 0 };
}
