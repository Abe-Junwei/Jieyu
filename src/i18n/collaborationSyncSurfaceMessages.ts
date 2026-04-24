import type { CollaborationSyncBadgeKind } from '../collaboration/cloud/collaborationSyncDerived';
import { normalizeLocale, t, tf, type Locale } from './index';

export type CollaborationSyncSurfaceMessages = {
  badgeLabel: (kind: CollaborationSyncBadgeKind, pending: number) => string;
  readOnlyTitle: string;
  readOnlyBody: string;
  readOnlyReasonsPrefix: string;
  /** HIGH-10：并发合并时同名字段以优胜方为准、另一方值被忽略时的提示 */
  mergeLoserFieldsSuperseded: (count: number) => string;
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getCollaborationSyncSurfaceMessages(locale: Locale): CollaborationSyncSurfaceMessages {
  const l = dictLocale(locale);
  return {
    badgeLabel: (kind, pending) => {
      if (kind === 'idle') return t(l, 'msg.collabSync.badge.idle');
      if (kind === 'connecting') return t(l, 'msg.collabSync.badge.connecting');
      if (kind === 'read_only') return t(l, 'msg.collabSync.badge.readOnly');
      if (kind === 'conflict') return t(l, 'msg.collabSync.badge.conflict');
      if (kind === 'offline_queue') {
        return tf(l, 'msg.collabSync.badge.offlineQueue', { pending });
      }
      if (kind === 'syncing') {
        return tf(l, 'msg.collabSync.badge.syncing', { pending });
      }
      if (kind === 'synced') return t(l, 'msg.collabSync.badge.synced');
      return t(l, 'msg.collabSync.badge.default');
    },
    readOnlyTitle: t(l, 'msg.collabSync.readOnlyTitle'),
    readOnlyBody: t(l, 'msg.collabSync.readOnlyBody'),
    readOnlyReasonsPrefix: t(l, 'msg.collabSync.readOnlyReasonsPrefix'),
    mergeLoserFieldsSuperseded: (count) => tf(l, 'msg.collabSync.mergeLoser', { count }),
  };
}
