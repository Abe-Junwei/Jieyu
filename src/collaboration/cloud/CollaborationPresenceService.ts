import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../integrations/supabase/client';
import type { CollaborationPresenceRecord, ProjectEntityType } from './syncTypes';

export interface PresenceConnectionInput {
  projectId: string;
  userId: string;
  displayName?: string;
}

export interface PresenceStatePatch {
  state: 'online' | 'idle' | 'offline';
  focusedEntityType?: ProjectEntityType;
  focusedEntityId?: string;
  cursorPayload?: Record<string, unknown>;
}

export interface CollaborationPresenceLiveMember {
  userId: string;
  displayName?: string;
  state: 'online' | 'idle' | 'offline';
  focusedEntityType?: ProjectEntityType;
  focusedEntityId?: string;
  cursorPayload?: Record<string, unknown>;
  lastSeenAt?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asProjectEntityType(value: unknown): ProjectEntityType | null {
  const candidate = asString(value);
  if (!candidate) return null;
  const allowed: ProjectEntityType[] = ['text', 'layer', 'layer_unit', 'layer_unit_content', 'unit_relation', 'asset', 'comment'];
  return allowed.includes(candidate as ProjectEntityType) ? (candidate as ProjectEntityType) : null;
}

function asPresenceState(value: unknown): 'online' | 'idle' | 'offline' {
  return value === 'idle' || value === 'offline' ? value : 'online';
}

function parseLiveMember(rawMember: unknown, fallbackUserId: string): CollaborationPresenceLiveMember | null {
  const source = asRecord(rawMember);
  if (!source) return null;

  const userId = asString(source.userId) ?? fallbackUserId;
  if (!userId) return null;
  const displayName = asString(source.displayName);
  const focusedEntityType = asProjectEntityType(source.focusedEntityType);
  const focusedEntityId = asString(source.focusedEntityId);
  const cursorPayload = asRecord(source.cursorPayload);
  const lastSeenAt = asString(source.lastSeenAt);

  return {
    userId,
    ...(displayName ? { displayName } : {}),
    state: asPresenceState(source.state),
    ...(focusedEntityType ? { focusedEntityType } : {}),
    ...(focusedEntityId ? { focusedEntityId } : {}),
    ...(cursorPayload ? { cursorPayload } : {}),
    ...(lastSeenAt ? { lastSeenAt } : {}),
  };
}

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parsePresenceStateSnapshot(stateSnapshot: Record<string, unknown>): CollaborationPresenceLiveMember[] {
  const memberByUserId = new Map<string, CollaborationPresenceLiveMember>();

  for (const [presenceKey, rawEntries] of Object.entries(stateSnapshot)) {
    if (!Array.isArray(rawEntries)) continue;
    for (const rawEntry of rawEntries) {
      const member = parseLiveMember(rawEntry, presenceKey);
      if (!member) continue;
      const existing = memberByUserId.get(member.userId);
      if (!existing || toTimestamp(member.lastSeenAt) >= toTimestamp(existing.lastSeenAt)) {
        memberByUserId.set(member.userId, member);
      }
    }
  }

  return [...memberByUserId.values()].sort((left, right) => {
    const timeDelta = toTimestamp(right.lastSeenAt) - toTimestamp(left.lastSeenAt);
    if (timeDelta !== 0) return timeDelta;
    return left.userId.localeCompare(right.userId);
  });
}

function createChannelName(projectId: string): string {
  return `project:${projectId}:presence`;
}

const DEFAULT_SUBSCRIBE_TIMEOUT_MS = 15_000;

function subscribeChannel(channel: RealtimeChannel, timeoutMs = DEFAULT_SUBSCRIBE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Presence channel subscribe timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    channel.subscribe((status) => {
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timer);
        resolve();
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Presence channel subscribe failed: ${status}`));
      }
    });
  });
}

export class CollaborationPresenceService {
  private channel: RealtimeChannel | null = null;
  private connection: PresenceConnectionInput | null = null;
  private members: CollaborationPresenceLiveMember[] = [];
  private onMembersChanged: ((members: CollaborationPresenceLiveMember[]) => void) | undefined;

  private emitMembersChanged(): void {
    this.onMembersChanged?.([...this.members]);
  }

  private refreshMembersFromChannel(): void {
    if (!this.channel) {
      this.members = [];
      this.emitMembersChanged();
      return;
    }
    const snapshot = this.channel.presenceState();
    this.members = parsePresenceStateSnapshot(snapshot as Record<string, unknown>);
    this.emitMembersChanged();
  }

  async connect(input: PresenceConnectionInput, onMembersChanged?: (members: CollaborationPresenceLiveMember[]) => void): Promise<void> {
    await this.disconnect();

    const client = getSupabaseBrowserClient();
    const channel = client.channel(createChannelName(input.projectId), {
      config: {
        presence: {
          key: input.userId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        this.refreshMembersFromChannel();
      })
      .on('presence', { event: 'join' }, () => {
        this.refreshMembersFromChannel();
      })
      .on('presence', { event: 'leave' }, () => {
        this.refreshMembersFromChannel();
      });

    await subscribeChannel(channel);

    this.channel = channel;
    this.connection = input;
    this.onMembersChanged = onMembersChanged;

    await this.update({ state: 'online' });
    this.refreshMembersFromChannel();
  }

  async update(patch: PresenceStatePatch): Promise<void> {
    if (!this.channel || !this.connection) {
      return;
    }

    await this.channel.track({
      userId: this.connection.userId,
      ...(this.connection.displayName ? { displayName: this.connection.displayName } : {}),
      state: patch.state,
      ...(patch.focusedEntityType ? { focusedEntityType: patch.focusedEntityType } : {}),
      ...(patch.focusedEntityId ? { focusedEntityId: patch.focusedEntityId } : {}),
      ...(patch.cursorPayload ? { cursorPayload: patch.cursorPayload } : {}),
      lastSeenAt: new Date().toISOString(),
    });
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
    this.connection = null;
    this.onMembersChanged = undefined;
    this.members = [];
  }

  getMembers(): CollaborationPresenceLiveMember[] {
    return [...this.members];
  }

  toPersistedRecord(patch: PresenceStatePatch): CollaborationPresenceRecord | null {
    if (!this.connection) return null;

    return {
      projectId: this.connection.projectId,
      userId: this.connection.userId,
      ...(this.connection.displayName ? { displayName: this.connection.displayName } : {}),
      state: patch.state,
      ...(patch.focusedEntityType ? { focusedEntityType: patch.focusedEntityType } : {}),
      ...(patch.focusedEntityId ? { focusedEntityId: patch.focusedEntityId } : {}),
      ...(patch.cursorPayload ? { cursorPayload: patch.cursorPayload } : {}),
      lastSeenAt: new Date().toISOString(),
    };
  }
}
