import { normalizeLocale, type Locale } from './index';
import type { CollaborationSyncBadgeKind } from '../collaboration/cloud/collaborationSyncDerived';

export type CollaborationSyncSurfaceMessages = {
  badgeLabel: (kind: CollaborationSyncBadgeKind, pending: number) => string;
  readOnlyTitle: string;
  readOnlyBody: string;
  readOnlyReasonsPrefix: string;
};

const zhCN: CollaborationSyncSurfaceMessages = {
  badgeLabel: (kind, pending) => {
    if (kind === 'idle') return '\u534f\u540c\uff1a\u672a\u542f\u7528';
    if (kind === 'connecting') return '\u534f\u540c\uff1a\u8fde\u63a5\u4e2d\u2026';
    if (kind === 'read_only') return '\u534f\u540c\uff1a\u53ea\u8bfb';
    if (kind === 'conflict') return '\u534f\u540c\uff1a\u51b2\u7a81\u5f85\u5904\u7406';
    if (kind === 'offline_queue') return `\u534f\u540c\uff1a\u79bb\u7ebf\u961f\u5217 ${pending}`;
    if (kind === 'syncing') return `\u534f\u540c\uff1a\u540c\u6b65\u4e2d ${pending}`;
    if (kind === 'synced') return '\u534f\u540c\uff1a\u5df2\u540c\u6b65';
    return '\u534f\u540c';
  },
  readOnlyTitle: '\u4e91\u7aef\u534f\u540c\u4e3a\u53ea\u8bfb\u6a21\u5f0f',
  readOnlyBody: '\u5f53\u524d\u5ba2\u6237\u7aef\u7248\u672c\u6216\u534f\u8bae\u4e0d\u6ee1\u8db3\u9879\u76ee\u8981\u6c42\uff0c\u5df2\u505c\u6b62\u5411\u4e91\u7aef\u5199\u5165\u7ed3\u6784\u5316\u53d8\u66f4\u4e0e\u5feb\u7167\u3002\u4ecd\u53ef\u672c\u5730\u7f16\u8f91\u5e76\u67e5\u770b\u5728\u7ebf\u6210\u5458\u3002',
  readOnlyReasonsPrefix: '\u539f\u56e0',
};

const enUS: CollaborationSyncSurfaceMessages = {
  badgeLabel: (kind, pending) => {
    if (kind === 'idle') return 'Collab: off';
    if (kind === 'connecting') return 'Collab: connecting…';
    if (kind === 'read_only') return 'Collab: read-only';
    if (kind === 'conflict') return 'Collab: conflicts';
    if (kind === 'offline_queue') return `Collab: offline queue ${pending}`;
    if (kind === 'syncing') return `Collab: syncing ${pending}`;
    if (kind === 'synced') return 'Collab: synced';
    return 'Collab';
  },
  readOnlyTitle: 'Cloud collaboration is read-only',
  readOnlyBody: 'This client version or protocol no longer meets the project gate; structured writes and cloud snapshots are blocked. Local editing and presence still work.',
  readOnlyReasonsPrefix: 'Reasons',
};

export function getCollaborationSyncSurfaceMessages(locale: Locale): CollaborationSyncSurfaceMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}
