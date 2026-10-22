// @vitest-environment jsdom
/** #355：重新下载时快照缺目标项目，首页列表显示可读的报错 | readable error on the home list */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSnapshotMissingProjectError } from '../services/linguisticServiceDatabaseIo';
import { RemovedCloudProjectsSection } from './RemovedCloudProjectsSection';

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    cleanup: {
      listLocallyRemovedCloudProjects: () => [
        { projectId: 'p1', removedAt: '2026-10-22T00:00:00.000Z', projectName: 'Field notes' },
      ],
      redownloadLocallyRemovedCloudProject: async (projectId: string) => {
        throw new ProjectSnapshotMissingProjectError(projectId);
      },
    },
  },
}));

describe('RemovedCloudProjectsSection', () => {
  afterEach(cleanup);

  it.each([
    [
      'zh-CN',
      '重新下载',
      '重新下载失败：云端最新快照里没有这个项目，无法重新下载；本机数据没有改动。',
    ],
    [
      'en-US',
      'Download again',
      'Download failed: The latest cloud snapshot does not contain this project, so it could not be downloaded. Local data is unchanged.',
    ],
  ] as const)(
    '#355 (%s): shows why the snapshot could not be downloaded',
    async (locale, button, expected) => {
      const onRedownloaded = vi.fn();
      render(
        <RemovedCloudProjectsSection
          locale={locale}
          refreshToken={0}
          onRedownloaded={onRedownloaded}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect((await screen.findByRole('alert')).textContent).toBe(expected);
      expect(onRedownloaded).not.toHaveBeenCalled();
    },
  );
});
