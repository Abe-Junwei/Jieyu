import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './collaborationSupabaseFacade';
import type { CollaborationPresenceRecord, ProjectEntityType } from './syncTypes';
import { subscribeRealtimeChannel } from './realtimeSubscription';
import { asRecord, asString } from './cloudSyncConflictHelpers';

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

function toPresenceUpsertRow(record: CollaborationPresenceRecord): {
  project_id: string;
  user_id: string;
  display_name: string | null;
  state: 'online' | 'idle' | 'offline';
  focused_entity_type: ProjectEntityType | null;
  focused_entity_id: string | null;
  cursor_payload: Record<string, unknown> | null;
  last_seen_at: string;
} {
  return {
    project_id: record.projectId,
    user_id: record.userId,
    display_name: record.displayName ?? null,
    state: record.state,
    focused_entity_type: record.focusedEntityType ?? null,
    focused_entity_id: record.focusedEntityId ?? null,
    cursor_payload: record.cursorPayload ?? null,
    last_seen_at: record.lastSeenAt,
  };
}

/**
 * Persist presence row to `project_presence` (Supabase).
 */
export async function upsertCollaborationPresenceRecord(record: CollaborationPresenceRecord): Promise<void> {
  const client = getSupabaseBrowserClient();
  const { error } = await client
    .from('project_presence')
    .upsert(toPresenceUpsertRow(record), { onConflict: 'project_id,user_id' });
  if (error) throw error;
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

    await subscribeRealtimeChannel(channel, { channelLabel: 'Presence channel' });

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
