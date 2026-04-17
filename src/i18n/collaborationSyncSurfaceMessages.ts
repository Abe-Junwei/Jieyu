import type { Locale } from './index';
import type { CollaborationSyncBadgeKind } from '../collaboration/cloud/collaborationSyncDerived';

export type CollaborationSyncSurfaceMessages = {
  badgeLabel: (kind: CollaborationSyncBadgeKind, pending: number) => string;
  readOnlyTitle: string;
  readOnlyBody: string;
  readOnlyReasonsPrefix: string;
};

const zhCN: CollaborationSyncSurfaceMessages = {
  badgeLabel: (kind, pending) => {
    if (kind === 'idle') return '协同：未启用';
    if (kind === 'connecting') return '协同：连接中…';
    if (kind === 'read_only') return '协同：只读';
    if (kind === 'conflict') return '协同：冲突待处理';
    if (kind === 'offline_queue') return `协同：离线队列 ${pending}`;
    if (kind === 'syncing') return `协同：同步中 ${pending}`;
    if (kind === 'synced') return '协同：已同步';
    return '协同';
  },
  readOnlyTitle: '云端协同为只读模式',
  readOnlyBody: '当前客户端版本或协议不满足项目要求，已停止向云端写入结构化变更与快照。仍可本地编辑并查看在线成员。',
  readOnlyReasonsPrefix: '原因',
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
  return locale === 'zh-CN' ? zhCN : enUS;
}
