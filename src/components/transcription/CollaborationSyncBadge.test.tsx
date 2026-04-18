// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollaborationSyncBadge } from './CollaborationSyncBadge';

describe('CollaborationSyncBadge', () => {
  it('renders only the sync badge when no collaborators are online', () => {
    render(
      <CollaborationSyncBadge
        locale="zh-CN"
        badge={{ kind: 'idle', pendingOutboundCount: 0 }}
      />,
    );

    expect(screen.getByText('协同：未启用')).toBeTruthy();
    expect(screen.queryByLabelText(/在线协作成员|Online collaborators/)).toBeNull();
    expect(screen.queryByText(/当前暂无在线成员|No collaborators online right now/)).toBeNull();
  });

  it('shows collaborator avatars to the right of the sync badge', () => {
    render(
      <CollaborationSyncBadge
        locale="zh-CN"
        badge={{ kind: 'synced', pendingOutboundCount: 0 }}
        currentUserId="u-1"
        presenceMembers={[
          { userId: 'u-1', displayName: 'Alice', state: 'online', lastSeenAt: '2026-04-18T10:00:00.000Z' },
          { userId: 'u-2', displayName: 'Bob', state: 'idle', lastSeenAt: '2026-04-18T09:59:00.000Z' },
        ]}
      />,
    );

    expect(screen.getByText('协同：已同步')).toBeTruthy();
    expect(screen.getByLabelText(/在线协作成员|Online collaborators/)).toBeTruthy();
    expect(screen.getByLabelText(/Alice/)).toBeTruthy();
    expect(screen.getByLabelText(/Bob/)).toBeTruthy();
  });
});
