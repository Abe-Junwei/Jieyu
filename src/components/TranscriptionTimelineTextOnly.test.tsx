// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TranslationLayerDocType, UtteranceDocType } from '../db';
import { TranscriptionTimelineTextOnly } from './TranscriptionTimelineTextOnly';

const NOW = new Date().toISOString();

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      start: index * 180,
      size: 180,
      key: `v${index}`,
    })),
    getTotalSize: () => count * 180,
  }),
}));

const editorContextValue = {
  utteranceDrafts: {} as Record<string, string>,
  setUtteranceDrafts: vi.fn(),
  translationDrafts: {} as Record<string, string>,
  setTranslationDrafts: vi.fn(),
  translationTextByLayer: new Map(),
  focusedTranslationDraftKeyRef: { current: null as string | null },
  renderLaneLabel: vi.fn(() => 'lane'),
  getUtteranceTextForLayer: vi.fn(() => 'u1'),
  scheduleAutoSave: vi.fn(),
  clearAutoSaveTimer: vi.fn(),
  saveUtteranceText: vi.fn(async () => undefined),
  saveTextTranslationForUtterance: vi.fn(async () => undefined),
  createLayer: vi.fn(async () => undefined),
  deleteLayer: vi.fn(async () => undefined),
  deleteLayerWithoutConfirm: vi.fn(async () => undefined),
  checkLayerHasContent: vi.fn(async () => 0),
};

vi.mock('../contexts/TranscriptionEditorContext', () => ({
  useTranscriptionEditorContext: () => editorContextValue,
}));

vi.mock('./TimelineLaneHeader', () => ({
  TimelineLaneHeader: ({ layer }: { layer: { id: string } }) => <div data-testid={`header-${layer.id}`} />, 
}));

vi.mock('./LayerActionPopover', () => ({
  LayerActionPopover: () => null,
}));

vi.mock('./DeleteLayerConfirmDialog', () => ({
  DeleteLayerConfirmDialog: () => null,
}));

vi.mock('../hooks/useLayerDeleteConfirm', () => ({
  useLayerDeleteConfirm: () => ({
    deleteLayerConfirm: null,
    deleteConfirmKeepUtterances: false,
    setDeleteConfirmKeepUtterances: vi.fn(),
    requestDeleteLayer: vi.fn(async () => undefined),
    cancelDeleteLayerConfirm: vi.fn(),
    confirmDeleteLayer: vi.fn(async () => undefined),
  }),
}));

vi.mock('../hooks/useTimelineLaneHeightResize', () => ({
  DEFAULT_TIMELINE_LANE_HEIGHT: 44,
  useTimelineLaneHeightResize: () => ({
    resizingLayerId: null,
    startLaneHeightResize: vi.fn(),
  }),
}));

function makeLayer(id: string): TranslationLayerDocType {
  return {
    id,
    textId: 't1',
    key: `trc_${id}`,
    name: { zho: id },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as TranslationLayerDocType;
}

function makeUtterance(id: string, speakerId?: string): UtteranceDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    ...(speakerId ? { speakerId } : {}),
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as UtteranceDocType;
}

describe('TranscriptionTimelineTextOnly lane pointer handling', () => {
  it('does not prevent default pointerdown on text input when lane is expanded', () => {
    const layer = makeLayer('trc-1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1')]}
        selectedUtteranceId=""
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox');
    const pointerDown = createEvent.pointerDown(input, { clientX: 30, clientY: 10 });
    fireEvent(input, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
  });

  it('hides non-target utterances in focus-hard mode', () => {
    const layer = makeLayer('trc-1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1', 's1'), makeUtterance('u2', 's2')]}
        selectedUtteranceId=""
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        speakerFocusMode="focus-hard"
        speakerFocusSpeakerKey="s1"
        speakerVisualByUtteranceId={{
          u1: { name: 'S1', color: '#ff0000' },
          u2: { name: 'S2', color: '#00ff00' },
        }}
      />,
    );

    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2);
    const dimmed = document.querySelectorAll('.timeline-text-item-focus-dim');
    expect(dimmed.length).toBe(0);
    const hidden = document.querySelectorAll('.timeline-text-item-focus-hidden');
    expect(hidden.length).toBe(1);
  });
});
