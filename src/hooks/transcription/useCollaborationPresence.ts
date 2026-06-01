import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../../observability/logger';
import {
  CollaborationPresenceService,
  upsertCollaborationPresenceRecord,
  type CollaborationPresenceLiveMember,
  type PresenceStatePatch,
} from '../../collaboration/cloud/CollaborationPresenceService';
import {
  getSupabaseUserId,
  hasSupabaseBrowserClientConfig,
} from '../../collaboration/cloud/collaborationSupabaseFacade';
import { toPresencePersistKey } from '../../collaboration/cloud/cloudSyncConflictHelpers';
import type { ProjectEntityType } from '../../collaboration/cloud/syncTypes';

const log = createLogger('useCollaborationPresence');

export interface UseCollaborationPresenceParams {
  phase: string;
  collaborationProjectId: string;
  isBridgeReady: boolean;
  presenceDisplayName?: string;
  presenceFocus?: {
    entityType?: ProjectEntityType;
    entityId?: string;
  };
}

export interface UseCollaborationPresenceResult {
  presenceMembers: CollaborationPresenceLiveMember[];
  presenceCurrentUserId: string;
}

export function useCollaborationPresence({
  phase,
  collaborationProjectId,
  isBridgeReady,
  presenceDisplayName,
  presenceFocus,
}: UseCollaborationPresenceParams): UseCollaborationPresenceResult {
  const [presenceMembers, setPresenceMembers] = useState<CollaborationPresenceLiveMember[]>([]);
  const [presenceCurrentUserId, setPresenceCurrentUserId] = useState('');
  const presenceServiceRef = useRef<CollaborationPresenceService | null>(null);
  const latestPresenceStateRef = useRef<'online' | 'idle' | 'offline'>('offline');
  const persistedPresenceKeyRef = useRef('');
  const latestFocusKeyRef = useRef('');

  const persistPresencePatch = useCallback(async (patch: PresenceStatePatch): Promise<void> => {
    const service = presenceServiceRef.current;
    if (!service) return;

    const persisted = service.toPersistedRecord(patch);
    if (!persisted) return;

    const nextPersistKey = toPresencePersistKey(persisted);
    if (persistedPresenceKeyRef.current === nextPersistKey) {
      return;
    }

    if (!hasSupabaseBrowserClientConfig()) {
      persistedPresenceKeyRef.current = nextPersistKey;
      return;
    }

    await upsertCollaborationPresenceRecord(persisted);
    persistedPresenceKeyRef.current = nextPersistKey;
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    if (!collaborationProjectId) return;
    if (!isBridgeReady) return;
    if (!hasSupabaseBrowserClientConfig()) return;

    let cancelled = false;
    const service = new CollaborationPresenceService();
    presenceServiceRef.current = service;
    latestPresenceStateRef.current = 'offline';
    persistedPresenceKeyRef.current = '';
    latestFocusKeyRef.current = '';

    const bootstrapPresence = async () => {
      const userId = await getSupabaseUserId();
      if (!userId || cancelled) return;

      setPresenceCurrentUserId(userId);

      await service.connect(
        {
          projectId: collaborationProjectId,
          userId,
          ...(presenceDisplayName ? { displayName: presenceDisplayName } : {}),
        },
        (members) => {
          if (cancelled) return;
          setPresenceMembers(members.filter((member) => member.state !== 'offline'));
        },
      );

      const initialPresenceState: 'online' | 'idle' =
        typeof document !== 'undefined' && document.visibilityState === 'hidden'
          ? 'idle'
          : 'online';
      if (initialPresenceState === 'idle') {
        await service.update({ state: 'idle' });
      }
      await persistPresencePatch({ state: initialPresenceState });
      latestPresenceStateRef.current = initialPresenceState;
    };

    void bootstrapPresence().catch((error) => {
      log.warn('failed to connect presence', { err: error });
    });

    return () => {
      cancelled = true;
      setPresenceMembers([]);
      setPresenceCurrentUserId('');
      persistedPresenceKeyRef.current = '';
      latestPresenceStateRef.current = 'offline';
      latestFocusKeyRef.current = '';

      const current = presenceServiceRef.current;
      if (!current) return;

      void (async () => {
        try {
          await current.update({ state: 'offline' });
          await persistPresencePatch({ state: 'offline' });
          latestPresenceStateRef.current = 'offline';
        } catch (error) {
          log.warn('failed to mark presence offline', { err: error });
        } finally {
          await current.disconnect();
          if (presenceServiceRef.current === current) {
            presenceServiceRef.current = null;
          }
        }
      })();
    };
  }, [collaborationProjectId, isBridgeReady, persistPresencePatch, phase, presenceDisplayName]);

  useEffect(() => {
    if (phase !== 'ready') return;
    if (!isBridgeReady) return;
    const service = presenceServiceRef.current;
    if (!service) return;

    const entityType = presenceFocus?.entityType;
    const entityId = presenceFocus?.entityId;
    const focusKey = `${entityType ?? ''}:${entityId ?? ''}`;
    if (latestFocusKeyRef.current === focusKey) {
      return;
    }
    latestFocusKeyRef.current = focusKey;

    const focusState: 'online' | 'idle' =
      latestPresenceStateRef.current === 'idle' ? 'idle' : 'online';
    const patch: PresenceStatePatch = {
      state: focusState,
      ...(entityType ? { focusedEntityType: entityType } : {}),
      ...(entityId ? { focusedEntityId: entityId } : {}),
    };

    void service
      .update(patch)
      .then(() => persistPresencePatch(patch))
      .then(() => {
        latestPresenceStateRef.current = focusState;
      })
      .catch((error) => {
        log.warn('failed to update presence focus', { err: error });
      });
  }, [
    isBridgeReady,
    persistPresencePatch,
    phase,
    presenceFocus?.entityId,
    presenceFocus?.entityType,
  ]);

  useEffect(() => {
    if (phase !== 'ready') return;
    if (!isBridgeReady) return;
    if (typeof document === 'undefined') return;
    if (!presenceServiceRef.current) return;

    let cancelled = false;
    const handleVisibilityChange = () => {
      const service = presenceServiceRef.current;
      if (!service || cancelled) return;

      const nextState: 'online' | 'idle' =
        document.visibilityState === 'hidden' ? 'idle' : 'online';
      if (latestPresenceStateRef.current === nextState) {
        return;
      }

      const patch: PresenceStatePatch = {
        state: nextState,
        ...(presenceFocus?.entityType ? { focusedEntityType: presenceFocus.entityType } : {}),
        ...(presenceFocus?.entityId ? { focusedEntityId: presenceFocus.entityId } : {}),
      };

      void service
        .update(patch)
        .then(() => persistPresencePatch(patch))
        .then(() => {
          latestPresenceStateRef.current = nextState;
        })
        .catch((error) => {
          log.warn('failed to sync visibility presence state', { err: error });
        });
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    isBridgeReady,
    persistPresencePatch,
    phase,
    presenceFocus?.entityId,
    presenceFocus?.entityType,
  ]);

  return { presenceMembers, presenceCurrentUserId };
}
