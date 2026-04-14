// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerSegmentContentDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { TranscriptionTimelineTextOnly } from './TranscriptionTimelineTextOnly';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';

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

const timelineLaneHeaderMock = vi.fn(({ layer }: { layer: { id: string } }) => <div data-testid={`header-${layer.id}`} />);

vi.mock('./TimelineLaneHeader', () => ({
  TimelineLaneHeader: (props: { layer: { id: string }; trackModeControl?: { lockConflictCount?: number } }) => timelineLaneHeaderMock(props),
}));

afterEach(() => {
  timelineLaneHeaderMock.mockClear();
  editorContextValue.translationTextByLayer = new Map();
  editorContextValue.translationDrafts = {};
  cleanup();
});

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

function makeLayer(id: string): LayerDocType {
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
  } as LayerDocType;
}

function makeUtterance(id: string, speakerId?: string, speaker?: string): UtteranceDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    ...(speakerId ? { speakerId } : {}),
    ...(speaker ? { speaker } : {}),
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as UtteranceDocType;
}

describe('TranscriptionTimelineTextOnly lane pointer handling', () => {
  it('renders lanes in the same order as allLayersOrdered even when a translation layer is above a transcription layer', () => {
    const transcriptionLayer = makeLayer('trc-base');
    const translationLayer = {
      ...makeLayer('trl-top'),
      layerType: 'translation',
      key: 'trl_fra_top',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        utterancesOnCurrentMedia={[makeUtterance('u1', 's1')]}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[translationLayer, transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer, transcriptionLayer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    expect(timelineLaneHeaderMock.mock.calls.map((call) => call[0].layer.id)).toEqual([
      translationLayer.id,
      transcriptionLayer.id,
    ]);
  });

  it('passes lock conflict count to the lane header in text-only multi-track mode', () => {
    const layer = makeLayer('trc-conflict');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const speakerLayerLayout: SpeakerLayerLayoutResult = {
      placements: new Map(),
      subTrackCount: 2,
      maxConcurrentSpeakerCount: 2,
      overlapGroups: [],
      overlapCycleItemsByGroupId: new Map(),
      lockConflictCount: 2,
      lockConflictSpeakerIds: ['s2'],
    };

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1', 's1'), makeUtterance('u2', 's2')]}
        selectedTimelineUnit={null}
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
        trackDisplayMode="multi-locked"
        onToggleTrackDisplayMode={vi.fn()}
        laneLockMap={{ s1: 0 }}
        speakerLayerLayout={speakerLayerLayout}
      />,
    );

    const firstProps = timelineLaneHeaderMock.mock.calls[0]?.[0] as { trackModeControl?: { lockConflictCount?: number } } | undefined;
    expect(firstProps?.trackModeControl?.lockConflictCount).toBe(2);
  });

  it('forwards overlap cycle items when clicking text-only utterances in multi-track mode', () => {
    const layer = makeLayer('trc-overlap');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const handleAnnotationClick = vi.fn();
    const overlapCycleItemsByUtteranceId = new Map<string, Array<{ id: string; startTime: number }>>([
      ['u1', [{ id: 'u1', startTime: 0 }, { id: 'u2', startTime: 1 }]],
      ['u2', [{ id: 'u2', startTime: 1 }, { id: 'u1', startTime: 0 }]],
    ]);
    const speakerLayerLayout: SpeakerLayerLayoutResult = {
      placements: new Map(),
      subTrackCount: 2,
      maxConcurrentSpeakerCount: 2,
      overlapGroups: [],
      overlapCycleItemsByGroupId: new Map([['__all__', overlapCycleItemsByUtteranceId]]),
      lockConflictCount: 0,
      lockConflictSpeakerIds: [],
    };

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1', 's1'), makeUtterance('u2', 's2')]}
        selectedTimelineUnit={{ layerId: layer.id, unitId: 'u1', kind: 'utterance' }}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={handleAnnotationClick}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        trackDisplayMode="multi-auto"
        onToggleTrackDisplayMode={vi.fn()}
        speakerLayerLayout={speakerLayerLayout}
        activeUtteranceUnitId="u1"
      />,
    );

    fireEvent.click(screen.getAllByRole('textbox')[0]!.closest('.timeline-text-item')!);

    expect(handleAnnotationClick).toHaveBeenCalledWith(
      'u1',
      0,
      layer.id,
      expect.any(Object),
      [{ id: 'u1', startTime: 0 }, { id: 'u2', startTime: 1 }],
    );
  });

  it('reuses shared annotation context menu handler on right click in text-only inputs', () => {
    const layer = makeLayer('trc-context');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const handleAnnotationContextMenu = vi.fn();

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1', 's1')]}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        handleAnnotationContextMenu={handleAnnotationContextMenu}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getAllByRole('textbox')[0];
    expect(input).toBeTruthy();
    fireEvent.contextMenu(input as HTMLElement);

    expect(handleAnnotationContextMenu).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ id: 'u1', startTime: 0, endTime: 1 }),
      layer.id,
      expect.any(Object),
    );
  });

  it('renders dependent translation rows from the parent transcription segments', () => {
    const parentLayer = {
      ...makeLayer('trc-parent'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const translationLayer = {
      ...makeLayer('trl-dependent'),
      layerType: 'translation',
      key: 'trl_fra_1',
      parentLayerId: parentLayer.id,
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    editorContextValue.translationTextByLayer = new Map([
      [translationLayer.id, new Map([
        ['seg-1', { id: 'txt-1', utteranceId: 'seg-1', layerId: translationLayer.id, text: 'bonjour', modality: 'text', createdAt: NOW, updatedAt: NOW }],
        ['seg-2', { id: 'txt-2', utteranceId: 'seg-2', layerId: translationLayer.id, text: 'salut', modality: 'text', createdAt: NOW, updatedAt: NOW }],
      ])],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[]}
        translationLayers={[translationLayer]}
        utterancesOnCurrentMedia={[makeUtterance('u-main')]}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            { id: 'seg-1', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
            { id: 'seg-2', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 1, endTime: 2, createdAt: NOW, updatedAt: NOW },
          ]],
        ])}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[parentLayer, translationLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, translationLayer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const translationLane = screen.getByTestId(`header-${translationLayer.id}`).closest('.timeline-lane-translation');
    expect(translationLane).toBeTruthy();
    const textboxes = within(translationLane as HTMLElement).getAllByRole('textbox') as HTMLInputElement[];
    expect(textboxes).toHaveLength(2);
    expect(textboxes[0]?.value).toBe('bonjour');
    expect(textboxes[1]?.value).toBe('salut');

    editorContextValue.translationTextByLayer = new Map();
  });

  it('renders newly added parent segments immediately in a dependent transcription row after rerender', () => {
    const parentLayer = {
      ...makeLayer('trc-parent-live'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const childLayer = {
      ...makeLayer('trc-child-live'),
      constraint: 'symbolic_association',
      parentLayerId: parentLayer.id,
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    const initialSegments = new Map<string, LayerSegmentDocType[]>([
      [parentLayer.id, [
        { id: 'seg-1', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
      ]],
    ]);
    const initialContents = new Map<string, Map<string, LayerSegmentContentDocType>>([
      [childLayer.id, new Map([
        ['seg-1', { id: 'segc-1', textId: 't1', segmentId: 'seg-1', layerId: childLayer.id, modality: 'text', text: 'child one', sourceType: 'human', createdAt: NOW, updatedAt: NOW } as LayerSegmentContentDocType],
      ])],
    ]);

    const { rerender } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u-main')]}
        segmentsByLayer={initialSegments}
        segmentContentByLayer={initialContents}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[parentLayer, childLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, childLayer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [parentLayer.id]: 44, [childLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    let childLane = screen.getByTestId(`header-${childLayer.id}`).closest('.timeline-lane-text-only');
    expect(childLane).toBeTruthy();
    let textboxes = within(childLane as HTMLElement).getAllByRole('textbox') as HTMLInputElement[];
    expect(textboxes).toHaveLength(1);
    expect(textboxes[0]?.value).toBe('child one');

    rerender(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u-main')]}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            { id: 'seg-1', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
            { id: 'seg-2', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 1, endTime: 2, createdAt: NOW, updatedAt: NOW },
          ]],
        ])}
        segmentContentByLayer={new Map([
          [childLayer.id, new Map([
            ['seg-1', { id: 'segc-1', textId: 't1', segmentId: 'seg-1', layerId: childLayer.id, modality: 'text', text: 'child one', sourceType: 'human', createdAt: NOW, updatedAt: NOW }],
            ['seg-2', { id: 'segc-2', textId: 't1', segmentId: 'seg-2', layerId: childLayer.id, modality: 'text', text: 'child two', sourceType: 'human', createdAt: NOW, updatedAt: NOW }],
          ])],
        ])}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[parentLayer, childLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, childLayer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [parentLayer.id]: 44, [childLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    childLane = screen.getByTestId(`header-${childLayer.id}`).closest('.timeline-lane-text-only');
    expect(childLane).toBeTruthy();
    textboxes = within(childLane as HTMLElement).getAllByRole('textbox') as HTMLInputElement[];
    expect(textboxes).toHaveLength(2);
    expect(textboxes[0]?.value).toBe('child one');
    expect(textboxes[1]?.value).toBe('child two');
  });

  it('does not prevent default pointerdown on text input when lane is expanded', () => {
    const layer = makeLayer('trc-1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1')]}
        selectedTimelineUnit={null}
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

  it('renders multiple utterance editors without speaker-focus hidden styling', () => {
    const layer = makeLayer('trc-1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[makeUtterance('u1', 's1'), makeUtterance('u2', 's2')]}
        selectedTimelineUnit={null}
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
        speakerVisualByUtteranceId={{
          u1: { name: 'S1', color: '#ff0000' },
          u2: { name: 'S2', color: '#00ff00' },
        }}
      />,
    );

    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.timeline-text-item-focus-hidden').length).toBe(0);
    expect(container.querySelectorAll('.timeline-text-item-focus-dim').length).toBe(0);
  });

  it('does not use independent segment highlighting in single-axis mode', () => {
    const layer = {
      ...makeLayer('trc-independent'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const segmentsByLayer = new Map([
      [layer.id, [
        {
          id: 'seg_1',
          textId: 't1',
          mediaId: 'm1',
          layerId: layer.id,
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[]}
        segmentsByLayer={segmentsByLayer}
        selectedTimelineUnit={null}

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

    expect(document.querySelectorAll('.timeline-text-item-active').length).toBe(0);
  });

  it('uses independent segment speakerId when no owner utterance exists', () => {
    const layer = {
      ...makeLayer('trc-independent-speaker'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const segmentsByLayer = new Map([
      [layer.id, [
        {
          id: 'seg_1',
          textId: 't1',
          mediaId: 'm1',
          layerId: layer.id,
          speakerId: 's1',
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]],
    ]);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[]}
        segmentsByLayer={segmentsByLayer}
        selectedTimelineUnit={null}
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

    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.timeline-text-item-focus-hidden').length).toBe(0);
  });

  it('shows speaker badge for independent segments when unit visuals include segment ids', () => {
    const layer = {
      ...makeLayer('trc-independent-speaker-badge'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const segmentsByLayer = new Map([
      [layer.id, [
        {
          id: 'seg_badge_1',
          textId: 't1',
          mediaId: 'm1',
          layerId: layer.id,
          speakerId: 's1',
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        utterancesOnCurrentMedia={[]}
        segmentsByLayer={segmentsByLayer}
        selectedTimelineUnit={null}
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
        speakerVisualByUtteranceId={{
          seg_badge_1: { name: 'Alice', color: '#ff0000' },
        }}
      />,
    );

    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('keeps text input and renders recording controls for mixed translation rows', () => {
    const transcriptionLayer = makeLayer('trc-base');
    const translationLayer = {
      ...makeLayer('trl-mixed'),
      layerType: 'translation',
      key: 'trl_mixed',
      modality: 'mixed',
      acceptsAudio: true,
    } as LayerDocType;
    const utterance = makeUtterance('u1', 's1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const startRecordingForUtterance = vi.fn(async () => undefined);

    editorContextValue.translationTextByLayer = new Map([
      [translationLayer.id, new Map([
        [utterance.id, {
          id: 'utr-mixed',
          utteranceId: utterance.id,
          layerId: translationLayer.id,
          modality: 'mixed',
          text: 'bonjour',
          sourceType: 'human',
          createdAt: NOW,
          updatedAt: NOW,
        }],
      ])],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        utterancesOnCurrentMedia={[utterance]}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[translationLayer, transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer, transcriptionLayer]}
        onFocusLayer={vi.fn()}
        navigateUtteranceFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={new Map([[translationLayer.id, new Map()]])}
        mediaItems={[]}
        startRecordingForUtterance={startRecordingForUtterance}
        stopRecording={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('bonjour')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i }));

    expect(startRecordingForUtterance).toHaveBeenCalledWith(
      expect.objectContaining({ id: utterance.id }),
      expect.objectContaining({ id: translationLayer.id }),
    );
  });
});
