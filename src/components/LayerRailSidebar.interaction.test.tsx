// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SpeakerDocType } from '../db';
import type { LayerDocType } from '../db';
import { LayerRailSidebar } from './LayerRailSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

function createLayerActionStub() {
  return {
    layerActionPanel: null,
    setLayerActionPanel: vi.fn(),
    layerActionRootRef: { current: null },
    quickTranscriptionLangId: 'und',
    setQuickTranscriptionLangId: vi.fn(),
    quickTranscriptionCustomLang: '',
    setQuickTranscriptionCustomLang: vi.fn(),
    quickTranscriptionAlias: '',
    setQuickTranscriptionAlias: vi.fn(),
    quickTranscriptionConstraint: 'symbolic_association',
    setQuickTranscriptionConstraint: vi.fn(),
    canConfigureTranscriptionConstraint: false,
    quickTranslationLangId: 'und',
    setQuickTranslationLangId: vi.fn(),
    quickTranslationCustomLang: '',
    setQuickTranslationCustomLang: vi.fn(),
    quickTranslationAlias: '',
    setQuickTranslationAlias: vi.fn(),
    quickTranslationModality: 'text',
    setQuickTranslationModality: vi.fn(),
    quickTranslationConstraint: 'symbolic_association',
    setQuickTranslationConstraint: vi.fn(),
    quickDeleteLayerId: '',
    setQuickDeleteLayerId: vi.fn(),
    handleCreateTranscriptionFromPanel: vi.fn(async () => undefined),
    handleCreateTranslationFromPanel: vi.fn(async () => undefined),
    handleDeleteLayerFromPanel: vi.fn(async () => undefined),
    createLayer: vi.fn(async () => undefined),
    deleteLayer: vi.fn(async () => undefined),
  };
}

function renderSidebar(input?: {
  speakerFilterOptions?: Array<{ key: string; name: string; count: number; color?: string; isEntity: boolean }>;
}) {
  const onSelectSpeakerUtterances = vi.fn();
  const onClearSpeakerAssignments = vi.fn();
  const onExportSpeakerSegments = vi.fn();
  const onRenameSpeaker = vi.fn();
  const onMergeSpeaker = vi.fn();
  const onDeleteSpeaker = vi.fn();
  const setSpeakerDraftName = vi.fn();
  const setBatchSpeakerId = vi.fn();
  const setActiveSpeakerFilterKey = vi.fn();

  const layerAction = createLayerActionStub();
  let actionPanel: 'speaker-management' | 'create-transcription' | 'create-translation' | 'delete' | null = null;
  layerAction.setLayerActionPanel.mockImplementation((updater: unknown) => {
    actionPanel = typeof updater === 'function'
      ? (updater as (prev: typeof actionPanel) => typeof actionPanel)(actionPanel)
      : updater as typeof actionPanel;
  });

  const speakerOptions: SpeakerDocType[] = [
    { id: 'spk-1', name: 'Alice', createdAt: '2026-03-23T00:00:00.000Z', updatedAt: '2026-03-23T00:00:00.000Z' },
  ];

  const speakerManagement = {
    speakerOptions,
    speakerDraftName: '',
    setSpeakerDraftName,
    batchSpeakerId: '',
    setBatchSpeakerId,
    speakerSaving: false,
    activeSpeakerFilterKey: 'all',
    setActiveSpeakerFilterKey,
    speakerDialogState: null,
    speakerVisualByUtteranceId: {},
    speakerFilterOptions: input?.speakerFilterOptions ?? [
      { key: 'spk-1', name: 'Alice', count: 3, isEntity: true },
    ],
    selectedSpeakerSummary: '当前统一说话人：Alice',
    selectedUtteranceIds: new Set(['utt-1']),
    handleSelectSpeakerUtterances: onSelectSpeakerUtterances,
    handleClearSpeakerAssignments: onClearSpeakerAssignments,
    handleExportSpeakerSegments: onExportSpeakerSegments,
    handleRenameSpeaker: onRenameSpeaker,
    handleMergeSpeaker: onMergeSpeaker,
    handleDeleteSpeaker: onDeleteSpeaker,
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    handleCreateSpeakerOnly: vi.fn(async () => undefined),
    closeSpeakerDialog: vi.fn(),
    updateSpeakerDialogDraftName: vi.fn(),
    updateSpeakerDialogTargetKey: vi.fn(),
    confirmSpeakerDialog: vi.fn(async () => undefined),
  };

  const rendered = render(
    <SpeakerRailProvider speakerManagement={speakerManagement}>
      <LayerRailSidebar
        isCollapsed={false}
        layerRailTab="layers"
        onTabChange={vi.fn()}
        layerRailRows={[] as LayerDocType[]}
        focusedLayerRowId=""
        flashLayerRowId=""
        onFocusLayer={vi.fn()}
        transcriptionLayers={[]}
        translationLayers={[]}
        layerLinks={[]}
        toggleLayerLink={vi.fn(async () => undefined)}
        deletableLayers={[]}
        layerCreateMessage=""
        layerAction={{ ...layerAction, layerActionPanel: actionPanel } as never}
        onReorderLayers={vi.fn(async () => undefined)}
      />
    </SpeakerRailProvider>,
  );

  return {
    rerender: (speakerFilterOptions = input?.speakerFilterOptions ?? [
      { key: 'spk-1', name: 'Alice', count: 3, isEntity: true },
    ]) => rendered.rerender(
      <SpeakerRailProvider speakerManagement={{ ...speakerManagement, speakerFilterOptions }}>
        <LayerRailSidebar
          isCollapsed={false}
          layerRailTab="layers"
          onTabChange={vi.fn()}
          layerRailRows={[] as LayerDocType[]}
          focusedLayerRowId=""
          flashLayerRowId=""
          onFocusLayer={vi.fn()}
          transcriptionLayers={[]}
          translationLayers={[]}
          layerLinks={[]}
          toggleLayerLink={vi.fn(async () => undefined)}
          deletableLayers={[]}
          layerCreateMessage=""
          layerAction={{ ...layerAction, layerActionPanel: actionPanel } as never}
          onReorderLayers={vi.fn(async () => undefined)}
        />
      </SpeakerRailProvider>,
    ),
    layerAction,
    onRenameSpeaker,
    onMergeSpeaker,
    onDeleteSpeaker,
  };
}

function renderSidebarForDeleteFlow(input: {
  deletableLayers: LayerDocType[];
  checkLayerHasContent: (layerId: string) => Promise<number>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm: (layerId: string) => Promise<void>;
}) {
  const speakerManagement = {
    speakerOptions: [] as SpeakerDocType[],
    speakerDraftName: '',
    setSpeakerDraftName: vi.fn(),
    batchSpeakerId: '',
    setBatchSpeakerId: vi.fn(),
    speakerSaving: false,
    activeSpeakerFilterKey: 'all',
    setActiveSpeakerFilterKey: vi.fn(),
    speakerDialogState: null,
    speakerVisualByUtteranceId: {},
    speakerFilterOptions: [],
    selectedSpeakerSummary: '',
    selectedUtteranceIds: new Set<string>(),
    handleSelectSpeakerUtterances: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleRenameSpeaker: vi.fn(),
    handleMergeSpeaker: vi.fn(),
    handleDeleteSpeaker: vi.fn(),
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    handleCreateSpeakerOnly: vi.fn(async () => undefined),
    closeSpeakerDialog: vi.fn(),
    updateSpeakerDialogDraftName: vi.fn(),
    updateSpeakerDialogTargetKey: vi.fn(),
    confirmSpeakerDialog: vi.fn(async () => undefined),
  };

  const layerAction = {
    layerActionPanel: 'delete' as const,
    setLayerActionPanel: vi.fn(),
    layerActionRootRef: { current: null },
    quickTranscriptionLangId: 'und',
    setQuickTranscriptionLangId: vi.fn(),
    quickTranscriptionCustomLang: '',
    setQuickTranscriptionCustomLang: vi.fn(),
    quickTranscriptionAlias: '',
    setQuickTranscriptionAlias: vi.fn(),
    quickTranscriptionConstraint: 'symbolic_association' as const,
    setQuickTranscriptionConstraint: vi.fn(),
    canConfigureTranscriptionConstraint: true,
    quickTranslationLangId: 'und',
    setQuickTranslationLangId: vi.fn(),
    quickTranslationCustomLang: '',
    setQuickTranslationCustomLang: vi.fn(),
    quickTranslationAlias: '',
    setQuickTranslationAlias: vi.fn(),
    quickTranslationModality: 'text' as const,
    setQuickTranslationModality: vi.fn(),
    quickTranslationConstraint: 'symbolic_association' as const,
    setQuickTranslationConstraint: vi.fn(),
    quickDeleteLayerId: input.deletableLayers[0]?.id ?? '',
    setQuickDeleteLayerId: vi.fn(),
    quickDeleteKeepUtterances: false,
    setQuickDeleteKeepUtterances: vi.fn(),
    handleCreateTranscriptionFromPanel: vi.fn(async () => undefined),
    handleCreateTranslationFromPanel: vi.fn(async () => undefined),
    createLayer: vi.fn(async () => false),
    deleteLayer: input.deleteLayer,
    deleteLayerWithoutConfirm: input.deleteLayerWithoutConfirm,
    checkLayerHasContent: input.checkLayerHasContent,
  };

  return render(
    <SpeakerRailProvider speakerManagement={speakerManagement}>
      <LayerRailSidebar
        isCollapsed={false}
        layerRailTab="layers"
        onTabChange={vi.fn()}
        layerRailRows={input.deletableLayers}
        focusedLayerRowId={input.deletableLayers[0]?.id ?? ''}
        flashLayerRowId=""
        onFocusLayer={vi.fn()}
        transcriptionLayers={input.deletableLayers.filter((l) => l.layerType === 'transcription')}
        translationLayers={input.deletableLayers.filter((l) => l.layerType === 'translation')}
        layerLinks={[]}
        toggleLayerLink={vi.fn(async () => undefined)}
        deletableLayers={input.deletableLayers}
        layerCreateMessage=""
        layerAction={layerAction as never}
        onReorderLayers={vi.fn(async () => undefined)}
      />
    </SpeakerRailProvider>,
  );
}

function renderSidebarForCreateContextMenuFlow(input: {
  layerRows: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerCreateMessage?: string;
  createLayer?: ReturnType<typeof vi.fn>;
}) {
  const speakerManagement = {
    speakerOptions: [] as SpeakerDocType[],
    speakerDraftName: '',
    setSpeakerDraftName: vi.fn(),
    batchSpeakerId: '',
    setBatchSpeakerId: vi.fn(),
    speakerSaving: false,
    activeSpeakerFilterKey: 'all',
    setActiveSpeakerFilterKey: vi.fn(),
    speakerDialogState: null,
    speakerVisualByUtteranceId: {},
    speakerFilterOptions: [],
    selectedSpeakerSummary: '',
    selectedUtteranceIds: new Set<string>(),
    handleSelectSpeakerUtterances: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleRenameSpeaker: vi.fn(),
    handleMergeSpeaker: vi.fn(),
    handleDeleteSpeaker: vi.fn(),
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    handleCreateSpeakerOnly: vi.fn(async () => undefined),
    closeSpeakerDialog: vi.fn(),
    updateSpeakerDialogDraftName: vi.fn(),
    updateSpeakerDialogTargetKey: vi.fn(),
    confirmSpeakerDialog: vi.fn(async () => undefined),
  };

  const layerAction = {
    layerActionPanel: null,
    setLayerActionPanel: vi.fn(),
    layerActionRootRef: { current: null },
    quickDeleteLayerId: input.layerRows[0]?.id ?? '',
    setQuickDeleteLayerId: vi.fn(),
    quickDeleteKeepUtterances: false,
    setQuickDeleteKeepUtterances: vi.fn(),
    createLayer: input.createLayer ?? vi.fn(async () => false),
    deleteLayer: vi.fn(async () => undefined),
    deleteLayerWithoutConfirm: vi.fn(async () => undefined),
    checkLayerHasContent: vi.fn(async () => 0),
  };

  return render(
    <SpeakerRailProvider speakerManagement={speakerManagement}>
      <LayerRailSidebar
        isCollapsed={false}
        layerRailTab="layers"
        onTabChange={vi.fn()}
        layerRailRows={input.layerRows}
        focusedLayerRowId={input.layerRows[0]?.id ?? ''}
        flashLayerRowId=""
        onFocusLayer={vi.fn()}
        transcriptionLayers={input.transcriptionLayers}
        translationLayers={input.translationLayers}
        layerLinks={[]}
        toggleLayerLink={vi.fn(async () => undefined)}
        deletableLayers={input.layerRows}
        layerCreateMessage={input.layerCreateMessage ?? ''}
        layerAction={layerAction as never}
        onReorderLayers={vi.fn(async () => undefined)}
      />
    </SpeakerRailProvider>,
  );
}

describe('LayerRailSidebar speaker actions interaction', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should call speaker callbacks when clicking 改名/合并/删除说话人实体', () => {
    const { onRenameSpeaker, onMergeSpeaker, onDeleteSpeaker, rerender } = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: '说话人管理' }));
    rerender();

    fireEvent.click(screen.getByRole('button', { name: '改名' }));
    fireEvent.click(screen.getByRole('button', { name: '合并' }));
    fireEvent.click(screen.getByTitle('删除该说话人实体（危险）'));

    expect(onRenameSpeaker).toHaveBeenCalledWith('spk-1');
    expect(onMergeSpeaker).toHaveBeenCalledWith('spk-1');
    expect(onDeleteSpeaker).toHaveBeenCalledWith('spk-1');
  });

  it('should disable 改名/合并 for non-entity speaker option', () => {
    const { rerender } = renderSidebar({
      speakerFilterOptions: [
        { key: 'name:guest', name: '访客', count: 2, isEntity: false },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '说话人管理' }));
    rerender([
      { key: 'name:guest', name: '访客', count: 2, isEntity: false },
    ]);

    const renameBtn = screen.getByRole('button', { name: '改名' }) as HTMLButtonElement;
    const mergeBtn = screen.getByRole('button', { name: '合并' }) as HTMLButtonElement;
    expect(renameBtn.disabled).toBe(true);
    expect(mergeBtn.disabled).toBe(true);
  });

  it('opens confirm dialog first when deleting last transcription layer with dependent translation, then deletes on confirm', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trlLayer = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_en_1',
      name: { zho: '翻译层1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: trcLayer.id,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    const deleteLayer = vi.fn(async () => undefined);
    const deleteLayerWithoutConfirm = vi.fn(async () => undefined);
    renderSidebarForDeleteFlow({
      deletableLayers: [trcLayer, trlLayer],
      checkLayerHasContent: vi.fn(async () => 0),
      deleteLayer,
      deleteLayerWithoutConfirm,
    });

    const deletePanelDialog = screen.getByRole('dialog', { name: '删除层' });
    fireEvent.click(within(deletePanelDialog).getByRole('button', { name: '删除' }));

    expect(await screen.findByRole('button', { name: '确认删除' })).toBeTruthy();
    expect(await screen.findByText(/自动级联删除其依赖翻译层/)).toBeTruthy();
    expect(deleteLayerWithoutConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(deleteLayer).toHaveBeenCalledWith('layer_trc_1', { keepUtterances: false });
  });

  it('opens unified LayerActionPopover from sidebar context menu for both create actions', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trlLayer = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_en_1',
      name: { zho: '翻译层1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayer, trlLayer],
      transcriptionLayers: [trcLayer],
      translationLayers: [trlLayer],
    });

    const layerButton = screen.getByRole('button', { name: /^转写/ });
    fireEvent.contextMenu(layerButton);
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建转写层' }));
    expect(await screen.findByRole('dialog', { name: '新建转写层' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /^转写/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建翻译层' }));
    expect(await screen.findByRole('dialog', { name: '新建翻译层' })).toBeTruthy();
  });

  it('shows prominent error message inside popover when create transcription fails and keeps popover open', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const createLayer = vi.fn(async () => false);

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayer],
      transcriptionLayers: [trcLayer],
      translationLayers: [],
      createLayer,
      layerCreateMessage: '请选择语言。',
    });

    fireEvent.click(screen.getByRole('button', { name: '新建转写' }));
    const dialog = await screen.findByRole('dialog', { name: '新建转写层' });

    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'eng' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    const alertNode = await within(dialog).findByRole('alert');
    expect(alertNode.textContent).toContain('创建失败：请选择语言。');
    expect(screen.getByRole('dialog', { name: '新建转写层' })).toBeTruthy();
    expect(createLayer).toHaveBeenCalled();
  });

  it('shows repair detail panel after constraint repair action', async () => {
    const updateLayerSpy = vi.spyOn(LayerTierUnifiedService, 'updateLayer').mockResolvedValue(undefined);
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trlLayer = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_en_1',
      name: { zho: '翻译层1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'symbolic_association',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayer, trlLayer],
      transcriptionLayers: [trcLayer],
      translationLayers: [trlLayer],
    });

    fireEvent.click(screen.getByRole('button', { name: '约束修复' }));

    await waitFor(() => {
      expect(updateLayerSpy).toHaveBeenCalled();
      expect(screen.getByLabelText('约束修复明细')).toBeTruthy();
      expect(screen.getByText(/missing-parent-layer/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '收起修复明细' }));
    expect(screen.queryByText(/missing-parent-layer/)).toBeNull();
    expect(screen.getByRole('button', { name: '展开修复明细' })).toBeTruthy();
  });
});
