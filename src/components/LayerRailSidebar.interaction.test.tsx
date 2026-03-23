// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TranslationLayerDocType } from '../../db';
import { LayerRailSidebar } from './LayerRailSidebar';

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
  const onRenameSpeaker = vi.fn();
  const onMergeSpeaker = vi.fn();

  render(
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
      layerAction={createLayerActionStub() as never}
      onReorderLayers={vi.fn(async () => undefined)}
      speakerFilterOptions={input?.speakerFilterOptions ?? [
        { key: 'spk-1', name: 'Alice', count: 3, isEntity: true },
      ]}
      activeSpeakerFilterKey="all"
      onSpeakerFilterChange={vi.fn()}
      onSelectSpeakerUtterances={vi.fn()}
      onClearSpeakerAssignments={vi.fn()}
      onExportSpeakerSegments={vi.fn()}
      onRenameSpeaker={onRenameSpeaker}
      onMergeSpeaker={onMergeSpeaker}
    />,
  );

  return {
    onRenameSpeaker,
    onMergeSpeaker,
  };
}

describe('LayerRailSidebar speaker actions interaction', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should call speaker callbacks when clicking 改名/合并', () => {
    const { onRenameSpeaker, onMergeSpeaker } = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: '改名' }));
    fireEvent.click(screen.getByRole('button', { name: '合并' }));

    expect(onRenameSpeaker).toHaveBeenCalledWith('spk-1');
    expect(onMergeSpeaker).toHaveBeenCalledWith('spk-1');
  });

  it('should disable 改名/合并 for non-entity speaker option', () => {
    renderSidebar({
      speakerFilterOptions: [
        { key: 'name:guest', name: '访客', count: 2, isEntity: false },
      ],
    });

    const renameBtn = screen.getByRole('button', { name: '改名' }) as HTMLButtonElement;
    const mergeBtn = screen.getByRole('button', { name: '合并' }) as HTMLButtonElement;
    expect(renameBtn.disabled).toBe(true);
    expect(mergeBtn.disabled).toBe(true);
  });
});
