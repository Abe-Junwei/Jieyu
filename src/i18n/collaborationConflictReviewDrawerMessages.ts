import { normalizeLocale, t, tf, type Locale } from './index';
import type { CloudSyncConflictReviewTicket } from '../hooks/useTranscriptionCloudSyncActions';

export type CollaborationConflictReviewDrawerMessages = {
  title: string;
  badgeAriaLabel: (count: number) => string;
  priorityLabel: (priority: CloudSyncConflictReviewTicket['priority']) => string;
  noConflictCodeDetails: string;
  applyRemote: string;
  keepLocal: string;
  later: string;
};

export function getCollaborationConflictReviewDrawerMessages(locale: Locale): CollaborationConflictReviewDrawerMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    title: t(normalizedLocale, 'collab.conflictReview.title'),
    badgeAriaLabel: (count) => tf(normalizedLocale, 'collab.conflictReview.badgeAriaLabel', { count }),
    priorityLabel: (priority) => {
      if (priority === 'critical') return t(normalizedLocale, 'collab.conflictReview.priority.critical');
      if (priority === 'high') return t(normalizedLocale, 'collab.conflictReview.priority.high');
      if (priority === 'medium') return t(normalizedLocale, 'collab.conflictReview.priority.medium');
      return t(normalizedLocale, 'collab.conflictReview.priority.low');
    },
    noConflictCodeDetails: t(normalizedLocale, 'collab.conflictReview.noConflictCodeDetails'),
    applyRemote: t(normalizedLocale, 'collab.conflictReview.applyRemote'),
    keepLocal: t(normalizedLocale, 'collab.conflictReview.keepLocal'),
    later: t(normalizedLocale, 'collab.conflictReview.later'),
  };
}