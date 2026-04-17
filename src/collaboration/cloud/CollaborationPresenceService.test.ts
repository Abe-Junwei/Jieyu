import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationPresenceService } from './CollaborationPresenceService';

const {
  mockChannelFactory,
  mockChannelTrack,
  mockChannelSubscribe,
  presenceHandlers,
  snapshotRef,
} = vi.hoisted(() => {
  const mockChannelTrack = vi.fn<(payload: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const mockChannelSubscribe = vi.fn<(callback: (status: string) => void) => void>((callback) => {
    callback('SUBSCRIBED');
  });
  const presenceHandlers: Record<string, (() => void) | undefined> = {};
  const snapshotRef: { current: Record<string, unknown> } = { current: {} };

  const channel = {
    on: vi.fn((event: string, filter: { event?: string }, callback: () => void) => {
      if (event === 'presence' && filter.event) {
        presenceHandlers[filter.event] = callback;
      }
      return channel;
    }),
    subscribe: mockChannelSubscribe,
    unsubscribe: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    track: mockChannelTrack,
    presenceState: vi.fn(() => snapshotRef.current),
  };

  const mockChannelFactory = vi.fn(() => channel);

  return {
    mockChannelFactory,
    mockChannelTrack,
    mockChannelSubscribe,
    presenceHandlers,
    snapshotRef,
  };
});

vi.mock('./collaborationSupabaseFacade', () => ({
  getSupabaseBrowserClient: () => ({
    channel: mockChannelFactory,
  }),
}));

describe('CollaborationPresenceService', () => {
  beforeEach(() => {
    mockChannelFactory.mockClear();
    mockChannelTrack.mockClear();
    mockChannelSubscribe.mockClear();
    snapshotRef.current = {};
    for (const key of Object.keys(presenceHandlers)) {
      delete presenceHandlers[key];
    }
  });

  it('parses presence snapshot, dedupes members by latest timestamp, and emits on sync callbacks', async () => {
    snapshotRef.current = {
      'user-a': [
        {
          userId: 'user-a',
          displayName: 'Alpha',
          state: 'online',
          lastSeenAt: '2026-04-17T00:00:01.000Z',
        },
        {
          userId: 'user-a',
          displayName: 'Alpha',
          state: 'idle',
          focusedEntityType: 'layer_unit',
          focusedEntityId: 'seg-1',
          lastSeenAt: '2026-04-17T00:00:02.000Z',
        },
      ],
      'user-b': [
        {
          displayName: 'Bravo',
          state: 'online',
          focusedEntityType: 'text',
          focusedEntityId: 'text-1',
          lastSeenAt: '2026-04-17T00:00:03.000Z',
        },
      ],
    };

    const service = new CollaborationPresenceService();
    const onMembersChanged = vi.fn<(members: unknown[]) => void>();

    await service.connect({
      projectId: 'project-1',
      userId: 'user-self',
      displayName: 'Self',
    }, onMembersChanged);

    expect(mockChannelFactory).toHaveBeenCalledWith('project:project-1:presence', {
      config: {
        presence: {
          key: 'user-self',
        },
      },
    });
    expect(mockChannelTrack).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-self',
      displayName: 'Self',
      state: 'online',
    }));

    const members = service.getMembers();
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual(expect.objectContaining({
      userId: 'user-b',
      state: 'online',
      focusedEntityType: 'text',
      focusedEntityId: 'text-1',
    }));
    expect(members[1]).toEqual(expect.objectContaining({ userId: 'user-a', state: 'idle', focusedEntityId: 'seg-1' }));

    snapshotRef.current = {
      'user-a': [
        {
          userId: 'user-a',
          state: 'offline',
          lastSeenAt: '2026-04-17T00:00:05.000Z',
        },
      ],
    };
    presenceHandlers.sync?.();

    expect(onMembersChanged).toHaveBeenCalled();
    expect(service.getMembers()).toEqual([
      expect.objectContaining({ userId: 'user-a', state: 'offline' }),
    ]);

    await service.disconnect();
  });

  it('builds persisted record after connect and returns null before connect', async () => {
    const service = new CollaborationPresenceService();
    expect(service.toPersistedRecord({ state: 'online' })).toBeNull();

    await service.connect({
      projectId: 'project-9',
      userId: 'user-9',
      displayName: 'Nine',
    });

    const persisted = service.toPersistedRecord({
      state: 'idle',
      focusedEntityType: 'layer_unit',
      focusedEntityId: 'seg-9',
    });

    expect(persisted).toEqual(expect.objectContaining({
      projectId: 'project-9',
      userId: 'user-9',
      displayName: 'Nine',
      state: 'idle',
      focusedEntityType: 'layer_unit',
      focusedEntityId: 'seg-9',
    }));

    await service.disconnect();
  });
});
