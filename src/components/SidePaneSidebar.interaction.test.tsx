// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { SpeakerDocType } from '../db';
import type { LayerDocType } from '../db';
import { SidePaneSidebar } from './SidePaneSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';
import { LocaleProvider } from '../i18n';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

const { mockUseOrthographies } = vi.hoisted(() => ({
  mockUseOrthographies: vi.fn<(languageIds: string[]) => Array<Record<string, unknown>>>(() => []),
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

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
    quickDeleteKeepUtterances: false,
    setQuickDeleteKeepUtterances: vi.fn(),
    handleCreateTranscriptionFromPanel: vi.fn(async () => undefined),
    handleCreateTranslationFromPanel: vi.fn(async () => undefined),
    handleDeleteLayerFromPanel: vi.fn(async () => undefined),
    createLayer: vi.fn(async () => undefined),
    deleteLayer: vi.fn(async () => undefined),
    deleteLayerWithoutConfirm: vi.fn(async () => undefined),
    checkLayerHasContent: vi.fn(async () => 0),
  };
}

function renderSidebar(input?: {
  speakerFilterOptions?: Array<{ key: string; name: string; count: number; color?: string }>;
  speakerReferenceStats?: Record<string, { utteranceCount: number; segmentCount: number; totalCount: number }>;
  speakerReferenceStatsReady?: boolean;
}) {
  const onSelectSpeakerUtterances = vi.fn();
  const onClearSpeakerAssignments = vi.fn();
  const onExportSpeakerSegments = vi.fn();
  const onRenameSpeaker = vi.fn();
  const onMergeSpeaker = vi.fn();
  const onDeleteSpeaker = vi.fn();
  const onDeleteUnusedSpeakers = vi.fn(async () => undefined);
  const onAssignSpeakerToSelectedRouted = vi.fn(async () => undefined);
  const onClearSpeakerOnSelectedRouted = vi.fn(async () => undefined);
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
      { key: 'spk-1', name: 'Alice', count: 3 },
    ],
    speakerReferenceStats: input?.speakerReferenceStats ?? {
      'spk-1': { utteranceCount: 2, segmentCount: 1, totalCount: 3 },
    },
    speakerReferenceStatsReady: input?.speakerReferenceStatsReady ?? true,
    selectedSpeakerSummary: '当前统一说话人：Alice',
    selectedUtteranceIds: new Set(['utt-1']),
    handleSelectSpeakerUtterances: onSelectSpeakerUtterances,
    handleClearSpeakerAssignments: onClearSpeakerAssignments,
    handleExportSpeakerSegments: onExportSpeakerSegments,
    handleRenameSpeaker: onRenameSpeaker,
    handleMergeSpeaker: onMergeSpeaker,
    handleDeleteSpeaker: onDeleteSpeaker,
    handleDeleteUnusedSpeakers: onDeleteUnusedSpeakers,
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    handleCreateSpeakerOnly: vi.fn(async () => undefined),
    closeSpeakerDialog: vi.fn(),
    updateSpeakerDialogDraftName: vi.fn(),
    updateSpeakerDialogTargetKey: vi.fn(),
    confirmSpeakerDialog: vi.fn(async () => undefined),
  };

  const rendered = render(
    <LocaleProvider locale="zh-CN">
      <SpeakerRailProvider
        speakerManagement={speakerManagement}
        selectedUtteranceIds={new Set(['utt-1'])}
        handleAssignSpeakerToSelectedRouted={onAssignSpeakerToSelectedRouted}
        handleClearSpeakerOnSelectedRouted={onClearSpeakerOnSelectedRouted}
      >
        <SidePaneSidebar
          sidePaneRows={[] as LayerDocType[]}
          focusedLayerRowId=""
          flashLayerRowId=""
          onFocusLayer={vi.fn()}
          transcriptionLayers={[]}
          toggleLayerLink={vi.fn(async () => undefined)}
          deletableLayers={[]}
          layerCreateMessage=""
          layerAction={{ ...layerAction, layerActionPanel: actionPanel } as never}
          onReorderLayers={vi.fn(async () => undefined)}
        />
      </SpeakerRailProvider>
    </LocaleProvider>,
  );

  return {
    rerender: (speakerFilterOptions = input?.speakerFilterOptions ?? [
      { key: 'spk-1', name: 'Alice', count: 3 },
    ]) => rendered.rerender(
      <LocaleProvider locale="zh-CN">
        <SpeakerRailProvider
          speakerManagement={{ ...speakerManagement, speakerFilterOptions }}
          selectedUtteranceIds={new Set(['utt-1'])}
          handleAssignSpeakerToSelectedRouted={onAssignSpeakerToSelectedRouted}
          handleClearSpeakerOnSelectedRouted={onClearSpeakerOnSelectedRouted}
        >
          <SidePaneSidebar
            sidePaneRows={[] as LayerDocType[]}
            focusedLayerRowId=""
            flashLayerRowId=""
            onFocusLayer={vi.fn()}
            transcriptionLayers={[]}
            toggleLayerLink={vi.fn(async () => undefined)}
            deletableLayers={[]}
            layerCreateMessage=""
            layerAction={{ ...layerAction, layerActionPanel: actionPanel } as never}
            onReorderLayers={vi.fn(async () => undefined)}
          />
        </SpeakerRailProvider>
      </LocaleProvider>,
    ),
    layerAction,
    onRenameSpeaker,
    onMergeSpeaker,
    onDeleteSpeaker,
    onDeleteUnusedSpeakers,
    onAssignSpeakerToSelectedRouted,
    onClearSpeakerOnSelectedRouted,
    setBatchSpeakerId,
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
    speakerReferenceStats: {},
    speakerReferenceStatsReady: true,
    selectedSpeakerSummary: '',
    selectedUtteranceIds: new Set<string>(),
    handleSelectSpeakerUtterances: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleRenameSpeaker: vi.fn(),
    handleMergeSpeaker: vi.fn(),
    handleDeleteSpeaker: vi.fn(),
    handleDeleteUnusedSpeakers: vi.fn(async () => undefined),
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
    <LocaleProvider locale="zh-CN">
      <SpeakerRailProvider
        speakerManagement={speakerManagement}
        selectedUtteranceIds={new Set<string>()}
        handleAssignSpeakerToSelectedRouted={vi.fn(async () => undefined)}
        handleClearSpeakerOnSelectedRouted={vi.fn(async () => undefined)}
      >
        <SidePaneSidebar
          sidePaneRows={input.deletableLayers}
          focusedLayerRowId={input.deletableLayers[0]?.id ?? ''}
          flashLayerRowId=""
          onFocusLayer={vi.fn()}
          transcriptionLayers={input.deletableLayers.filter((l) => l.layerType === 'transcription')}
          toggleLayerLink={vi.fn(async () => undefined)}
          deletableLayers={input.deletableLayers}
          layerCreateMessage=""
          layerAction={layerAction as never}
          onReorderLayers={vi.fn(async () => undefined)}
        />
      </SpeakerRailProvider>
    </LocaleProvider>,
  );
}

function renderSidebarForCreateContextMenuFlow(input: {
  layerRows: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerCreateMessage?: string;
  createLayer?: ReturnType<typeof vi.fn>;
  toggleLayerLink?: (transcriptionKey: string, translationId: string) => Promise<void>;
  onReorderLayers?: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  focusedLayerRowId?: string;
}) {
  const onReorderLayers = input.onReorderLayers ?? (async (_draggedLayerId: string, _targetIndex: number) => undefined);
  const toggleLayerLink: (transcriptionKey: string, translationId: string) => Promise<void> = input.toggleLayerLink
    ?? vi.fn<(transcriptionKey: string, translationId: string) => Promise<void>>(async () => undefined);
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
    speakerReferenceStats: {},
    speakerReferenceStatsReady: true,
    selectedSpeakerSummary: '',
    selectedUtteranceIds: new Set<string>(),
    handleSelectSpeakerUtterances: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleRenameSpeaker: vi.fn(),
    handleMergeSpeaker: vi.fn(),
    handleDeleteSpeaker: vi.fn(),
    handleDeleteUnusedSpeakers: vi.fn(async () => undefined),
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
    <LocaleProvider locale="zh-CN">
      <SpeakerRailProvider
        speakerManagement={speakerManagement}
        selectedUtteranceIds={new Set<string>()}
        handleAssignSpeakerToSelectedRouted={vi.fn(async () => undefined)}
        handleClearSpeakerOnSelectedRouted={vi.fn(async () => undefined)}
      >
        <SidePaneSidebar
          sidePaneRows={input.layerRows}
          focusedLayerRowId={input.focusedLayerRowId ?? input.layerRows[0]?.id ?? ''}
          flashLayerRowId=""
          onFocusLayer={vi.fn()}
          transcriptionLayers={input.transcriptionLayers}
          toggleLayerLink={toggleLayerLink}
          deletableLayers={input.layerRows}
          layerCreateMessage={input.layerCreateMessage ?? ''}
          layerAction={layerAction as never}
          onReorderLayers={onReorderLayers}
        />
      </SpeakerRailProvider>
    </LocaleProvider>,
  );
}

function mockLayerRowRect(element: HTMLElement, top: number, height = 20) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: top,
      top,
      left: 0,
      right: 180,
      bottom: top + height,
      width: 180,
      height,
      toJSON: () => ({}),
    }),
  });
}

async function openSpeakerManagementPanel(sidebar: { layerAction: ReturnType<typeof createLayerActionStub>; rerender: (speakerFilterOptions?: Array<{ key: string; name: string; count: number; color?: string }>) => void }) {
  await act(async () => {
    sidebar.layerAction.setLayerActionPanel('speaker-management');
  });
  sidebar.rerender();
}

async function clickCreateAction(actionName: string) {
  fireEvent.click(screen.getByRole('button', { name: actionName }));
}

describe('SidePaneSidebar speaker actions interaction', () => {
  afterEach(() => {
    mockUseOrthographies.mockReset();
    mockUseOrthographies.mockImplementation(() => []);
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('should call speaker callbacks when clicking 改名/合并/删除说话人实体', async () => {
    const sidebar = renderSidebar();

    await openSpeakerManagementPanel(sidebar);

    fireEvent.click(screen.getByRole('button', { name: '改名' }));
    fireEvent.click(screen.getByRole('button', { name: '合并' }));
    fireEvent.click(screen.getByTitle('删除该说话人实体（危险）'));

    expect(sidebar.onRenameSpeaker).toHaveBeenCalledWith('spk-1');
    expect(sidebar.onMergeSpeaker).toHaveBeenCalledWith('spk-1');
    expect(sidebar.onDeleteSpeaker).toHaveBeenCalledWith('spk-1');
  });

  it('shows orphan speaker entities even when current filter list is empty', async () => {
    const sidebar = renderSidebar({
      speakerFilterOptions: [],
      speakerReferenceStats: {
        'spk-1': { utteranceCount: 0, segmentCount: 0, totalCount: 0 },
      },
    });

    await openSpeakerManagementPanel(sidebar);
    sidebar.rerender([]);

    expect(screen.getByText('说话人实体：1')).toBeTruthy();
    expect(screen.getByText('未引用实体：1')).toBeTruthy();
    expect(screen.getByText('当前范围未引用')).toBeTruthy();
    expect(screen.getByRole('button', { name: '改名' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '合并' })).toBeTruthy();
    expect(screen.getByTitle('删除该说话人实体（危险）')).toBeTruthy();
  });

  it('shows project-wide speaker counts and cleanup action for unused entities', async () => {
    const sidebar = renderSidebar({
      speakerReferenceStats: {
        'spk-1': { utteranceCount: 2, segmentCount: 3, totalCount: 5 },
      },
    });

    await openSpeakerManagementPanel(sidebar);

    expect(screen.getByText('全项目已引用：1')).toBeTruthy();
    expect(screen.getByText('全项目引用：5')).toBeTruthy();
    expect(screen.getByText('主轴句段：2 / 独立语段：3')).toBeTruthy();
  });

  it('calls cleanup action for unused speaker entities', async () => {
    const orphanCase = renderSidebar({
      speakerFilterOptions: [],
      speakerReferenceStats: {
        'spk-1': { utteranceCount: 0, segmentCount: 0, totalCount: 0 },
      },
    });

    await openSpeakerManagementPanel(orphanCase);
    orphanCase.rerender([]);
    fireEvent.click(screen.getByRole('button', { name: '清理未引用实体（1）' }));

    expect(orphanCase.onDeleteUnusedSpeakers).toHaveBeenCalled();
  });

  it('separates applying a target speaker from clearing selected speakers', async () => {
    const onAssignSpeakerToSelectedRouted = vi.fn(async () => undefined);
    const onClearSpeakerOnSelectedRouted = vi.fn(async () => undefined);

    function StatefulSidebarHost() {
      const [batchSpeakerId, setBatchSpeakerId] = useState('');
      const [layerActionPanel, setLayerActionPanel] = useState<'speaker-management' | 'create-transcription' | 'create-translation' | 'delete' | null>('speaker-management');
      const layerAction = {
        ...createLayerActionStub(),
        layerActionPanel,
        setLayerActionPanel,
      };
      const speakerManagement = {
        speakerOptions: [{ id: 'spk-1', name: 'Alice', createdAt: '2026-03-23T00:00:00.000Z', updatedAt: '2026-03-23T00:00:00.000Z' }],
        speakerDraftName: '',
        setSpeakerDraftName: vi.fn(),
        batchSpeakerId,
        setBatchSpeakerId,
        speakerSaving: false,
        activeSpeakerFilterKey: 'all',
        setActiveSpeakerFilterKey: vi.fn(),
        speakerDialogState: null,
        speakerVisualByUtteranceId: {},
        speakerFilterOptions: [{ key: 'spk-1', name: 'Alice', count: 3 }],
        speakerReferenceStats: { 'spk-1': { utteranceCount: 2, segmentCount: 1, totalCount: 3 } },
        speakerReferenceStatsReady: true,
        selectedSpeakerSummary: '当前包含未标注项；已标注说话人：Alice',
        handleSelectSpeakerUtterances: vi.fn(),
        handleClearSpeakerAssignments: vi.fn(),
        handleExportSpeakerSegments: vi.fn(),
        handleRenameSpeaker: vi.fn(),
        handleMergeSpeaker: vi.fn(),
        handleDeleteSpeaker: vi.fn(),
        handleDeleteUnusedSpeakers: vi.fn(async () => undefined),
        handleAssignSpeakerToSelected: vi.fn(async () => undefined),
        handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
        handleCreateSpeakerOnly: vi.fn(async () => undefined),
        closeSpeakerDialog: vi.fn(),
        updateSpeakerDialogDraftName: vi.fn(),
        updateSpeakerDialogTargetKey: vi.fn(),
        confirmSpeakerDialog: vi.fn(async () => undefined),
      };

      return (
        <>
          <button type="button" onClick={() => setLayerActionPanel('speaker-management')}>打开说话人管理</button>
          <SpeakerRailProvider
            speakerManagement={speakerManagement}
            selectedUtteranceIds={new Set(['utt-1', 'utt-2'])}
            handleAssignSpeakerToSelectedRouted={onAssignSpeakerToSelectedRouted}
            handleClearSpeakerOnSelectedRouted={onClearSpeakerOnSelectedRouted}
          >
            <SidePaneSidebar
              sidePaneRows={[] as LayerDocType[]}
              focusedLayerRowId=""
              flashLayerRowId=""
              onFocusLayer={vi.fn()}
              transcriptionLayers={[]}
              toggleLayerLink={vi.fn(async () => undefined)}
              deletableLayers={[]}
              layerCreateMessage=""
              layerAction={layerAction as never}
              onReorderLayers={vi.fn(async () => undefined)}
            />
          </SpeakerRailProvider>
        </>
      );
    }

    render(
      <LocaleProvider locale="zh-CN">
        <StatefulSidebarHost />
      </LocaleProvider>,
    );

    expect(screen.getByRole('button', { name: '清空已选说话人' }).className).toContain('panel-button');
    const speakerSelect = screen.getAllByRole('combobox').find(
      (element): element is HTMLSelectElement => element instanceof HTMLSelectElement,
    );
    expect(speakerSelect).toBeTruthy();
    fireEvent.change(speakerSelect!, { target: { value: 'spk-1' } });
    fireEvent.click(screen.getByRole('button', { name: '应用说话人' }));

    expect(onAssignSpeakerToSelectedRouted).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '应用说话人' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '打开说话人管理' }));
    fireEvent.click(screen.getByRole('button', { name: '清空已选说话人' }));

    expect(onClearSpeakerOnSelectedRouted).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '清空已选说话人' })).toBeNull();
    });
  });

  it('closes the speaker management panel after selecting a grouped speaker action', async () => {
    function StatefulGroupActionHost() {
      const [layerActionPanel, setLayerActionPanel] = useState<'speaker-management' | 'create-transcription' | 'create-translation' | 'delete' | null>('speaker-management');
      const layerAction = {
        ...createLayerActionStub(),
        layerActionPanel,
        setLayerActionPanel,
      };
      const speakerManagement = {
        speakerOptions: [{ id: 'spk-1', name: 'Alice', createdAt: '2026-03-23T00:00:00.000Z', updatedAt: '2026-03-23T00:00:00.000Z' }],
        speakerDraftName: '',
        setSpeakerDraftName: vi.fn(),
        batchSpeakerId: '',
        setBatchSpeakerId: vi.fn(),
        speakerSaving: false,
        activeSpeakerFilterKey: 'all',
        setActiveSpeakerFilterKey: vi.fn(),
        speakerDialogState: null,
        speakerVisualByUtteranceId: {},
        speakerFilterOptions: [{ key: 'spk-1', name: 'Alice', count: 3 }],
        speakerReferenceStats: { 'spk-1': { utteranceCount: 2, segmentCount: 1, totalCount: 3 } },
        speakerReferenceStatsReady: true,
        selectedSpeakerSummary: '当前统一说话人：Alice',
        handleSelectSpeakerUtterances: vi.fn(),
        handleClearSpeakerAssignments: vi.fn(),
        handleExportSpeakerSegments: vi.fn(),
        handleRenameSpeaker: vi.fn(),
        handleMergeSpeaker: vi.fn(),
        handleDeleteSpeaker: vi.fn(),
        handleDeleteUnusedSpeakers: vi.fn(async () => undefined),
        handleAssignSpeakerToSelected: vi.fn(async () => undefined),
        handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
        handleCreateSpeakerOnly: vi.fn(async () => undefined),
        closeSpeakerDialog: vi.fn(),
        updateSpeakerDialogDraftName: vi.fn(),
        updateSpeakerDialogTargetKey: vi.fn(),
        confirmSpeakerDialog: vi.fn(async () => undefined),
      };

      return (
        <>
          <button type="button" onClick={() => setLayerActionPanel('speaker-management')}>打开说话人管理</button>
          <SpeakerRailProvider
            speakerManagement={speakerManagement}
            selectedUtteranceIds={new Set(['utt-1'])}
            handleAssignSpeakerToSelectedRouted={vi.fn(async () => undefined)}
            handleClearSpeakerOnSelectedRouted={vi.fn(async () => undefined)}
          >
            <SidePaneSidebar
              sidePaneRows={[] as LayerDocType[]}
              focusedLayerRowId=""
              flashLayerRowId=""
              onFocusLayer={vi.fn()}
              transcriptionLayers={[]}
              toggleLayerLink={vi.fn(async () => undefined)}
              deletableLayers={[]}
              layerCreateMessage=""
              layerAction={layerAction as never}
              onReorderLayers={vi.fn(async () => undefined)}
            />
          </SpeakerRailProvider>
        </>
      );
    }

    render(
      <LocaleProvider locale="zh-CN">
        <StatefulGroupActionHost />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '选中' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '改名' })).toBeNull();
    });
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

    const layerButton = screen.getByRole('button', { name: /中文/ });
    fireEvent.contextMenu(layerButton);
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建转写层' }));
    const transcriptionDialog = await screen.findByRole('dialog', { name: '新建转写层' });
    expect(transcriptionDialog).toBeTruthy();
    expect(within(transcriptionDialog).queryByText(/时间细分/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '新建转写层 取消' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /中文/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建翻译层' }));
    const translationDialog = await screen.findByRole('dialog', { name: '新建翻译层' });
    expect(translationDialog).toBeTruthy();
    expect(within(translationDialog).queryByText(/时间细分/)).toBeNull();
    expect(within(translationDialog).queryByText(/独立边界/)).toBeNull();
  });

  it('preserves orthography defaults when creating layers from the sidebar popover', async () => {
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
    const createLayer = vi.fn(async () => true);
    mockUseOrthographies.mockImplementation((languageIds: string[]) => (
      languageIds.includes('eng')
        ? [{
          id: 'orth_eng_default',
          languageId: 'eng',
          name: { eng: 'English Default' },
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: now,
          updatedAt: now,
        }]
        : []
    ));

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayer],
      transcriptionLayers: [trcLayer],
      translationLayers: [],
      createLayer,
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: /中文/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建转写层' }));

    const dialog = await screen.findByRole('dialog', { name: '新建转写层' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '语言 ID（系统唯一标识）' }), { target: { value: 'eng' } });

    await waitFor(() => {
      expect((within(dialog).getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_eng_default');
      expect((within(dialog).getByRole('button', { name: '新建转写层' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(within(dialog).getByRole('button', { name: '新建转写层' }));

    await waitFor(() => {
      expect(createLayer).toHaveBeenCalledWith(
        'transcription',
        expect.objectContaining({
          languageId: 'eng',
          orthographyId: 'orth_eng_default',
        }),
        undefined,
      );
    });
  });

  it('allows switching transcription constraint back to dependent after choosing independent', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayerA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trcLayerB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_en_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayerA, trcLayerB],
      transcriptionLayers: [trcLayerA, trcLayerB],
      translationLayers: [],
    });

    await clickCreateAction('新建转写层');
    const dialog = await screen.findByRole('dialog', { name: '新建转写层' });
    const independentRadio = within(dialog).getByRole('radio', { name: /独立边界/ }) as HTMLInputElement;
    const dependentRadio = within(dialog).getByRole('radio', { name: /依赖边界/ }) as HTMLInputElement;

    expect(dependentRadio.disabled).toBe(false);
    fireEvent.click(independentRadio);
    expect(independentRadio.checked).toBe(true);

    fireEvent.click(dependentRadio);
    expect(dependentRadio.checked).toBe(true);
    expect(dependentRadio.disabled).toBe(false);
  });

  it('requires selecting a parent boundary when creating translation with multiple independent transcription layers', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayerA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trcLayerB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_en_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const createLayer = vi.fn(async () => true);

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayerA, trcLayerB],
      transcriptionLayers: [trcLayerA, trcLayerB],
      translationLayers: [],
      createLayer,
    });

    await clickCreateAction('新建翻译层');
    const dialog = await screen.findByRole('dialog', { name: '新建翻译层' });
    const selects = within(dialog)
      .getAllByRole('combobox')
      .filter((select): select is HTMLSelectElement => select instanceof HTMLSelectElement);
    const parentSelect = selects.find((select) => (
      Array.from(select.options).some((option) => option.value === 'layer_trc_2')
    ));
    expect(parentSelect).toBeTruthy();

    const languageCodeInput = within(dialog).getByRole('textbox', { name: /语言代码|Source language code/i });
    fireEvent.change(languageCodeInput, { target: { value: 'fra' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '新建翻译层' }));

    expect(createLayer).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/当前限制：无法新建翻译。请选择依赖层/)).toBeTruthy();

    fireEvent.change(parentSelect as HTMLSelectElement, { target: { value: 'layer_trc_2' } });
    await waitFor(() => {
      const latestParentSelect = within(dialog)
        .getAllByRole('combobox')
        .filter((select): select is HTMLSelectElement => select instanceof HTMLSelectElement)
        .find((select) => Array.from(select.options).some((option) => option.value === 'layer_trc_2'));
      expect(latestParentSelect?.value).toBe('layer_trc_2');
    });
    expect(createLayer).not.toHaveBeenCalled();
  });

  it('uses the clicked transcription row as the default parent when creating a translation layer', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayerA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trcLayerB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_jpn_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'jpn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const createLayer = vi.fn(async () => true);

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayerA, trcLayerB],
      transcriptionLayers: [trcLayerA, trcLayerB],
      translationLayers: [],
      createLayer,
    });

    fireEvent.contextMenu(screen.getByTitle('转写 · 日语 jpn'));
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建翻译层' }));

    const dialog = await screen.findByRole('dialog', { name: '新建翻译层' });
    const parentSelect = within(dialog)
      .getAllByRole('combobox')
      .filter((select): select is HTMLSelectElement => select instanceof HTMLSelectElement)
      .find((select) => Array.from(select.options).some((option) => option.value === 'layer_trc_2'));
    expect(parentSelect?.value).toBe('layer_trc_2');

    fireEvent.change(within(dialog).getByRole('textbox', { name: '语言 ID（系统唯一标识）' }), { target: { value: 'fra' } });
    await waitFor(() => {
      expect((within(dialog).getByRole('button', { name: '新建翻译层' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '新建翻译层' }));

    await waitFor(() => {
      expect(createLayer).toHaveBeenCalledWith(
        'translation',
        expect.objectContaining({
          languageId: 'fra',
          parentLayerId: 'layer_trc_2',
        }),
        'text',
      );
    });
  });

  it('edits translation parent relation from the current layer inspector', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayerA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trcLayerB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_eng_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const trlLayer = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_fra_1',
      name: { zho: '翻译层丙' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: trcLayerA.id,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    const toggleLayerLink = vi.fn(async () => undefined);

    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayerA, trcLayerB, trlLayer],
      transcriptionLayers: [trcLayerA, trcLayerB],
      translationLayers: [trlLayer],
      toggleLayerLink,
      focusedLayerRowId: trlLayer.id,
    });

    const inspector = within(screen.getByLabelText('当前层详情'));
    expect(view.container.querySelectorAll('.transcription-side-pane-item-row')).toHaveLength(3);
    const relationSelect = inspector.getByRole('combobox', { name: '依赖转写层' }) as HTMLSelectElement;

    fireEvent.change(relationSelect, { target: { value: 'trc_eng_1' } });

    await waitFor(() => {
      expect(toggleLayerLink).toHaveBeenCalledWith('trc_eng_1', 'layer_trl_1');
    });
  });

  it('shows an independent bridge-rule entry in current-layer inspector when the focused layer has an orthography', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_bridge',
      textId: 'text_1',
      key: 'trc_eng_bridge',
      name: { zho: '转写层桥接' },
      layerType: 'transcription',
      languageId: 'eng',
      orthographyId: 'orth-bridge',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth-bridge',
          languageId: 'eng',
          name: { eng: 'Bridge Orthography' },
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: now,
          updatedAt: now,
        }];
      }
      return [];
    });

    renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayer],
      transcriptionLayers: [trcLayer],
      translationLayers: [],
      focusedLayerRowId: trcLayer.id,
    });

    const inspector = within(screen.getByLabelText('当前层详情'));
    await waitFor(() => {
      expect(inspector.getByText('Bridge Orthography · Latn · practical')).toBeTruthy();
      expect(inspector.getByRole('link', { name: '打开正字法桥接工作台' })).toBeTruthy();
    });

    const workspaceLink = inspector.getByRole('link', { name: '打开正字法桥接工作台' });
    expect(workspaceLink.getAttribute('href')).toBe('/assets/orthographies?orthographyId=orth-bridge&fromLayerId=layer_trc_bridge');
    expect(inspector.getByText('写入桥接规则已迁移到独立的正字法工作台，当前检视器只保留跳转入口。')).toBeTruthy();
  });

  it('keeps hook order stable when the focused-layer inspector switches from empty to populated', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_focus_toggle',
      textId: 'text_1',
      key: 'trc_eng_focus_toggle',
      name: { zho: '转写层切换' },
      layerType: 'transcription',
      languageId: 'eng',
      orthographyId: 'orth-focus-toggle',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth-focus-toggle',
          languageId: 'eng',
          name: { eng: 'Focus Toggle Orthography' },
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: now,
          updatedAt: now,
        }];
      }
      return [];
    });

    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [trcLayer],
      transcriptionLayers: [trcLayer],
      translationLayers: [],
      focusedLayerRowId: '',
    });

    expect(screen.getByText('请选择一个层查看详情。')).toBeTruthy();

    view.rerender(
      <LocaleProvider locale="zh-CN">
        <SpeakerRailProvider
          speakerManagement={{
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
            speakerReferenceStats: {},
            speakerReferenceStatsReady: true,
            selectedSpeakerSummary: '',
            handleSelectSpeakerUtterances: vi.fn(),
            handleClearSpeakerAssignments: vi.fn(),
            handleExportSpeakerSegments: vi.fn(),
            handleRenameSpeaker: vi.fn(),
            handleMergeSpeaker: vi.fn(),
            handleDeleteSpeaker: vi.fn(),
            handleDeleteUnusedSpeakers: vi.fn(async () => undefined),
            handleAssignSpeakerToSelected: vi.fn(async () => undefined),
            handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
            handleCreateSpeakerOnly: vi.fn(async () => undefined),
            closeSpeakerDialog: vi.fn(),
            updateSpeakerDialogDraftName: vi.fn(),
            updateSpeakerDialogTargetKey: vi.fn(),
            confirmSpeakerDialog: vi.fn(async () => undefined),
          }}
          selectedUtteranceIds={new Set<string>()}
          handleAssignSpeakerToSelectedRouted={vi.fn(async () => undefined)}
          handleClearSpeakerOnSelectedRouted={vi.fn(async () => undefined)}
        >
          <SidePaneSidebar
            sidePaneRows={[trcLayer]}
            focusedLayerRowId={trcLayer.id}
            flashLayerRowId=""
            onFocusLayer={vi.fn()}
            transcriptionLayers={[trcLayer]}
            toggleLayerLink={vi.fn(async () => undefined)}
            deletableLayers={[trcLayer]}
            layerCreateMessage=""
            layerAction={{
              layerActionPanel: null,
              setLayerActionPanel: vi.fn(),
              layerActionRootRef: { current: null },
              quickDeleteLayerId: trcLayer.id,
              setQuickDeleteLayerId: vi.fn(),
              quickDeleteKeepUtterances: false,
              setQuickDeleteKeepUtterances: vi.fn(),
              createLayer: vi.fn(async () => false),
              deleteLayer: vi.fn(async () => undefined),
              deleteLayerWithoutConfirm: vi.fn(async () => undefined),
              checkLayerHasContent: vi.fn(async () => 0),
            } as never}
            onReorderLayers={vi.fn(async () => undefined)}
          />
        </SpeakerRailProvider>
      </LocaleProvider>,
    );

    const inspector = within(screen.getByLabelText('当前层详情'));
    await waitFor(() => {
      expect(inspector.getByText('转写 · 英语 eng')).toBeTruthy();
      expect(inspector.getByText(/Focus Toggle Orthography/)).toBeTruthy();
      expect(inspector.getByRole('link', { name: '打开正字法桥接工作台' })).toBeTruthy();
    });
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

    await clickCreateAction('新建转写层');
    const dialog = await screen.findByRole('dialog', { name: '新建转写层' });

    fireEvent.change(within(dialog).getByRole('textbox', { name: '语言 ID（系统唯一标识）' }), { target: { value: 'eng' } });
    await waitFor(() => {
      expect((within(dialog).getByRole('button', { name: '新建转写层' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '新建转写层' }));

    const alertNode = await within(dialog).findByRole('alert');
    expect(alertNode.textContent).toContain('创建失败请选择语言。');
    expect(screen.getByRole('dialog', { name: '新建转写层' })).toBeTruthy();
    expect(createLayer).toHaveBeenCalled();
  });

  it('forwards the global drop index when dragging layer rows in the sidebar', async () => {
    vi.useFakeTimers();

    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const rootB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_jpn_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'jpn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const translation = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_fra_1',
      name: { zho: '翻译层丙' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: 'layer_trc_2',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const onReorderLayers = vi.fn(async () => undefined);

    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [rootA, rootB, translation],
      transcriptionLayers: [rootA, rootB],
      translationLayers: [translation],
      onReorderLayers,
    });

    const rowButtons = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item'));
    const rowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(rowButtons).toHaveLength(3);
    expect(rowWrappers).toHaveLength(3);
    mockLayerRowRect(rowButtons[0]!, 0);
    mockLayerRowRect(rowButtons[1]!, 20);
    mockLayerRowRect(rowButtons[2]!, 40);
    mockLayerRowRect(rowWrappers[0]!, 0);
    mockLayerRowRect(rowWrappers[1]!, 20);
    mockLayerRowRect(rowWrappers[2]!, 40);

    const overview = view.container.querySelector('.transcription-side-pane-overview') as HTMLElement | null;
    expect(overview).toBeTruthy();

    fireEvent.mouseDown(rowButtons[0]!);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.mouseMove(overview!, { clientY: 100 });
    fireEvent.mouseUp(document, { clientY: 100 });

    expect(onReorderLayers).toHaveBeenCalledWith('layer_trc_1', 3);
  });

  it('commits the last preview drop target even when mouseup snaps near the source row', async () => {
    vi.useFakeTimers();

    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const rootB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_jpn_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'jpn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const translation = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_fra_1',
      name: { zho: '翻译层丙' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: 'layer_trc_2',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const onReorderLayers = vi.fn(async () => undefined);

    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [rootA, rootB, translation],
      transcriptionLayers: [rootA, rootB],
      translationLayers: [translation],
      onReorderLayers,
    });

    const rowButtons = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item'));
    const rowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(rowButtons).toHaveLength(3);
    expect(rowWrappers).toHaveLength(3);
    mockLayerRowRect(rowButtons[0]!, 0);
    mockLayerRowRect(rowButtons[1]!, 20);
    mockLayerRowRect(rowButtons[2]!, 40);
    mockLayerRowRect(rowWrappers[0]!, 0);
    mockLayerRowRect(rowWrappers[1]!, 20);
    mockLayerRowRect(rowWrappers[2]!, 40);

    const overview = view.container.querySelector('.transcription-side-pane-overview') as HTMLElement | null;
    expect(overview).toBeTruthy();

    fireEvent.mouseDown(rowButtons[0]!);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // 先移动到底部，形成明确的目标落点（index=3）。
    fireEvent.mouseMove(overview!, { clientY: 100 });
    // 抬手位置回到源行附近，不能覆盖掉最后一次预览落点。
    fireEvent.mouseUp(document, { clientY: 2 });

    expect(onReorderLayers).toHaveBeenCalledWith('layer_trc_1', 3);
  });

  it('reparents dependent drag when dropping below target root row', async () => {
    vi.useFakeTimers();

    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层甲' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const translationA = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_fra_1',
      name: { zho: '翻译层甲' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const rootB = {
      id: 'layer_trc_2',
      textId: 'text_1',
      key: 'trc_jpn_1',
      name: { zho: '转写层乙' },
      layerType: 'transcription',
      languageId: 'jpn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const rootC = {
      id: 'layer_trc_3',
      textId: 'text_1',
      key: 'trc_eng_1',
      name: { zho: '转写层丙' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const onReorderLayers = vi.fn(async () => undefined);

    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [rootA, translationA, rootB, rootC],
      transcriptionLayers: [rootA, rootB, rootC],
      translationLayers: [translationA],
      onReorderLayers,
    });

    const rowButtons = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item'));
    const rowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(rowButtons).toHaveLength(4);
    expect(rowWrappers).toHaveLength(4);
    mockLayerRowRect(rowButtons[0]!, 0);
    mockLayerRowRect(rowButtons[1]!, 20);
    mockLayerRowRect(rowButtons[2]!, 40);
    mockLayerRowRect(rowButtons[3]!, 60);
    mockLayerRowRect(rowWrappers[0]!, 0);
    mockLayerRowRect(rowWrappers[1]!, 20);
    mockLayerRowRect(rowWrappers[2]!, 40);
    mockLayerRowRect(rowWrappers[3]!, 60);

    const overview = view.container.querySelector('.transcription-side-pane-overview') as HTMLElement | null;
    expect(overview).toBeTruthy();

    fireEvent.mouseDown(rowButtons[1]!, { clientY: 28 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const activeRowButtons = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item'));
    const activeRowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(activeRowButtons).toHaveLength(4);
    expect(activeRowWrappers).toHaveLength(4);
    mockLayerRowRect(activeRowButtons[0]!, 0);
    mockLayerRowRect(activeRowButtons[1]!, 20);
    mockLayerRowRect(activeRowButtons[2]!, 40);
    mockLayerRowRect(activeRowButtons[3]!, 60);
    mockLayerRowRect(activeRowWrappers[0]!, 0);
    mockLayerRowRect(activeRowWrappers[1]!, 20);
    mockLayerRowRect(activeRowWrappers[2]!, 40);
    mockLayerRowRect(activeRowWrappers[3]!, 60);

    // 光标放在目标根层 rootB 的下半区（过去这里会偏向下一根层）。
    fireEvent.mouseMove(overview!, { clientY: 55 });
    fireEvent.mouseUp(document, { clientY: 55 });

    // UI 提交边界落点，实际父层归位由 resolveLayerDrop 在服务层收敛。
    expect(onReorderLayers).toHaveBeenCalledWith('layer_trl_1', 3);
  });

  it('drags a root bundle together with its dependent rows in the rail preview', async () => {
    vi.useFakeTimers();

    const now = '2026-03-25T00:00:00.000Z';
    const root = {
      id: 'layer_trc_root',
      textId: 'text_1',
      key: 'trc_zho_root',
      name: { zho: '转写根层' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const child = {
      id: 'layer_trl_child',
      textId: 'text_1',
      key: 'trl_eng_child',
      name: { zho: '依赖翻译层' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: root.id,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const otherRoot = {
      id: 'layer_trc_other',
      textId: 'text_1',
      key: 'trc_jpn_other',
      name: { zho: '另一根层' },
      layerType: 'transcription',
      languageId: 'jpn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [root, child, otherRoot],
      transcriptionLayers: [root, otherRoot],
      translationLayers: [child],
      onReorderLayers: vi.fn(async () => undefined),
    });

    const rowButtons = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item'));
    const rowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(rowButtons).toHaveLength(3);
    expect(rowWrappers).toHaveLength(3);
    mockLayerRowRect(rowButtons[0]!, 0);
    mockLayerRowRect(rowButtons[1]!, 20);
    mockLayerRowRect(rowButtons[2]!, 40);
    mockLayerRowRect(rowWrappers[0]!, 0);
    mockLayerRowRect(rowWrappers[1]!, 20);
    mockLayerRowRect(rowWrappers[2]!, 40);

    const overview = view.container.querySelector('.transcription-side-pane-overview') as HTMLElement | null;
    expect(overview).toBeTruthy();

    fireEvent.mouseDown(rowButtons[0]!, { clientY: 10 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.mouseMove(overview!, { clientY: 70 });

    expect(rowWrappers[0]!.classList.contains('transcription-side-pane-item-row-dragging')).toBe(true);
    expect(rowWrappers[1]!.classList.contains('transcription-side-pane-item-row-dragging')).toBe(true);
  });

  it('snaps a root bundle drag to the next bundle boundary index and highlights the target bundle', async () => {
    vi.useFakeTimers();

    const now = '2026-03-25T00:00:00.000Z';
    const root = {
      id: 'layer_trc_root',
      textId: 'text_1',
      key: 'trc_zho_root',
      name: { zho: '转写根层' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const child = {
      id: 'layer_trl_child',
      textId: 'text_1',
      key: 'trl_eng_child',
      name: { zho: '依赖翻译层' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: root.id,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;
    const otherRoot = {
      id: 'layer_trc_other',
      textId: 'text_1',
      key: 'trc_jpn_other',
      name: { zho: '另一根层' },
      layerType: 'transcription',
      languageId: 'jpn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType;

    const onReorderLayers = vi.fn(async () => undefined);
    const view = renderSidebarForCreateContextMenuFlow({
      layerRows: [root, child, otherRoot],
      transcriptionLayers: [root, otherRoot],
      translationLayers: [child],
      onReorderLayers,
    });

    const rowButtons = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item'));
    const rowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(rowButtons).toHaveLength(3);
    expect(rowWrappers).toHaveLength(3);
    mockLayerRowRect(rowButtons[0]!, 0);
    mockLayerRowRect(rowButtons[1]!, 20);
    mockLayerRowRect(rowButtons[2]!, 40);
    mockLayerRowRect(rowWrappers[0]!, 0);
    mockLayerRowRect(rowWrappers[1]!, 20);
    mockLayerRowRect(rowWrappers[2]!, 40);

    fireEvent.mouseDown(rowButtons[0]!, { clientY: 10 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const overview = view.container.querySelector('.transcription-side-pane-overview') as HTMLElement | null;
    expect(overview).toBeTruthy();

    fireEvent.mouseMove(overview!, { clientY: 42 });
    await act(async () => {});

    const updatedRowWrappers = Array.from(view.container.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    expect(updatedRowWrappers[2]!.classList.contains('transcription-side-pane-item-row-bundle-target')).toBe(true);
    fireEvent.mouseUp(document, { clientY: 42 });

    expect(onReorderLayers).toHaveBeenCalledWith('layer_trc_root', 3);
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
