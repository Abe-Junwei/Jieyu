// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithLocale } from '../../test/localeTestUtils';
import { CollaborationCloudPanel } from './CollaborationCloudPanel';

describe('CollaborationCloudPanel', () => {
  it('renders as a standalone collaboration surface', async () => {
    const { container, unmount } = renderWithLocale(
      <CollaborationCloudPanel
        listProjectAssets={vi.fn(async () => [])}
        removeProjectAsset={vi.fn(async () => undefined)}
        getProjectAssetSignedUrl={vi.fn(async () => 'https://example.test/signed-url')}
        listProjectSnapshots={vi.fn(async () => [])}
        restoreProjectSnapshotToLocalById={vi.fn(async () => {
          throw new Error('not-used');
        })}
        queryProjectChangeTimeline={vi.fn(async () => ({ changes: [], total: 0 }))}
      />,
      'zh-CN',
    );

    await waitFor(() => {
      expect(container.querySelector('.app-side-pane-collaboration-group')).toBeTruthy();
    });

    unmount();
  });

  it('loads assets and timeline, and restores selected snapshot', async () => {
    const listProjectAssets = vi.fn(async () => [
      {
        id: 'asset-1',
        projectId: 'project-1',
        assetType: 'audio' as const,
        storageBucket: 'project-audio',
        storagePath: 'p/a.wav',
        sizeBytes: 2048,
        uploadedBy: 'u-1',
        createdAt: '2026-04-17T12:00:00.000Z',
      },
    ]);
    const removeProjectAsset = vi.fn(async () => undefined);
    const getProjectAssetSignedUrl = vi.fn(async () => 'https://example.test/signed-url');
    const listProjectSnapshots = vi.fn(async () => [
      {
        id: 'snap-1',
        projectId: 'project-1',
        version: 3,
        schemaVersion: 1,
        createdBy: 'u-1',
        snapshotStorageBucket: 'project-exports',
        snapshotStoragePath: 'p/snap-1.json',
        checksum: 'abc',
        sizeBytes: 123,
        changeCursor: 9,
        createdAt: '2026-04-17T12:05:00.000Z',
      },
    ]);
    const restoreProjectSnapshotToLocalById = vi.fn(async () => ({
      id: 'snap-1',
      projectId: 'project-1',
      version: 3,
      schemaVersion: 1,
      createdBy: 'u-1',
      snapshotStorageBucket: 'project-exports',
      snapshotStoragePath: 'p/snap-1.json',
      checksum: 'abc',
      sizeBytes: 123,
      changeCursor: 9,
      createdAt: '2026-04-17T12:05:00.000Z',
    }));
    const queryProjectChangeTimeline = vi.fn(async () => ({
      changes: [
        {
          id: 'chg-1',
          projectId: 'project-1',
          actorId: 'u-1',
          clientId: 'client-1',
          clientOpId: 'op-1',
          protocolVersion: 1,
          projectRevision: 11,
          baseRevision: 10,
          entityType: 'layer_unit_content' as const,
          entityId: 'u-1',
          opType: 'upsert_unit_content' as const,
          sourceKind: 'user' as const,
          createdAt: '2026-04-17T12:10:00.000Z',
        },
      ],
      total: 1,
    }));

    renderWithLocale(
      <CollaborationCloudPanel
        listProjectAssets={listProjectAssets}
        removeProjectAsset={removeProjectAsset}
        getProjectAssetSignedUrl={getProjectAssetSignedUrl}
        listProjectSnapshots={listProjectSnapshots}
        restoreProjectSnapshotToLocalById={restoreProjectSnapshotToLocalById}
        queryProjectChangeTimeline={queryProjectChangeTimeline}
      />,
      'zh-CN',
    );

    fireEvent.click(screen.getByRole('button', { name: '刷新资产' }));

    await waitFor(() => {
      expect(listProjectAssets).toHaveBeenCalledTimes(1);
      expect(screen.getByText('音频')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: '版本历史' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新版本' }));

    await waitFor(() => {
      expect(listProjectSnapshots).toHaveBeenCalledTimes(1);
      expect(screen.getByText('版本 v3')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '恢复到本地' }));

    await waitFor(() => {
      expect(restoreProjectSnapshotToLocalById).toHaveBeenCalledWith('snap-1');
    });

    fireEvent.click(screen.getByRole('tab', { name: '变更时间线' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新时间线' }));

    await waitFor(() => {
      expect(queryProjectChangeTimeline).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/upsert_unit_content/)).toBeTruthy();
    });
  });

  it('cloud delete needs two confirmations and reports owner-only rejections (rev5 9.2)', async () => {
    const deleteProjectFromCloud = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('JIEYU_OWNER_ONLY'), { rejection: 'owner-only' }),
      )
      .mockResolvedValueOnce(undefined);
    const confirm = vi.spyOn(window, 'confirm');
    renderWithLocale(
      <CollaborationCloudPanel
        listProjectAssets={vi.fn(async () => [])}
        removeProjectAsset={vi.fn(async () => undefined)}
        getProjectAssetSignedUrl={vi.fn(async () => '')}
        listProjectSnapshots={vi.fn(async () => [])}
        restoreProjectSnapshotToLocalById={vi.fn(async () => {
          throw new Error('not-used');
        })}
        queryProjectChangeTimeline={vi.fn(async () => ({ changes: [], total: 0 }))}
        directory={{
          workspaceProjectId: 'project-1',
          listAccessibleProjects: vi.fn(async () => []),
          listProjectMembers: vi.fn(async () => []),
          deleteProjectFromCloud,
        }}
      />,
      'zh-CN',
    );
    fireEvent.click(screen.getByRole('tab', { name: /云项目与成员/ }));
    const button = await screen.findByRole('button', { name: '删除云端项目（所有协作者）' });

    confirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(deleteProjectFromCloud).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true).mockReturnValueOnce(true);
    fireEvent.click(button);
    await screen.findByText('只有项目所有者可以删除云端项目。');

    confirm.mockReturnValueOnce(true).mockReturnValueOnce(true);
    fireEvent.click(button);
    await screen.findByText('云端项目已删除，本机副本已清理。');
    expect(deleteProjectFromCloud).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
});
