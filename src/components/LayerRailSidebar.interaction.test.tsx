// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SpeakerDocType } from '../db';
import type { TranslationLayerDocType } from '../db';
import { LayerRailSidebar } from './LayerRailSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';

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
    quickTranslationLangId: 'und',
    setQuickTranslationLangId: vi.fn(),
    quickTranslationCustomLang: '',
    setQuickTranslationCustomLang: vi.fn(),
    quickTranslationAlias: '',
    setQuickTranslationAlias: vi.fn(),
    quickTranslationModality: 'text',
    setQuickTranslationModality: vi.fn(),
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
        layerRailRows={[] as TranslationLayerDocType[]}
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
          layerRailRows={[] as TranslationLayerDocType[]}
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
});
