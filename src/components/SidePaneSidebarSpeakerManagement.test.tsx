// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { getSidePaneSidebarMessages } from '../i18n/messages';
import type { SpeakerRailContextValue } from '../contexts/SpeakerRailContext';
import { EMPTY_SPEAKER_REFERENCE_STATS } from '../hooks/speakerManagement/types';
import { SidePaneSidebarSpeakerManagement } from './SidePaneSidebarSpeakerManagement';

function makeSpeakerContext(overrides: Partial<SpeakerRailContextValue> = {}): SpeakerRailContextValue {
  return {
    speakerOptions: [
      { id: 'spk-1', name: 'Alice', createdAt: '2026-04-03T00:00:00.000Z', updatedAt: '2026-04-03T00:00:00.000Z' },
      { id: 'spk-2', name: 'Alice', createdAt: '2026-04-03T00:00:00.000Z', updatedAt: '2026-04-03T00:00:00.000Z' },
    ],
    speakerFilterOptions: [
      { key: 'spk-1', name: 'Alice', count: 2, color: '#2563eb' },
      { key: 'spk-2', name: 'Alice', count: 0, color: '#f97316' },
    ],
    speakerReferenceStats: {
      'spk-1': { transcriptionUnitCount: 2, segmentCount: 1, totalCount: 3 },
      'spk-2': { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 },
    },
    speakerReferenceUnassignedStats: EMPTY_SPEAKER_REFERENCE_STATS,
    speakerReferenceStatsMediaScoped: false,
    speakerReferenceStatsReady: true,
    speakerDialogState: null,
    speakerVisualByUnitId: {},
    selectedUnitIds: new Set(['utt-1', 'utt-2']),
    selectedSpeakerSummary: '当前统一说话人：Alice',
    speakerSaving: false,
    speakerDraftName: '',
    setSpeakerDraftName: vi.fn(),
    batchSpeakerId: 'spk-1',
    setBatchSpeakerId: vi.fn(),
    activeSpeakerFilterKey: 'all',
    setActiveSpeakerFilterKey: vi.fn(),
    handleSelectSpeakerUnits: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleRenameSpeaker: vi.fn(),
    handleMergeSpeaker: vi.fn(),
    handleDeleteSpeaker: vi.fn(),
    handleDeleteUnusedSpeakers: vi.fn(async () => undefined),
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleAssignSpeakerToSelectedRouted: vi.fn(async () => undefined),
    handleClearSpeakerOnSelectedRouted: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    handleCreateSpeakerOnly: vi.fn(async () => undefined),
    closeSpeakerDialog: vi.fn(),
    updateSpeakerDialogDraftName: vi.fn(),
    updateSpeakerDialogTargetKey: vi.fn(),
    confirmSpeakerDialog: vi.fn(async () => undefined),
    ...overrides,
  } as SpeakerRailContextValue;
}

function renderPanel(speakerCtx: SpeakerRailContextValue, onClose = vi.fn()) {
  return {
    ...render(
      <LocaleProvider locale="zh-CN">
        <SidePaneSidebarSpeakerManagement
          speakerCtx={speakerCtx}
          messages={getSidePaneSidebarMessages('zh-CN')}
          onClose={onClose}
        />
      </LocaleProvider>,
    ),
    onClose,
  };
}

afterEach(() => {
  cleanup();
});

describe('SidePaneSidebarSpeakerManagement', () => {
  it('renders speaker management modal shell with summary cards, filters, and group actions', () => {
    const speakerCtx = makeSpeakerContext();
    renderPanel(speakerCtx);

    const dialog = screen.getByRole('dialog', { name: '说话人管理' });
    const closeButton = screen.getByRole('button', { name: '说话人管理 取消' });
    const cards = document.querySelectorAll('.speaker-management-panel-card');
    const group = document.querySelector('.transcription-side-pane-speaker-group') as HTMLDivElement;

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('side-pane-action-modal');
    expect(dialog.className).toContain('side-pane-action-modal-speaker');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('当前统一说话人：Alice')).toBeTruthy();
    expect(screen.getByText('清理未引用实体（1）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '应用说话人' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '清空已选说话人' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '仅新建' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建并分配' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '选择目标说话人' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '新说话人名称' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '取消' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '全部' })).toBeTruthy();
    expect(group).toBeTruthy();
    expect(screen.getByText('该实体当前未被引用，可安全清理')).toBeTruthy();
    expect(screen.getByText('同名组：1')).toBeTruthy();
  });

  it('routes speaker cleanup and rename actions through the panel and closes afterward', async () => {
    const handleDeleteUnusedSpeakers = vi.fn(async () => undefined);
    const handleRenameSpeaker = vi.fn();
    const speakerCtx = makeSpeakerContext({
      handleDeleteUnusedSpeakers,
      handleRenameSpeaker,
    });
    const { onClose } = renderPanel(speakerCtx);

    fireEvent.click(screen.getByRole('button', { name: '清理未引用实体（1）' }));

    await waitFor(() => {
      expect(handleDeleteUnusedSpeakers).toHaveBeenCalledTimes(1);
    });

    const renameButtons = screen.getAllByRole('button', { name: '改名' });
    expect(renameButtons[0]).toBeTruthy();
    fireEvent.click(renameButtons[0] as HTMLElement);

    expect(handleRenameSpeaker).toHaveBeenCalledWith('spk-1');
    await waitFor(() => {
      expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
