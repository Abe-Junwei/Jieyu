import type { CollaborationPresenceLiveMember } from '../../collaboration/cloud/CollaborationPresenceService';
import type { CollaborationSyncBadgeKind, CollaborationSyncBadgeState } from '../../collaboration/cloud/collaborationSyncDerived';
import type { Locale } from '../../i18n';
import { getCollaborationSyncSurfaceMessages } from '../../i18n/collaborationSyncSurfaceMessages';
import { getSidePaneSidebarMessages } from '../../i18n/sidePaneSidebarMessages';
import '../../styles/collaboration-sync-surface.css';

function getDisplayName(member: CollaborationPresenceLiveMember): string {
  const trimmed = member.displayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : member.userId;
}

function getAvatarText(label: string): string {
  const parts = label.split(/\s+/u).filter(Boolean);
  if (parts.length >= 2) {
    const firstPart = parts[0] ?? '';
    const secondPart = parts[1] ?? '';
    const first = Array.from(firstPart)[0] ?? '';
    const second = Array.from(secondPart)[0] ?? '';
    return `${first}${second}`.toUpperCase();
  }
  return Array.from(label).slice(0, 2).join('').toUpperCase();
}

export function CollaborationSyncBadge({
  locale,
  badge,
  presenceMembers,
  currentUserId,
}: {
  locale: Locale;
  badge: CollaborationSyncBadgeState;
  presenceMembers?: CollaborationPresenceLiveMember[];
  currentUserId?: string;
}) {
  const messages = getCollaborationSyncSurfaceMessages(locale);
  const presenceMessages = getSidePaneSidebarMessages(locale);
  const label = messages.badgeLabel(badge.kind, badge.pendingOutboundCount);
  const modifierByKind: Partial<Record<CollaborationSyncBadgeKind, string>> = {
    read_only: 'is-read-only',
    conflict: 'is-conflict',
    syncing: 'is-syncing',
    offline_queue: 'is-offline-queue',
    synced: 'is-synced',
  };
  const modifier = modifierByKind[badge.kind] ?? '';
  const visibleMembers = (presenceMembers ?? [])
    .filter((member) => member.state !== 'offline')
    .slice()
    .sort((left, right) => {
      const leftTimestamp = left.lastSeenAt ? Date.parse(left.lastSeenAt) : 0;
      const rightTimestamp = right.lastSeenAt ? Date.parse(right.lastSeenAt) : 0;
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return left.userId.localeCompare(right.userId);
    });
  const displayMembers = visibleMembers.slice(0, 5);

  return (
    <span className="app-collaboration-sync-surface">
      <span
        className={`app-collaboration-sync-badge ${modifier}`.trim()}
        title={label}
        aria-live="polite"
      >
        {label}
      </span>
      {displayMembers.length > 0 ? (
        <span className="app-collaboration-presence-strip" aria-label={presenceMessages.presenceCardAria}>
          {displayMembers.map((member) => {
            const displayName = getDisplayName(member);
            const isCurrentUser = Boolean(currentUserId) && member.userId === currentUserId;
            const memberLabel = `${displayName}${isCurrentUser ? ` ${presenceMessages.presenceSelfSuffix}` : ''} · ${presenceMessages.presenceStateLabel(member.state)}`;
            return (
              <span
                key={member.userId}
                className={`app-collaboration-presence-avatar is-${member.state}${isCurrentUser ? ' is-self' : ''}`.trim()}
                title={memberLabel}
                aria-label={memberLabel}
              >
                <span className="app-collaboration-presence-avatar__text">{getAvatarText(displayName)}</span>
              </span>
            );
          })}
          {visibleMembers.length > displayMembers.length ? (
            <span
              className="app-collaboration-presence-avatar app-collaboration-presence-avatar-more"
              title={`+${visibleMembers.length - displayMembers.length}`}
              aria-label={`+${visibleMembers.length - displayMembers.length}`}
            >
              +{visibleMembers.length - displayMembers.length}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
