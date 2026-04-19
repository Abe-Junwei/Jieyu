// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType } from '../db';
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
  unitDrafts: {} as Record<string, string>,
  setUnitDrafts: vi.fn(),
  translationDrafts: {} as Record<string, string>,
  setTranslationDrafts: vi.fn(),
  translationTextByLayer: new Map(),
  focusedTranslationDraftKeyRef: { current: null as string | null },
  renderLaneLabel: vi.fn(() => 'lane'),
  getUnitTextForLayer: vi.fn(() => 'u1'),
  scheduleAutoSave: vi.fn(),
  clearAutoSaveTimer: vi.fn(),
  saveUnitText: vi.fn(async () => undefined),
  saveUnitLayerText: vi.fn(async () => undefined),
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
    deleteConfirmKeepUnits: false,
    setDeleteConfirmKeepUnits: vi.fn(),
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

function makeUnit(id: string, speakerId?: string, speaker?: string, startTime = 0, endTime = 1, tags?: Record<string, boolean>): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    ...(speakerId ? { speakerId } : {}),
    ...(speaker ? { speaker } : {}),
    ...(tags ? { tags } : {}),
    startTime,
    endTime,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

/** Independent segment graph rows must carry `unitType: 'segment'` (matches Dexie); UI branches on this. */
function makeSegmentRow(p: Partial<LayerUnitDocType> & Pick<LayerUnitDocType, 'id' | 'startTime' | 'endTime'>): LayerUnitDocType {
  return {
    textId: 't1',
    mediaId: 'm1',
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
    unitType: 'segment',
  } as LayerUnitDocType;
}

describe('TranscriptionTimelineTextOnly logical timing resize (phase 4)', () => {
  it('positions pure-text items by stored time coordinates instead of equal spacing when logical timeline is active', () => {
    const layer = makeLayer('trc-timed-layout');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const { container } = render(
      <TranscriptionTimelineTextOnly
        activeTextTimelineMode="media"
        logicalDurationSec={100}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[
          makeUnit('u-early', undefined, undefined, 10, 15),
          makeUnit('u-late', undefined, undefined, 80, 90),
        ]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const items = Array.from(container.querySelectorAll('.timeline-text-item')) as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items[0]?.style.transform).toContain('36px');
    expect(items[0]?.style.width).toBe('18px');
    expect(items[1]?.style.transform).toContain('288px');
    expect(items[1]?.style.width).toBe('36px');
  });

  it('renders start/end resize handles when startTimelineResizeDrag is provided', () => {
    const layer = makeLayer('trc-timing-handles');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u-edge-handles')]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        startTimelineResizeDrag={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('.timeline-text-item-timing-resize-handle')).toHaveLength(2);
  });

  it('leaves skipped segments blank in the text lane', () => {
    const layer = makeLayer('trc-skipped');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u-skipped', undefined, undefined, 0, 1, { skipProcessing: true })]}
        selectedTimelineUnit={{ layerId: layer.id, unitId: 'u-skipped', kind: 'unit' }}
        flashLayerRowId=""
        focusedLayerRowId={layer.id}
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    expect(container.querySelector('.timeline-text-input')).toBeNull();
    expect(container.querySelector('.timeline-text-item')).toBeNull();
    expect(screen.queryByText(/已标记为跳过处理|Marked to skip processing\./)).toBeNull();
  });
});

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
        unitsOnCurrentMedia={[makeUnit('u1', 's1')]}
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
        navigateUnitFromInput={vi.fn()}
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
        unitsOnCurrentMedia={[makeUnit('u1', 's1'), makeUnit('u2', 's2')]}
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
        navigateUnitFromInput={vi.fn()}
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

  it('forwards overlap cycle items when clicking text-only units in multi-track mode', () => {
    const layer = makeLayer('trc-overlap');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const handleAnnotationClick = vi.fn();
    const overlapCycleItemsByUnitId = new Map<string, Array<{ id: string; startTime: number }>>([
      ['u1', [{ id: 'u1', startTime: 0 }, { id: 'u2', startTime: 1 }]],
      ['u2', [{ id: 'u2', startTime: 1 }, { id: 'u1', startTime: 0 }]],
    ]);
    const speakerLayerLayout: SpeakerLayerLayoutResult = {
      placements: new Map(),
      subTrackCount: 2,
      maxConcurrentSpeakerCount: 2,
      overlapGroups: [],
      overlapCycleItemsByGroupId: new Map([['__all__', overlapCycleItemsByUnitId]]),
      lockConflictCount: 0,
      lockConflictSpeakerIds: [],
    };

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u1', 's1'), makeUnit('u2', 's2')]}
        selectedTimelineUnit={{ layerId: layer.id, unitId: 'u1', kind: 'unit' }}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={handleAnnotationClick}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        trackDisplayMode="multi-auto"
        onToggleTrackDisplayMode={vi.fn()}
        speakerLayerLayout={speakerLayerLayout}
        activeUnitId="u1"
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
        unitsOnCurrentMedia={[makeUnit('u1', 's1')]}
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
        navigateUnitFromInput={vi.fn()}
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

  it('renders ambiguous self-certainty marker without certainty badge in text-only rows', () => {
    const layer = makeLayer('trc-ambiguous');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u1', 's1')]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        resolveSelfCertaintyForUnit={() => undefined}
        resolveSelfCertaintyAmbiguityForUnit={() => true}
      />,
    );

    expect(container.querySelector('.timeline-annotation-self-certainty-ambiguous')).toBeTruthy();
    expect(container.querySelector('.timeline-annotation-self-certainty--certain')).toBeFalsy();
  });

  it('renders ambiguous self-certainty marker without certainty badge in translation rows', () => {
    const translationLayer = {
      ...makeLayer('trl-ambiguous'),
      layerType: 'translation',
      key: 'trl_eng_1',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    editorContextValue.translationTextByLayer = new Map<string, Map<string, LayerUnitContentDocType>>([
      [translationLayer.id, new Map([
        ['u1', {
          id: 'txt-u1',
          unitId: 'u1',
          layerId: translationLayer.id,
          text: 'hello',
          modality: 'text',
          createdAt: NOW,
          updatedAt: NOW,
        } as LayerUnitContentDocType],
      ])],
    ]);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[]}
        translationLayers={[translationLayer]}
        unitsOnCurrentMedia={[makeUnit('u1', 's1')]}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId="trc-base"
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[translationLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer]}
        onFocusLayer={vi.fn()}
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        resolveSelfCertaintyForUnit={() => undefined}
        resolveSelfCertaintyAmbiguityForUnit={() => true}
      />,
    );

    expect(container.querySelector('.timeline-annotation-self-certainty-ambiguous')).toBeTruthy();
    expect(container.querySelector('.timeline-annotation-self-certainty--certain')).toBeFalsy();
  });

  it('keeps segment unit shape for context menu when segment id collides with unit id', () => {
    const layer = {
      ...makeLayer('trc-seg-only'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const handleAnnotationContextMenu = vi.fn();

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[
          makeUnit('seg-1', 'spk-a'),
          makeUnit('utt-host', 'spk-b'),
        ]}
        segmentsByLayer={new Map([
          [layer.id, [
            makeSegmentRow({
              id: 'seg-1',
              layerId: layer.id,
              unitId: 'utt-host',
              startTime: 4,
              endTime: 6,
            }),
          ]],
        ])}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getAllByRole('textbox')[0];
    fireEvent.contextMenu(input as HTMLElement);

    expect(handleAnnotationContextMenu).toHaveBeenCalledWith(
      'seg-1',
      expect.objectContaining({ id: 'seg-1', kind: 'segment', parentUnitId: 'utt-host' }),
      layer.id,
      expect.any(Object),
    );
  });

  it('keeps dependent translation rows from inheriting a source-layer certainty badge', () => {
    const parentLayer = {
      ...makeLayer('trc-parent-certainty'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const translationLayer = {
      ...makeLayer('trl-dependent-certainty'),
      layerType: 'translation',
      key: 'trl_fra_certainty',
      parentLayerId: parentLayer.id,
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    editorContextValue.translationTextByLayer = new Map([
      [translationLayer.id, new Map([
        ['seg-1', { id: 'txt-1', unitId: 'seg-1', layerId: translationLayer.id, text: 'bonjour', modality: 'text', createdAt: NOW, updatedAt: NOW }],
      ])],
    ]);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[]}
        translationLayers={[translationLayer]}
        unitsOnCurrentMedia={[makeUnit('u-main')]}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            makeSegmentRow({ id: 'seg-1', layerId: parentLayer.id, startTime: 0, endTime: 1 }),
          ]],
        ])}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[translationLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer]}
        onFocusLayer={vi.fn()}
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        resolveSelfCertaintyForUnit={(_unitId, layerId) => (layerId === parentLayer.id ? 'certain' : undefined)}
      />,
    );

    expect(container.querySelector('.timeline-annotation-self-certainty--certain')).toBeFalsy();
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
        ['seg-1', { id: 'txt-1', unitId: 'seg-1', layerId: translationLayer.id, text: 'bonjour', modality: 'text', createdAt: NOW, updatedAt: NOW }],
        ['seg-2', { id: 'txt-2', unitId: 'seg-2', layerId: translationLayer.id, text: 'salut', modality: 'text', createdAt: NOW, updatedAt: NOW }],
      ])],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[]}
        translationLayers={[translationLayer]}
        unitsOnCurrentMedia={[makeUnit('u-main')]}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            makeSegmentRow({ id: 'seg-1', layerId: parentLayer.id, startTime: 0, endTime: 1 }),
            makeSegmentRow({ id: 'seg-2', layerId: parentLayer.id, startTime: 1, endTime: 2 }),
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
        navigateUnitFromInput={vi.fn()}
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

    const initialSegments = new Map<string, LayerUnitDocType[]>([
      [parentLayer.id, [
        makeSegmentRow({ id: 'seg-1', layerId: parentLayer.id, startTime: 0, endTime: 1 }),
      ]],
    ]);
    const initialContents = new Map<string, Map<string, LayerUnitContentDocType>>([
      [childLayer.id, new Map([
        ['seg-1', { id: 'segc-1', textId: 't1', segmentId: 'seg-1', layerId: childLayer.id, modality: 'text', text: 'child one', sourceType: 'human', createdAt: NOW, updatedAt: NOW } as LayerUnitContentDocType],
      ])],
    ]);

    const { rerender } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u-main')]}
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
        navigateUnitFromInput={vi.fn()}
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
        unitsOnCurrentMedia={[makeUnit('u-main')]}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            makeSegmentRow({ id: 'seg-1', layerId: parentLayer.id, startTime: 0, endTime: 1 }),
            makeSegmentRow({ id: 'seg-2', layerId: parentLayer.id, startTime: 1, endTime: 2 }),
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
        navigateUnitFromInput={vi.fn()}
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

  it('creates a segment from drag selection in pure-text mode and shows preview feedback', () => {
    const layer = makeLayer('trc-drag-create');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const createUnitFromSelection = vi.fn(async () => undefined);
    const onFocusLayer = vi.fn();

    const { container } = render(
      <TranscriptionTimelineTextOnly
        activeTextTimelineMode="document"
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={onFocusLayer}
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        createUnitFromSelection={createUnitFromSelection}
        logicalDurationSec={20}
      />,
    );

    const track = container.querySelector('.timeline-lane-text-only-track') as HTMLDivElement | null;
    expect(track).toBeTruthy();
    if (!track) return;

    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 44,
      top: 0,
      right: 200,
      bottom: 44,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(track, { clientX: 20, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 120, clientY: 10, pointerId: 1 });

    const preview = container.querySelector('.timeline-text-only-drag-preview');
    expect(preview).toBeTruthy();

    fireEvent.pointerUp(track, { clientX: 120, clientY: 10, pointerId: 1 });

    expect(onFocusLayer).toHaveBeenCalledWith(layer.id);
    expect(createUnitFromSelection).toHaveBeenCalledWith(2, 12);
  });

  it('defaults missing activeTextTimelineMode to document when drag-create is available (metadata gap)', () => {
    const layer = makeLayer('trc-drag-no-mode-meta');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const createUnitFromSelection = vi.fn(async () => undefined);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        createUnitFromSelection={createUnitFromSelection}
        logicalDurationSec={20}
      />,
    );

    const track = container.querySelector('.timeline-lane-text-only-track') as HTMLDivElement | null;
    expect(track).toBeTruthy();
    if (!track) return;

    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 44,
      top: 0,
      right: 200,
      bottom: 44,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(track, { clientX: 20, clientY: 10, button: 0, pointerId: 77 });
    fireEvent.pointerMove(track, { clientX: 120, clientY: 10, pointerId: 77 });
    expect(container.querySelector('.timeline-text-only-drag-preview')).toBeTruthy();
    fireEvent.pointerUp(track, { clientX: 120, clientY: 10, pointerId: 77 });

    expect(createUnitFromSelection).toHaveBeenCalledWith(2, 12);
  });

  it('allows pure-text drag creation from text-item chrome instead of only blank track background', () => {
    const layer = makeLayer('trc-drag-on-item');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const createUnitFromSelection = vi.fn(async () => undefined);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        activeTextTimelineMode="document"
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u1')]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        createUnitFromSelection={createUnitFromSelection}
        logicalDurationSec={20}
      />,
    );

    const track = container.querySelector('.timeline-lane-text-only-track') as HTMLDivElement | null;
    const textItem = container.querySelector('.timeline-text-item') as HTMLDivElement | null;
    expect(track).toBeTruthy();
    expect(textItem).toBeTruthy();
    if (!track || !textItem) return;

    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 44,
      top: 0,
      right: 200,
      bottom: 44,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(textItem, { clientX: 40, clientY: 10, button: 0, pointerId: 2 });
    fireEvent.pointerMove(track, { clientX: 140, clientY: 10, pointerId: 2 });
    fireEvent.pointerUp(track, { clientX: 140, clientY: 10, pointerId: 2 });

    expect(createUnitFromSelection).toHaveBeenCalledWith(
      Number((40 / 180 * 20).toFixed(3)),
      Number((140 / 180 * 20).toFixed(3)),
    );
  });

  it('does not create a segment when the drag starts from the text input itself', () => {
    const layer = makeLayer('trc-drag-on-input');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const createUnitFromSelection = vi.fn(async () => undefined);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        activeTextTimelineMode="document"
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u1')]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        createUnitFromSelection={createUnitFromSelection}
        logicalDurationSec={20}
      />,
    );

    const track = container.querySelector('.timeline-lane-text-only-track') as HTMLDivElement | null;
    const input = container.querySelector('.timeline-text-input') as HTMLInputElement | null;
    expect(track).toBeTruthy();
    expect(input).toBeTruthy();
    if (!track || !input) return;

    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 44,
      top: 0,
      right: 200,
      bottom: 44,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(input, { clientX: 40, clientY: 10, button: 0, pointerId: 3 });
    fireEvent.pointerMove(track, { clientX: 140, clientY: 10, pointerId: 3 });
    fireEvent.pointerUp(track, { clientX: 140, clientY: 10, pointerId: 3 });

    expect(createUnitFromSelection).not.toHaveBeenCalled();
  });

  it('does not prevent default pointerdown on text input when lane is expanded', () => {
    const layer = makeLayer('trc-1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u1')]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox');
    const pointerDown = createEvent.pointerDown(input, { clientX: 30, clientY: 10 });
    fireEvent(input, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
  });

  it('renders multiple unit editors without speaker-focus hidden styling', () => {
    const layer = makeLayer('trc-1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[makeUnit('u1', 's1'), makeUnit('u2', 's2')]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        speakerVisualByUnitId={{
          u1: { name: 'S1', color: '#ff0000' },
          u2: { name: 'S2', color: '#00ff00' },
        }}
      />,
    );

    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.timeline-text-item-focus-hidden').length).toBe(0);
    expect(container.querySelectorAll('.timeline-text-item-focus-dim').length).toBe(0);
  });

  it('resolves segment text via segmentContentByLayer when unit.kind is segment', () => {
    const layer = {
      ...makeLayer('trc-seg-text'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const segmentsByLayer = new Map([
      [layer.id, [
        makeSegmentRow({ id: 'seg_text_1', layerId: layer.id, startTime: 0, endTime: 1 }),
      ]],
    ]);
    const segmentContentByLayer = new Map<string, Map<string, LayerUnitContentDocType>>([
      [layer.id, new Map([
        ['seg_text_1', { id: 'sc-1', textId: 't1', segmentId: 'seg_text_1', layerId: layer.id, modality: 'text', text: 'segment hello', sourceType: 'human', createdAt: NOW, updatedAt: NOW }],
      ])],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
        segmentsByLayer={segmentsByLayer}
        segmentContentByLayer={segmentContentByLayer}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue('segment hello');
    expect(input).toBeTruthy();
  });

  it('shows segment placeholder text for segment-based timeline items', () => {
    const layer = {
      ...makeLayer('trc-seg-placeholder'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const segmentsByLayer = new Map([
      [layer.id, [
        makeSegmentRow({ id: 'seg_ph_1', layerId: layer.id, startTime: 0, endTime: 1 }),
      ]],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.placeholder).toBeTruthy();
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
        makeSegmentRow({ id: 'seg_1', layerId: layer.id, startTime: 0, endTime: 1 }),
      ]],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('.timeline-text-item-active').length).toBe(0);
  });

  it('uses independent segment speakerId when no owner unit exists', () => {
    const layer = {
      ...makeLayer('trc-independent-speaker'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const segmentsByLayer = new Map([
      [layer.id, [
        makeSegmentRow({ id: 'seg_1', layerId: layer.id, speakerId: 's1', startTime: 0, endTime: 1 }),
      ]],
    ]);

    const { container } = render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
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
        navigateUnitFromInput={vi.fn()}
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
        makeSegmentRow({ id: 'seg_badge_1', layerId: layer.id, speakerId: 's1', startTime: 0, endTime: 1 }),
      ]],
    ]);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[layer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        speakerVisualByUnitId={{
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
    const unit = makeUnit('u1', 's1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const startRecordingForUnit = vi.fn(async () => undefined);

    editorContextValue.translationTextByLayer = new Map([
      [translationLayer.id, new Map([
        [unit.id, {
          id: 'utr-mixed',
          unitId: unit.id,
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
        unitsOnCurrentMedia={[unit]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={new Map([[translationLayer.id, new Map()]])}
        mediaItems={[]}
        startRecordingForUnit={startRecordingForUnit}
        stopRecording={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('bonjour')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i }));

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: unit.id }),
      expect.objectContaining({ id: translationLayer.id }),
    );
  });

  it('keeps text input and renders recording controls for text translation rows with acceptsAudio', () => {
    const transcriptionLayer = makeLayer('trc-base');
    const translationLayer = {
      ...makeLayer('trl-text-audio'),
      layerType: 'translation',
      key: 'trl_text_audio',
      modality: 'text',
      acceptsAudio: true,
    } as LayerDocType;
    const unit = makeUnit('u1', 's1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const startRecordingForUnit = vi.fn(async () => undefined);

    editorContextValue.translationTextByLayer = new Map([
      [translationLayer.id, new Map([
        [unit.id, {
          id: 'utr-text-audio',
          unitId: unit.id,
          layerId: translationLayer.id,
          modality: 'text',
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
        unitsOnCurrentMedia={[unit]}
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
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={new Map([[translationLayer.id, new Map()]])}
        mediaItems={[]}
        startRecordingForUnit={startRecordingForUnit}
        stopRecording={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('bonjour')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i }));

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: unit.id }),
      expect.objectContaining({ id: translationLayer.id }),
    );
  });

  it('renders recording controls for text transcription rows with acceptsAudio', () => {
    const transcriptionLayer = {
      ...makeLayer('trc-text-audio'),
      key: 'trc_text_audio',
      modality: 'text',
      acceptsAudio: true,
    } as LayerDocType;
    const unit = makeUnit('u1', 's1');
    const scrollEl = document.createElement('div');
    const scrollRef = { current: scrollEl } as React.RefObject<HTMLDivElement | null>;
    const startRecordingForUnit = vi.fn(async () => undefined);

    render(
      <TranscriptionTimelineTextOnly
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[]}
        unitsOnCurrentMedia={[unit]}
        selectedTimelineUnit={null}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        scrollContainerRef={scrollRef}
        handleAnnotationClick={vi.fn()}
        allLayersOrdered={[transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[transcriptionLayer]}
        onFocusLayer={vi.fn()}
        navigateUnitFromInput={vi.fn()}
        laneHeights={{ [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={new Map([[transcriptionLayer.id, new Map()]])}
        mediaItems={[]}
        startRecordingForUnit={startRecordingForUnit}
        stopRecording={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i }));

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: unit.id }),
      expect.objectContaining({ id: transcriptionLayer.id }),
    );
  });
});
