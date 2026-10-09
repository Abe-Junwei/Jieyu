// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { LeftRailProjectHub } from './LeftRailProjectHub';
import type { JieyuArchiveImportPreview } from '../../services/JymService';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';

const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/projectRoster', () => ({
  PROJECT_ROSTER_QUERY_KEY: 'projectRoster',
  loadProjectRoster: vi.fn(async () => [
    { textId: 'text-new', title: '新建项目甲', updatedAt: '2026-09-30T00:00:00.000Z' },
  ]),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

function makePreview(): JieyuArchiveImportPreview {
  return {
    kind: 'jym',
    manifest: {
      formatVersion: 1,
      kind: 'jym',
      schemaVersion: 1,
      exportedAt: '2026-04-03T00:00:00.000Z',
    },
    collections: [
      {
        name: 'projects',
        incoming: 2,
        conflicts: 0,
        existing: 0,
        willInsertUpsert: 2,
        willInsertSkipExisting: 2,
        willInsertReplaceAll: 2,
      },
      {
        name: 'media',
        incoming: 1,
        conflicts: 0,
        existing: 0,
        willInsertUpsert: 1,
        willInsertSkipExisting: 1,
        willInsertReplaceAll: 1,
      },
    ],
    totalIncoming: 3,
    totalConflicts: 0,
    unresolvedSystemRefs: [],
    restoreAsNewProject: {
      sourceProjectTitle: 'Field notes',
      mediaWithoutBytes: 0,
      includedBytesCount: 2,
      includedBytesTotal: 3 * 1024 * 1024,
      skippedLanguageIds: [],
    },
  };
}

function renderHub(overrides: Partial<Parameters<typeof LeftRailProjectHub>[0]> = {}) {
  const onPreviewProjectArchiveImport = vi.fn(async () => makePreview());
  const onImportProjectArchive = vi.fn(async () => true);
  const onImportAnnotationFile = vi.fn(async () => undefined);
  const onApplyTextTimeMapping = vi.fn(async () => undefined);
  const importFileRef = { current: null as HTMLInputElement | null };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LocaleProvider locale="zh-CN">
          <LeftRailProjectHub
            currentProjectLabel="项目 A"
            importFileRef={importFileRef}
            canDeleteProject
            canDeleteAudio
            onOpenProjectSetup={vi.fn()}
            onOpenAudioImport={vi.fn()}
            onDeleteCurrentProject={vi.fn()}
            onDeleteCurrentAudio={vi.fn()}
            onOpenSpeakerManagementPanel={vi.fn()}
            onImportAnnotationFile={onImportAnnotationFile}
            onPreviewProjectArchiveImport={onPreviewProjectArchiveImport}
            onImportProjectArchive={onImportProjectArchive}
            onApplyTextTimeMapping={onApplyTextTimeMapping}
            onExportEaf={vi.fn()}
            onExportTextGrid={vi.fn()}
            onExportTrs={vi.fn()}
            onExportFlextext={vi.fn()}
            onExportToolbox={vi.fn()}
            onExportJyt={vi.fn(async () => undefined)}
            onExportJym={vi.fn(async () => undefined)}
            onExportLite={vi.fn(async () => undefined)}
            {...overrides}
          />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    onPreviewProjectArchiveImport,
    onImportProjectArchive,
    onImportAnnotationFile,
    onApplyTextTimeMapping,
  };
}

beforeEach(() => {
  showToastMock.mockReset();
  const host = document.createElement('div');
  host.id = 'left-rail-project-hub-slot';
  document.body.appendChild(host);
});

afterEach(() => {
  cleanup();
  clearActiveProjectTextId();
  document.getElementById('left-rail-project-hub-slot')?.remove();
});

describe('LeftRailProjectHub project import dialog', () => {
  it('keeps a saved project title on the project button', async () => {
    publishActiveProjectTextId('text-new');
    renderHub();
    const button = await screen.findByRole('button', { name: '新建项目甲' });
    fireEvent.click(button);
    expect(await screen.findByText('所有项目')).toBeTruthy();
    expect(screen.getByText('项目').closest('button')?.textContent).toContain('新建项目甲');
  });

  it('opens the import preview dialog through the archive input with DialogShell wide layout', async () => {
    const { onPreviewProjectArchiveImport } = renderHub();
    const file = new File(['archive'], 'demo.jym', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onPreviewProjectArchiveImport).toHaveBeenCalledWith(file);
    });

    const dialog = await screen.findByRole('dialog', { name: '导入项目预览' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const confirmButton = screen.getByRole('button', { name: '恢复为新项目' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('dialog-card-wide');
    expect(dialog.className).toContain('left-rail-project-import-dialog');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(confirmButton.className).toContain('panel-button--primary');
    expect(screen.getByText('demo.jym')).toBeTruthy();
    expect(screen.getByText('导入策略')).toBeTruthy();
    expect(screen.getByText('projects')).toBeTruthy();
  });

  it('JYM restores as a new project with its bytes; there is no import strategy (D1, D5)', async () => {
    const { onImportProjectArchive } = renderHub();
    const file = new File(['archive'], 'demo.jym', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入项目预览' });
    expect(screen.getByTestId('project-import-bytes-included').textContent).toContain('3.0 MB');
    expect(screen.getByTestId('project-import-restore-as-new')).toBeTruthy();
    expect(screen.queryByLabelText('保留已有项（skip-existing）')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '恢复为新项目' }));

    await waitFor(() => {
      expect(onImportProjectArchive).toHaveBeenCalledWith(file, 'upsert', 'restore-as-new');
    });
  });

  it('JYT restores as a new project by default; overwrite needs a second click (D5, T33)', async () => {
    const jytPreview = (available: boolean) => ({
      ...makePreview(),
      kind: 'jyt' as const,
      totalConflicts: 0,
      restoreAsNewProject: {
        sourceProjectTitle: 'Field notes',
        mediaWithoutBytes: 1,
        includedBytesCount: 0,
        includedBytesTotal: 0,
        skippedLanguageIds: [],
        overwriteCurrentProject: {
          targetProjectId: 'p1',
          targetTitle: 'Current',
          available,
          bytesAtRiskCount: available ? 0 : 2,
        },
      },
    });
    const { onImportProjectArchive } = renderHub({
      onPreviewProjectArchiveImport: vi.fn(async () => jytPreview(true)),
    });
    const file = new File(['archive'], 'demo.jyt', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入项目预览' });
    expect(screen.queryByText('导入策略')).toBeTruthy();
    expect(screen.getByTestId('project-import-restore-as-new')).toBeTruthy();
    fireEvent.click(screen.getByTestId('project-import-overwrite-current'));
    expect(screen.getByTestId('project-import-overwrite-warning')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '覆盖当前项目' }));
    expect(onImportProjectArchive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认覆盖' }));
    await waitFor(() => {
      expect(onImportProjectArchive).toHaveBeenCalledWith(file, 'upsert', 'overwrite-current');
    });
  });

  it('JYT overwrite is disabled when local bytes would be lost', async () => {
    renderHub({
      onPreviewProjectArchiveImport: vi.fn(async () => ({
        ...makePreview(),
        kind: 'jyt' as const,
        restoreAsNewProject: {
          sourceProjectTitle: 'Field notes',
          mediaWithoutBytes: 0,
          includedBytesCount: 0,
          includedBytesTotal: 0,
          skippedLanguageIds: [],
          overwriteCurrentProject: {
            targetProjectId: 'p1',
            targetTitle: 'Current',
            available: false,
            bytesAtRiskCount: 2,
          },
        },
      })),
    });
    const file = new File(['archive'], 'demo.jyt', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('dialog', { name: '导入项目预览' });
    expect(
      (screen.getByTestId('project-import-overwrite-current') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId('project-import-overwrite-blocked').textContent).toContain('2');
    expect(screen.getByRole('button', { name: '恢复为新项目' })).toBeTruthy();
  });

  const jybPreview = (disaster: {
    available: boolean;
    reason?: 'collaborated' | 'local-bytes-would-be-lost';
    bytesAtRiskCount?: number;
  }) => ({
    ...makePreview(),
    kind: 'jyb' as const,
    libraryBackup: {
      mediaIncluded: true,
      projects: [
        {
          id: 'pA',
          title: 'Alpha',
          incoming: 10,
          mediaWithoutBytes: 0,
          includedBytesCount: 1,
          aiRows: 2,
        },
        {
          id: 'pB',
          title: 'Beta',
          incoming: 5,
          mediaWithoutBytes: 0,
          includedBytesCount: 1,
          aiRows: 0,
        },
      ],
      preferenceKeys: ['jieyu.locale', 'jieyu-theme'],
      disasterRestore: {
        available: disaster.available,
        ...(disaster.reason ? { reason: disaster.reason } : {}),
        localProjectCount: 3,
        bytesAtRiskCount: disaster.bytesAtRiskCount ?? 0,
      },
    },
  });

  it('JYB imports the checked projects as new projects by default (T30)', async () => {
    const { onImportProjectArchive } = renderHub({
      onPreviewProjectArchiveImport: vi.fn(async () => jybPreview({ available: true })),
    });
    const file = new File(['archive'], 'library.jyb', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('dialog', { name: '导入项目预览' });
    expect(screen.getByTestId('jyb-media-chip').textContent).toBe('含音频');
    expect((screen.getByTestId('jyb-mode-projects') as HTMLInputElement).checked).toBe(true);
    // 项目 AI 默认随项目导入（7.5）| Project AI is imported by default (7.5)
    expect((screen.getByTestId('jyb-include-ai') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('jyb-include-ai'));
    fireEvent.click(screen.getByTestId('jyb-project-pA'));
    fireEvent.click(screen.getByRole('button', { name: '导入所选项目' }));
    await waitFor(() => {
      expect(onImportProjectArchive).toHaveBeenCalledWith(file, 'upsert', 'restore-as-new', {
        projectIds: ['pB'],
        includeProjectAi: false,
        restorePreferences: false,
      });
    });
  });

  it('JYB disaster restore needs a second click (D7, T34)', async () => {
    const { onImportProjectArchive } = renderHub({
      onPreviewProjectArchiveImport: vi.fn(async () => jybPreview({ available: true })),
    });
    const file = new File(['archive'], 'library.jyb', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('dialog', { name: '导入项目预览' });
    fireEvent.click(screen.getByTestId('jyb-mode-disaster'));
    expect(screen.getByTestId('jyb-disaster-warning')).toBeTruthy();
    // 偏好：列出键，默认不还原（询问后还原）| Preferences listed, not restored unless asked
    expect(screen.getByTestId('jyb-preference-keys').textContent).toContain('jieyu.locale');
    const restorePrefs = screen.getByTestId('jyb-restore-preferences') as HTMLInputElement;
    expect(restorePrefs.checked).toBe(false);
    fireEvent.click(restorePrefs);
    fireEvent.click(screen.getByRole('button', { name: '整库还原' }));
    expect(onImportProjectArchive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认整库还原' }));
    await waitFor(() => {
      expect(onImportProjectArchive).toHaveBeenCalledWith(
        file,
        'upsert',
        'disaster-restore',
        expect.objectContaining({ restorePreferences: true }),
      );
    });
  });

  it('JYB disaster restore is not offered when a project was collaborated (T34c)', async () => {
    renderHub({
      onPreviewProjectArchiveImport: vi.fn(async () =>
        jybPreview({ available: false, reason: 'collaborated' }),
      ),
    });
    const file = new File(['archive'], 'library.jyb', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym,.jyb"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('dialog', { name: '导入项目预览' });
    expect((screen.getByTestId('jyb-mode-disaster') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('jyb-disaster-blocked').textContent).toContain('协作');
  });

  it('offers JYB exports with and without audio', async () => {
    renderHub();
    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    fireEvent.mouseEnter((await screen.findByText('导出')).closest('button') as HTMLButtonElement);
    expect(await screen.findByText('导出整库备份 JYB（含音频，默认）')).toBeTruthy();
    expect(screen.getByText('导出整库备份 JYB（仅数据，不含音频）')).toBeTruthy();
  });

  it('opens annotation import strategy dialog and passes the selected strategy', async () => {
    const { onImportAnnotationFile } = renderHub();
    const file = new File(['annotation'], 'demo.eaf', { type: 'application/xml' });
    const input = document.querySelector(
      'input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入标注文件' });
    fireEvent.click(screen.getByRole('radio', { name: /仅写入目标表示/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始导入标注' }));

    await waitFor(() => {
      expect(onImportAnnotationFile).toHaveBeenCalledWith(file, 'bridge-target');
    });
  });

  it('shows logical timeline hint and mapping preview in export submenu when time mapping is present', async () => {
    renderHub({
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 3,
        scale: 1.2,
        revision: 2,
        logicalDurationSec: 1800,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);

    const hintText = await screen.findByText(
      '导出时间戳按项目逻辑时间轴（文献秒）标注；与解码媒体时间轴上的秒不一定一一对应。',
    );
    const hintButton = hintText.closest('button') as HTMLButtonElement;
    expect(hintButton.disabled).toBe(true);
    expect(
      await screen.findByText(
        '时间映射预览：文档 0.0–1800.0s → 实际 3.0–2163.0s（偏移 3.0，倍率 ×1.20，版本 2）',
      ),
    ).toBeTruthy();
  });

  it('shows time-mapping export actions when onApply is wired even if exportTimelineModeLabel is null (P3)', async () => {
    renderHub({
      exportTimelineModeLabel: null,
      activeTextTimeMapping: {
        offsetSec: 0,
        scale: 1,
        revision: 1,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    fireEvent.mouseEnter(exportText.closest('button') as HTMLButtonElement);

    expect(await screen.findByText('校准时间映射…')).toBeTruthy();
    expect(
      await screen.findByText(
        '导出时间戳按项目逻辑时间轴（文献秒）标注；与解码媒体时间轴上的秒不一定一一对应。',
      ),
    ).toBeTruthy();
  });

  it('opens the time-mapping calibration dialog and saves the edited values', async () => {
    const { onApplyTextTimeMapping } = renderHub({
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 1,
        scale: 1.1,
        revision: 3,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    const offsetInput = screen.getByLabelText('偏移秒数');
    const scaleInput = screen.getByLabelText('时间倍率');

    fireEvent.change(offsetInput, { target: { value: '5' } });
    fireEvent.change(scaleInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: '应用映射' }));

    await waitFor(() => {
      expect(onApplyTextTimeMapping).toHaveBeenCalledWith({
        offsetSec: 5,
        scale: 1.5,
      });
    });
  });

  it('rolls back to the previous time-mapping snapshot when available', async () => {
    const { onApplyTextTimeMapping } = renderHub({
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
      } as NonNullable<Parameters<typeof LeftRailProjectHub>[0]['activeTextTimeMapping']>,
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('回滚上一版映射'));

    await waitFor(() => {
      expect(onApplyTextTimeMapping).toHaveBeenCalledWith({
        offsetSec: 1,
        scale: 1.1,
      });
    });
  });

  it('shows current and previous mapping entries in the calibration dialog', async () => {
    renderHub({
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
        history: [
          {
            offsetSec: 0.5,
            scale: 0.95,
            revision: 2,
          },
          {
            offsetSec: 0,
            scale: 1,
            revision: 1,
          },
        ],
      } as NonNullable<Parameters<typeof LeftRailProjectHub>[0]['activeTextTimeMapping']>,
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    expect(await screen.findByText('当前版本 v4 · 偏移 5.0s · 倍率 ×1.50')).toBeTruthy();
    expect(await screen.findByText('上一版本 v3 · 偏移 1.0s · 倍率 ×1.10')).toBeTruthy();
    expect(await screen.findByText('更早版本 v2 · 偏移 0.5s · 倍率 ×0.95')).toBeTruthy();
    expect(await screen.findByText('更早版本 v1 · 偏移 0.0s · 倍率 ×1.00')).toBeTruthy();
  });

  it('fills the calibration form when a history entry is clicked', async () => {
    renderHub({
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
        history: [
          {
            offsetSec: 0.5,
            scale: 0.95,
            revision: 2,
          },
        ],
      } as NonNullable<Parameters<typeof LeftRailProjectHub>[0]['activeTextTimeMapping']>,
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    fireEvent.click(screen.getByRole('button', { name: '更早版本 v2 · 偏移 0.5s · 倍率 ×0.95' }));

    expect((screen.getByLabelText('偏移秒数') as HTMLInputElement).value).toBe('0.5');
    expect((screen.getByLabelText('时间倍率') as HTMLInputElement).value).toBe('0.95');
  });

  it('shows source-media mismatch prompt and can reset to identity mapping', async () => {
    const { onApplyTextTimeMapping } = renderHub({
      selectedMediaId: 'media-current',
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        sourceMediaId: 'media-source',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    fireEvent.mouseEnter(exportText.closest('button') as HTMLButtonElement);

    expect(
      await screen.findByText(
        '映射来源媒体与当前媒体不一致（来源 media-source，当前 media-current）',
      ),
    ).toBeTruthy();
    fireEvent.click(await screen.findByText('重置为恒等映射（offset=0, scale=1）'));

    await waitFor(() => {
      expect(onApplyTextTimeMapping).toHaveBeenCalledWith({ offsetSec: 0, scale: 1 });
    });
  });

  it('rejects negative offset in calibration dialog before applying', async () => {
    const { onApplyTextTimeMapping } = renderHub({
      exportTimelineModeLabel: 'document',
      activeTextTimeMapping: {
        offsetSec: 1,
        scale: 1.1,
        revision: 3,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    fireEvent.mouseEnter(exportText.closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    fireEvent.change(screen.getByLabelText('偏移秒数'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('时间倍率'), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: '应用映射' }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        '请输入不小于 0 的偏移秒数与大于 0 的时间倍率。',
        'error',
        0,
      );
    });
    expect(onApplyTextTimeMapping).not.toHaveBeenCalled();
  });

  it('hides logical time-mapping export block when onApplyTextTimeMapping is not provided', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LocaleProvider locale="zh-CN">
            <LeftRailProjectHub
              currentProjectLabel="项目 A"
              importFileRef={{ current: null }}
              canDeleteProject
              canDeleteAudio
              onOpenProjectSetup={vi.fn()}
              onOpenAudioImport={vi.fn()}
              onDeleteCurrentProject={vi.fn()}
              onDeleteCurrentAudio={vi.fn()}
              onOpenSpeakerManagementPanel={vi.fn()}
              onImportAnnotationFile={vi.fn()}
              onPreviewProjectArchiveImport={vi.fn(async () => makePreview())}
              onImportProjectArchive={vi.fn(async () => true)}
              onExportEaf={vi.fn()}
              onExportTextGrid={vi.fn()}
              onExportTrs={vi.fn()}
              onExportFlextext={vi.fn()}
              onExportToolbox={vi.fn()}
              onExportJyt={vi.fn(async () => undefined)}
              onExportJym={vi.fn(async () => undefined)}
              onExportLite={vi.fn(async () => undefined)}
            />
          </LocaleProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    fireEvent.mouseEnter(exportText.closest('button') as HTMLButtonElement);

    expect(screen.queryByText('校准时间映射…')).toBeNull();
  });

  it('offers SRT and CSV export items and calls onExportLite', async () => {
    const onExportLite = vi.fn(async () => undefined);
    renderHub({ onExportLite });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    fireEvent.mouseEnter((await screen.findByText('导出')).closest('button') as HTMLButtonElement);

    const srtItem = await screen.findByText('导出为字幕 SRT (.srt)');
    expect(await screen.findByText('导出为字幕 WebVTT (.vtt)')).toBeTruthy();
    expect(await screen.findByText('导出为表格 CSV (.csv)')).toBeTruthy();
    expect(await screen.findByText('导出为表格 TSV (.tsv)')).toBeTruthy();
    fireEvent.click(srtItem);
    expect(onExportLite).toHaveBeenCalledWith('srt');
  });

  it('offers Leipzig IGT LaTeX export and calls onExportLite with tex', async () => {
    const onExportLite = vi.fn(async () => undefined);
    renderHub({ onExportLite });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    fireEvent.mouseEnter((await screen.findByText('导出')).closest('button') as HTMLButtonElement);

    const texItem = await screen.findByText('导出为 Leipzig IGT（LaTeX）(.tex)');
    fireEvent.click(texItem);
    expect(onExportLite).toHaveBeenCalledWith('tex');
  });
});
