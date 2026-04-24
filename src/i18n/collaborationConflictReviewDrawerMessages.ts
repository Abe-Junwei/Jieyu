import { normalizeLocale, type Locale } from './index';
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

const zhCN: CollaborationConflictReviewDrawerMessages = {
  title: '\u51b2\u7a81\u5ba1\u67e5',
  badgeAriaLabel: (count) => `\u5f85\u5904\u7406\u51b2\u7a81\u5de5\u5355\uff1a${count}`,
  priorityLabel: (priority) => {
    if (priority === 'critical') return '\u7d27\u6025';
    if (priority === 'high') return '\u9ad8';
    if (priority === 'medium') return '\u4e2d';
    return '\u4f4e';
  },
  noConflictCodeDetails: '\u6682\u65e0\u51b2\u7a81\u4ee3\u7801\u8be6\u60c5\u3002',
  applyRemote: '\u5e94\u7528\u8fdc\u7aef',
  keepLocal: '\u4fdd\u7559\u672c\u5730',
  later: '\u7a0d\u540e\u5904\u7406',
};

const enUS: CollaborationConflictReviewDrawerMessages = {
  title: 'Conflict Review',
  badgeAriaLabel: (count) => `Pending conflict tickets: ${count}`,
  priorityLabel: (priority) => {
    if (priority === 'critical') return 'Critical';
    if (priority === 'high') return 'High';
    if (priority === 'medium') return 'Medium';
    return 'Low';
  },
  noConflictCodeDetails: 'No conflict code details available.',
  applyRemote: 'Apply Remote',
  keepLocal: 'Keep Local',
  later: 'Later',
};

export function getCollaborationConflictReviewDrawerMessages(locale: Locale): CollaborationConflictReviewDrawerMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}