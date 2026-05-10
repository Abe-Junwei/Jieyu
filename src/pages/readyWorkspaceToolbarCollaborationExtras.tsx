import type { ReactNode } from 'react';

import { CollaborationSyncBadge } from '../components/transcription/CollaborationSyncBadge';
import type { CollaborationPresenceLiveMember } from '../collaboration/cloud/CollaborationPresenceService';
import type { CollaborationSyncBadgeState } from '../collaboration/cloud/collaborationSyncDerived';
import type { Locale } from '../i18n';

/** Merges base toolbar props with collaboration badge extras (ReadyWorkspace orchestration helper). */
export function buildReadyWorkspaceToolbarPropsWithCollaboration<
  T extends Record<string, unknown>,
>(input: {
  toolbarProps: T;
  locale: Locale;
  badge: CollaborationSyncBadgeState;
  presenceMembers?: CollaborationPresenceLiveMember[];
  currentUserId?: string;
}): T & { leftToolbarExtras: ReactNode } {
  const { toolbarProps, locale, badge, presenceMembers, currentUserId } = input;
  return {
    ...toolbarProps,
    leftToolbarExtras: (
      <CollaborationSyncBadge
        locale={locale}
        badge={badge}
        {...(presenceMembers !== undefined ? { presenceMembers } : {})}
        {...(currentUserId !== undefined ? { currentUserId } : {})}
      />
    ),
  };
}
