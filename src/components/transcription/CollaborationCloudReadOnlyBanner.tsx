import type { CollaborationProtocolGuardEvaluation } from '../../collaboration/cloud/collaborationProtocolGuard';
import type { Locale } from '../../i18n';
import { getCollaborationSyncSurfaceMessages } from '../../i18n/collaborationSyncSurfaceMessages';
import '../../styles/collaboration-sync-surface.css';

export function CollaborationCloudReadOnlyBanner({
  locale,
  guard,
}: {
  locale: Locale;
  guard: CollaborationProtocolGuardEvaluation;
}) {
  if (!guard.cloudWritesDisabled) return null;
  const messages = getCollaborationSyncSurfaceMessages(locale);
  return (
    <aside className="app-collaboration-readonly-banner" role="status">
      <p className="app-collaboration-readonly-banner-title">{messages.readOnlyTitle}</p>
      <p className="app-collaboration-readonly-banner-body">{messages.readOnlyBody}</p>
      {guard.reasons.length > 0 ? (
        <ul className="app-collaboration-readonly-banner-reasons">
          <li>
            {messages.readOnlyReasonsPrefix}
            :
            {' '}
            {guard.reasons.join(' · ')}
          </li>
        </ul>
      ) : null}
    </aside>
  );
}
