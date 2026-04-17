import type { CollaborationSyncBadgeKind, CollaborationSyncBadgeState } from '../../collaboration/cloud/collaborationSyncDerived';
import type { Locale } from '../../i18n';
import { getCollaborationSyncSurfaceMessages } from '../../i18n/collaborationSyncSurfaceMessages';
import '../../styles/collaboration-sync-surface.css';

export function CollaborationSyncBadge({
  locale,
  badge,
}: {
  locale: Locale;
  badge: CollaborationSyncBadgeState;
}) {
  const messages = getCollaborationSyncSurfaceMessages(locale);
  const label = messages.badgeLabel(badge.kind, badge.pendingOutboundCount);
  const modifierByKind: Partial<Record<CollaborationSyncBadgeKind, string>> = {
    read_only: 'is-read-only',
    conflict: 'is-conflict',
    syncing: 'is-syncing',
    offline_queue: 'is-offline_queue',
    synced: 'is-synced',
  };
  const modifier = modifierByKind[badge.kind] ?? '';

  return (
    <span
      className={`app-collaboration-sync-badge ${modifier}`.trim()}
      title={label}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
