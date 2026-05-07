import React, { memo } from 'react';
import { t, type Locale } from '../../i18n';
import {
  type AdoptionItem,
  type AdoptionAction,
  canAcceptAdoptionItem,
  filterAdoptionItemsByStatus,
} from '../../ai/vertical/adoptionQueue';

interface AiAdoptionQueuePanelProps {
  items: AdoptionItem[];
  locale: Locale;
  onItemAction: (itemId: string, action: AdoptionAction, options?: { reasonCode?: string }) => void;
  onJumpToEvidence?: (packetIds: string[]) => void;
}

export const AiAdoptionQueuePanel = memo(function AiAdoptionQueuePanel({
  items,
  locale,
  onItemAction,
  onJumpToEvidence,
}: AiAdoptionQueuePanelProps): React.JSX.Element | null {
  const pendingItems = filterAdoptionItemsByStatus(items, 'pending');
  if (pendingItems.length === 0) return null;

  return (
    <div className="ai-adoption-queue-panel" role="region" aria-label={t(locale, 'msg.aiChat.adoptionQueue.title')}>
      <div className="ai-adoption-queue-panel__header">
        <span className="ai-adoption-queue-panel__title">
          {t(locale, 'msg.aiChat.adoptionQueue.title')}
        </span>
        <span className="ai-adoption-queue-panel__count">{pendingItems.length}</span>
      </div>
      <ul className="ai-adoption-queue-panel__list">
        {pendingItems.map((item) => (
          <li key={item.id} className="ai-adoption-queue-panel__item">
            <div className="ai-adoption-queue-panel__meta">
              {item.outputKind && (
                <span className="ai-adoption-queue-panel__kind">{item.outputKind}</span>
              )}
              {item.writeMode && (
                <span className="ai-adoption-queue-panel__write-mode">{item.writeMode}</span>
              )}
            </div>
            <div className="ai-adoption-queue-panel__title">{item.title ?? item.summary}</div>
            {item.recommendedAction && (
              <div className="ai-adoption-queue-panel__recommendation">
                {t(locale, 'msg.aiChat.adoptionQueue.recommendedAction')}: {item.recommendedAction}
              </div>
            )}
            <div className="ai-adoption-queue-panel__actions">
              <button
                type="button"
                className="ai-adoption-queue-panel__action-btn ai-adoption-queue-panel__action-btn--accept"
                disabled={!canAcceptAdoptionItem(item)}
                onClick={() => {
                  if (!canAcceptAdoptionItem(item)) return;
                  onItemAction(item.id, 'accept');
                }}
                aria-label={t(locale, 'msg.aiChat.adoptionQueue.accept')}
              >
                {t(locale, 'msg.aiChat.adoptionQueue.accept')}
              </button>
              <button
                type="button"
                className="ai-adoption-queue-panel__action-btn ai-adoption-queue-panel__action-btn--ignore"
                onClick={() => onItemAction(item.id, 'ignore', { reasonCode: 'user_ignored' })}
                aria-label={t(locale, 'msg.aiChat.adoptionQueue.ignore')}
              >
                {t(locale, 'msg.aiChat.adoptionQueue.ignore')}
              </button>
              <button
                type="button"
                className="ai-adoption-queue-panel__action-btn ai-adoption-queue-panel__action-btn--copy"
                onClick={() => onItemAction(item.id, 'copy')}
                aria-label={t(locale, 'msg.aiChat.adoptionQueue.copy')}
              >
                {t(locale, 'msg.aiChat.adoptionQueue.copy')}
              </button>
              {item.evidencePacketIds.length > 0 && onJumpToEvidence && (
                <button
                  type="button"
                  className="ai-adoption-queue-panel__action-btn ai-adoption-queue-panel__action-btn--jump"
                  onClick={() => onJumpToEvidence(item.evidencePacketIds)}
                  aria-label={t(locale, 'msg.aiChat.adoptionQueue.jumpToEvidence')}
                >
                  {t(locale, 'msg.aiChat.adoptionQueue.jumpToEvidence')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
