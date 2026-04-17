// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { LeftRailProjectHub } from './LeftRailProjectHub';
import type { JieyuArchiveImportPreview } from '../../services/JymService';

const showToastMock = vi.hoisted(() => vi.fn());

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
        conflicts: 1,
        existing: 1,
        willInsertUpsert: 2,
        willInsertSkipExisting: 1,
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
    totalConflicts: 1,
  };
}

function renderHub(overrides: Partial<Parameters<typeof LeftRailProjectHub>[0]> = {}) {
  const onPreviewProjectArchiveImport = vi.fn(async () => makePreview());
  const onImportProjectArchive = vi.fn(async () => true);
  const onImportAnnotationFile = vi.fn(async () => undefined);

  render(
    <LocaleProvider locale="zh-CN">
      <LeftRailProjectHub
        currentProjectLabel="项目 A"
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
        onExportEaf={vi.fn()}
        onExportTextGrid={vi.fn()}
        onExportTrs={vi.fn()}
        onExportFlextext={vi.fn()}
        onExportToolbox={vi.fn()}
        onExportJyt={vi.fn(async () => undefined)}
        onExportJym={vi.fn(async () => undefined)}
        {...overrides}
      />
    </LocaleProvider>,
  );

  return {
    onPreviewProjectArchiveImport,
    onImportProjectArchive,
    onImportAnnotationFile,
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
  document.getElementById('left-rail-project-hub-slot')?.remove();
});

describe('LeftRailProjectHub project import dialog', () => {
  it('opens the import preview dialog through the archive input with DialogShell wide layout', async () => {
    const { onPreviewProjectArchiveImport } = renderHub();
    const file = new File(['archive'], 'demo.jym', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onPreviewProjectArchiveImport).toHaveBeenCalledWith(file);
    });

    const dialog = await screen.findByRole('dialog', { name: '导入项目预览' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const confirmButton = screen.getByRole('button', { name: '开始导入项目' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('dialog-card-wide');
    expect(dialog.className).toContain('left-rail-project-import-dialog');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(confirmButton.className).toContain('panel-button--primary');
    expect(screen.getByText('demo.jym')).toBeTruthy();
    expect(screen.getByText('导入策略')).toBeTruthy();
    expect(screen.getByText('projects')).toBeTruthy();
  });

  it('passes the selected strategy when confirming archive import', async () => {
    const { onImportProjectArchive } = renderHub();
    const file = new File(['archive'], 'demo.jym', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入项目预览' });
    fireEvent.click(screen.getByLabelText('保留已有项（skip-existing）'));
    fireEvent.click(screen.getByRole('button', { name: '开始导入项目' }));

    await waitFor(() => {
      expect(onImportProjectArchive).toHaveBeenCalledWith(file, 'skip-existing');
    });
  });

  it('opens annotation import strategy dialog and passes the selected strategy', async () => {
    const { onImportAnnotationFile } = renderHub();
    const file = new File(['annotation'], 'demo.eaf', { type: 'application/xml' });
    const input = document.querySelector('input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入标注文件' });
    fireEvent.click(screen.getByRole('radio', { name: /仅写入目标表示/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始导入标注' }));

    await waitFor(() => {
      expect(onImportAnnotationFile).toHaveBeenCalledWith(file, 'bridge-target');
    });
  });

  it('shows logical timeline hint in export submenu when timeline mode is document', async () => {
    renderHub({ activeTextTimelineMode: 'document' });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);

    const hintText = await screen.findByText('当前项目使用逻辑时间轴；导出时间戳不等于声学秒。');
    const hintButton = hintText.closest('button') as HTMLButtonElement;
    expect(hintButton.disabled).toBe(true);
  });
});