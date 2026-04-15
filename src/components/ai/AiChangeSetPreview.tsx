import type { AiChangeSet } from '../../ai/changeset/AiChangeSetProtocol';
import { t, useLocale } from '../../i18n';

interface AiChangeSetPreviewProps {
  changeSet: AiChangeSet;
  onAccept?: () => void;
  onReject?: () => void;
  /** When false, hides Accept/Reject (e.g. embedded under AiChatAlertsPanel confirm row). */
  showActions?: boolean;
}

export function AiChangeSetPreview({
  changeSet,
  onAccept,
  onReject,
  showActions,
}: AiChangeSetPreviewProps) {
  const locale = useLocale();
  const actionsVisible = showActions !== false;
  return (
    <section className="ai-changeset-preview" data-testid="ai-changeset-preview">
      <header>
        <strong>{changeSet.description}</strong>
      </header>
      <ul>
        {changeSet.changes.map((change) => (
          <li key={`${change.unitId}:${change.field}`}>
            <code>{change.unitId}</code>
            {' '}
            {change.field}
            {' '}
            {change.before || '(empty)'}
            {' -> '}
            {change.after || '(empty)'}
          </li>
        ))}
      </ul>
      {actionsVisible && (
        <div className="ai-changeset-preview-actions">
          <button type="button" onClick={onAccept}>{t(locale, 'ai.changeset.accept')}</button>
          <button type="button" onClick={onReject}>{t(locale, 'ai.changeset.reject')}</button>
        </div>
      )}
    </section>
  );
}

export default AiChangeSetPreview;
