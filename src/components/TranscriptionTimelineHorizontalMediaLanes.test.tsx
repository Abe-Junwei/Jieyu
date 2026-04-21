// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerLinkDocType, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType } from '../db';
import type { TimelineUnitViewIndex } from '../hooks/timelineUnitView';
import { TranscriptionTimelineHorizontalMediaLanes as RawTranscriptionTimelineHorizontalMediaLanes } from './TranscriptionTimelineHorizontalMediaLanes';
import { TranscriptionTimelineMediaTranslationRow } from './TranscriptionTimelineMediaTranslationRow';

const NOW = new Date().toISOString();
const EMPTY_TIMELINE_UNIT_VIEW_INDEX: TimelineUnitViewIndex = {
  allUnits: [],
  currentMediaUnits: [],
  byId: new Map(),
  resolveBySemanticId: () => undefined,
  byLayer: new Map(),
  getReferringUnits: () => [],
  totalCount: 0,
  currentMediaCount: 0,
  epoch: 1,
  fallbackToSegments: false,
  isComplete: true,
};

function TranscriptionTimelineHorizontalMediaLanes(
  props: Omit<ComponentProps<typeof RawTranscriptionTimelineHorizontalMediaLanes>, 'timelineUnitViewIndex'>,
) {
  return <RawTranscriptionTimelineHorizontalMediaLanes timelineUnitViewIndex={EMPTY_TIMELINE_UNIT_VIEW_INDEX} {...props} />;
}

const editorContextValue = {
  unitDrafts: {} as Record<string, string>,
  setUnitDrafts: vi.fn(),
  translationDrafts: {} as Record<string, string>,
  setTranslationDrafts: vi.fn(),
  translationTextByLayer: new Map(),
  focusedTranslationDraftKeyRef: { current: null as string | null },
  renderLaneLabel: vi.fn(() => 'lane'),
  getUnitTextForLayer: vi.fn(() => ''),
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

const timelineLaneHeaderMock = vi.fn(
  ({ layer, onToggleCollapsed }: { layer: { id: string }; onToggleCollapsed?: (layerId: string) => void; trackModeControl?: { lockConflictCount?: number } }) => (
    <button type="button" data-testid={`toggle-${layer.id}`} onClick={() => onToggleCollapsed?.(layer.id)}>toggle</button>
  ),
);

vi.mock('./TimelineLaneHeader', () => ({
  TimelineLaneHeader: (props: { layer: { id: string }; onToggleCollapsed?: (layerId: string) => void; trackModeControl?: { lockConflictCount?: number } }) => timelineLaneHeaderMock(props),
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

function makeLayer(id: string, layerType: 'transcription' | 'translation' = 'transcription'): LayerDocType {
  return {
    id,
    textId: 't1',
    key: `trc_${id}`,
    name: { zho: id },
    layerType,
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function makeUnit(id: string, startTime: number, endTime: number, speakerId?: string, speaker?: string): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    ...(speakerId ? { speakerId } : {}),
    ...(speaker ? { speaker } : {}),
    startTime,
    endTime,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

describe('TranscriptionTimelineHorizontalMediaLanes overlap hint local expansion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    timelineLaneHeaderMock.mockClear();
    editorContextValue.translationTextByLayer = new Map();
    editorContextValue.translationDrafts = {};
    cleanup();
  });

  it('renders lanes in the same order as allLayersOrdered even when a translation layer is above a transcription layer', () => {
    const transcriptionLayer = makeLayer('trc-base');
    const translationLayer = makeLayer('trl-top', 'translation');

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        timelineRenderUnits={[makeUnit('u1', 0, 1, 's1')]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[translationLayer, transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer, transcriptionLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    expect(timelineLaneHeaderMock.mock.calls.map((call) => call[0].layer.id)).toEqual([
      translationLayer.id,
      transcriptionLayer.id,
    ]);
  });

  it('keeps segment unit shape when segment id collides with unit id', () => {
    const layer = {
      ...makeLayer('trc-seg'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const renderAnnotationItem = vi.fn((utt: { id: string }) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>);

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={[
          makeUnit('seg-1', 0, 2),
          makeUnit('utt-host', 4, 6),
        ]}
        segmentsByLayer={new Map([
          [layer.id, [{
            id: 'seg-1',
            layerId: layer.id,
            mediaId: 'm1',
            unitId: 'utt-host',
            startTime: 4,
            endTime: 6,
            textId: 't1',
            createdAt: NOW,
            updatedAt: NOW,
          }]],
        ])}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={renderAnnotationItem}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const firstRenderedUnit = renderAnnotationItem.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(firstRenderedUnit).toBeTruthy();
    expect(firstRenderedUnit?.kind).toBe('segment');
    expect(firstRenderedUnit?.parentUnitId).toBe('utt-host');
  });

  it('expands only the clicked overlap window and auto-collapses after timeout', () => {
    const layer = makeLayer('trc-1');
    const units = [
      makeUnit('u1', 0, 5, 's1'),
      makeUnit('u2', 1, 4, 's2'),
      makeUnit('u3', 7, 8, 's3'),
      makeUnit('u4', 10, 13, 's1'),
      makeUnit('u5', 11, 12, 's2'),
    ];

    const { container } = render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        trackDisplayMode="multi-auto"
      />,
    );

    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(screen.getByTestId('ann-u4')).toBeTruthy();
    expect(screen.getByTestId('ann-u5')).toBeTruthy();

    fireEvent.click(screen.getByTestId(`toggle-${layer.id}`));

    expect(screen.queryByTestId('ann-u1')).toBeNull();
    const hintButtons = container.querySelectorAll('.timeline-lane-overlap-hint');
    expect(hintButtons.length).toBe(2);

    fireEvent.click(hintButtons[0] as HTMLButtonElement);

    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(screen.queryByTestId('ann-u4')).toBeNull();
    expect(screen.queryByTestId('ann-u5')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.queryByTestId('ann-u1')).toBeNull();
    expect(container.querySelectorAll('.timeline-lane-overlap-hint').length).toBe(2);
  });

  it('switches to the latest clicked overlap window and resets timeout', () => {
    const layer = makeLayer('trc-1');
    const units = [
      makeUnit('u1', 0, 5, 's1'),
      makeUnit('u2', 1, 4, 's2'),
      makeUnit('u3', 7, 8, 's3'),
      makeUnit('u4', 10, 13, 's1'),
      makeUnit('u5', 11, 12, 's2'),
    ];

    const { container } = render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        trackDisplayMode="multi-auto"
      />,
    );

    fireEvent.click(screen.getByTestId(`toggle-${layer.id}`));

    let hintButtons = container.querySelectorAll('.timeline-lane-overlap-hint');
    expect(hintButtons.length).toBe(2);
    fireEvent.click(hintButtons[0] as HTMLButtonElement);

    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(screen.queryByTestId('ann-u4')).toBeNull();
    expect(screen.queryByTestId('ann-u5')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    hintButtons = container.querySelectorAll('.timeline-lane-overlap-hint');
    fireEvent.click(hintButtons[1] as HTMLButtonElement);

    expect(screen.queryByTestId('ann-u1')).toBeNull();
    expect(screen.queryByTestId('ann-u2')).toBeNull();
    expect(screen.getByTestId('ann-u4')).toBeTruthy();
    expect(screen.getByTestId('ann-u5')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(7500);
    });

    expect(screen.getByTestId('ann-u4')).toBeTruthy();
    expect(screen.getByTestId('ann-u5')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByTestId('ann-u4')).toBeNull();
    expect(container.querySelectorAll('.timeline-lane-overlap-hint').length).toBe(2);
  });

  it('does not prevent pointer default on editable annotation in expanded lane', () => {
    const layer = makeLayer('trc-1');
    const units = [makeUnit('u1', 0, 5, 's1')];

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={() => <input data-testid="editable-ann" defaultValue="u1" />}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('editable-ann');
    const pointerDown = createEvent.pointerDown(input, { clientX: 20, clientY: 10 });
    fireEvent(input, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
  });

  it('keeps translation lane independent from speaker overlap layout', () => {
    const trLayer = makeLayer('tr-1', 'translation');
    const units = [
      makeUnit('u1', 0, 5, 's1'),
      makeUnit('u2', 1, 4, 's2'),
      makeUnit('u3', 2, 3, 's3'),
    ];

    const { container } = render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[]}
        translationLayers={[trLayer]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={undefined}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[trLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[trLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [trLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId(`toggle-${trLayer.id}`));
    expect(screen.queryByTestId('ann-u1')).toBeNull();
    expect(container.querySelectorAll('.timeline-lane-overlap-hint').length).toBe(0);

    fireEvent.click(screen.getByTestId(`toggle-${trLayer.id}`));
    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(screen.getByTestId('ann-u3')).toBeTruthy();
  });

  it('renders dependent translation lanes from parent transcription segments', () => {
    const parentLayer = {
      ...makeLayer('trc-parent'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const translationLayer = {
      ...makeLayer('trl-1', 'translation'),
      key: 'trl_fra_1',
      parentLayerId: parentLayer.id,
    } as LayerDocType;
    const layerLinks = [
      { id: 'link-1', layerId: translationLayer.id, transcriptionLayerKey: parentLayer.key!, hostTranscriptionLayerId: parentLayer.id, isPreferred: true, createdAt: NOW },
    ] as LayerLinkDocType[];

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[]}
        translationLayers={[translationLayer]}
        timelineRenderUnits={[makeUnit('u-main', 0, 2, 's1')]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[parentLayer, translationLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, translationLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        layerLinks={layerLinks}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            { id: 'seg-1', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
            { id: 'seg-2', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 1, endTime: 2, createdAt: NOW, updatedAt: NOW },
          ]],
        ])}
      />,
    );

    const translationLane = screen.getByTestId(`toggle-${translationLayer.id}`).closest('.timeline-lane-translation');
    expect(translationLane).toBeTruthy();
    expect(within(translationLane as HTMLElement).getByTestId('ann-seg-1')).toBeTruthy();
    expect(within(translationLane as HTMLElement).getByTestId('ann-seg-2')).toBeTruthy();
    expect(screen.queryByTestId('ann-u-main')).toBeNull();
  });

  it('renders newly added parent segments immediately in a dependent transcription lane after rerender', () => {
    const parentLayer = {
      ...makeLayer('trc-parent-live'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const childLayer = {
      ...makeLayer('trc-child-live'),
      constraint: 'symbolic_association',
      parentLayerId: parentLayer.id,
    } as LayerDocType;

    const { rerender } = render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        timelineRenderUnits={[makeUnit('u-main', 0, 2, 's1')]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[parentLayer, childLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, childLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [parentLayer.id]: 44, [childLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            { id: 'seg-1', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
          ]],
        ])}
      />,
    );

    let childLane = screen.getByTestId(`toggle-${childLayer.id}`).closest('.timeline-lane');
    expect(childLane).toBeTruthy();
    expect(within(childLane as HTMLElement).getByTestId('ann-seg-1')).toBeTruthy();
    expect(within(childLane as HTMLElement).queryByTestId('ann-seg-2')).toBeNull();

    rerender(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        timelineRenderUnits={[makeUnit('u-main', 0, 2, 's1')]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[parentLayer, childLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, childLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [parentLayer.id]: 44, [childLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            { id: 'seg-1', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
            { id: 'seg-2', textId: 't1', mediaId: 'm1', layerId: parentLayer.id, startTime: 1, endTime: 2, createdAt: NOW, updatedAt: NOW },
          ]],
        ])}
      />,
    );

    childLane = screen.getByTestId(`toggle-${childLayer.id}`).closest('.timeline-lane');
    expect(childLane).toBeTruthy();
    expect(within(childLane as HTMLElement).getByTestId('ann-seg-1')).toBeTruthy();
    expect(within(childLane as HTMLElement).getByTestId('ann-seg-2')).toBeTruthy();
    expect(within(childLane as HTMLElement).queryByTestId('ann-u-main')).toBeNull();
  });

  it('applies speaker filter consistently for parent and dependent lanes sharing one segment source', () => {
    const parentLayer = {
      ...makeLayer('trc-parent-filter'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const childLayer = {
      ...makeLayer('trc-child-filter'),
      constraint: 'symbolic_association',
      parentLayerId: parentLayer.id,
    } as LayerDocType;

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        timelineRenderUnits={[makeUnit('u-main', 0, 2, 's1')]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={parentLayer.id}
        activeSpeakerFilterKey="s1"
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[parentLayer, childLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[parentLayer, childLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [parentLayer.id]: 44, [childLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        segmentsByLayer={new Map([
          [parentLayer.id, [
            {
              id: 'seg-s1',
              textId: 't1',
              mediaId: 'm1',
              layerId: parentLayer.id,
              speakerId: 's1',
              startTime: 0,
              endTime: 1,
              createdAt: NOW,
              updatedAt: NOW,
            },
            {
              id: 'seg-s2',
              textId: 't1',
              mediaId: 'm1',
              layerId: parentLayer.id,
              speakerId: 's2',
              startTime: 1,
              endTime: 2,
              createdAt: NOW,
              updatedAt: NOW,
            },
          ]],
        ])}
      />,
    );

    const parentLane = screen.getByTestId(`toggle-${parentLayer.id}`).closest('.timeline-lane');
    const childLane = screen.getByTestId(`toggle-${childLayer.id}`).closest('.timeline-lane');
    expect(parentLane).toBeTruthy();
    expect(childLane).toBeTruthy();

    expect(within(parentLane as HTMLElement).getByTestId('ann-seg-s1')).toBeTruthy();
    expect(within(parentLane as HTMLElement).queryByTestId('ann-seg-s2')).toBeNull();
    expect(within(childLane as HTMLElement).getByTestId('ann-seg-s1')).toBeTruthy();
    expect(within(childLane as HTMLElement).queryByTestId('ann-seg-s2')).toBeNull();
  });

  it('renders overlapping units without speaker-focus dim or hide classes', () => {
    const layer = makeLayer('trc-1');
    const units = [
      makeUnit('u1', 0, 2, 's1'),
      makeUnit('u2', 2, 4, 's2'),
    ];

    const { container } = render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(container.querySelectorAll('.timeline-annotation-subtrack-focus-dim').length).toBe(0);
    expect(container.querySelectorAll('.timeline-annotation-subtrack-focus-hidden').length).toBe(0);
  });

  it('uses independent segment speakerId when no owner unit exists', () => {
    const layer = {
      ...makeLayer('trc-independent-speaker'),
      constraint: 'independent_boundary',
    } as LayerDocType;
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

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={[]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        segmentsByLayer={segmentsByLayer}
      />,
    );

    expect(screen.getByTestId('ann-seg_1')).toBeTruthy();
  });

  it('passes overlap cycle status to annotation renderer for overlapping items', () => {
    const layer = makeLayer('trc-1');
    const units = [
      makeUnit('u1', 0, 3, 's1'),
      makeUnit('u2', 1, 4, 's2'),
      makeUnit('u3', 5, 6, 's3'),
    ];

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt, _layer, _draft, extra) => {
          const status = extra.overlapCycleStatus;
          return <div data-testid={`meta-${utt.id}`}>{status ? `${status.index}/${status.total}` : 'none'}</div>;
        }}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('meta-u1').textContent).toBe('1/2');
    expect(screen.getByTestId('meta-u2').textContent).toBe('2/2');
    expect(screen.getByTestId('meta-u3').textContent).toBe('none');
  });

  it('surfaces lock conflict count in lane header track mode control', () => {
    const layer = makeLayer('trc-1');
    const units = [
      makeUnit('u1', 0, 4, 's1'),
      makeUnit('u2', 1, 3, 's2'),
    ];

    const { rerender } = render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        trackDisplayMode="multi-locked"
        onToggleTrackDisplayMode={vi.fn()}
        laneLockMap={{ s2: 0 }}
      />,
    );

    const firstProps = timelineLaneHeaderMock.mock.calls[0]?.[0] as { trackModeControl?: { lockConflictCount?: number } } | undefined;
    expect(firstProps?.trackModeControl?.lockConflictCount).toBe(1);

    rerender(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={units}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        trackDisplayMode="multi-locked"
        onToggleTrackDisplayMode={vi.fn()}
        laneLockMap={{ s2: 1 }}
      />,
    );

    const latestProps = timelineLaneHeaderMock.mock.calls[timelineLaneHeaderMock.mock.calls.length - 1]?.[0] as { trackModeControl?: { lockConflictCount?: number } } | undefined;
    expect(latestProps?.trackModeControl?.lockConflictCount).toBeUndefined();
  });

  it('renders segment items via visibleUnits when transcription layer uses independent boundary', () => {
    const layer = {
      ...makeLayer('trc-view-test'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const segmentsByLayer = new Map([
      [layer.id, [
        { id: 'seg-view-1', textId: 't1', mediaId: 'm1', layerId: layer.id, startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW },
        { id: 'seg-view-2', textId: 't1', mediaId: 'm1', layerId: layer.id, startTime: 1, endTime: 2, createdAt: NOW, updatedAt: NOW },
      ]],
    ]);

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUnits={[]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={layer.id}
        renderAnnotationItem={(utt) => <div data-testid={`ann-${utt.id}`}>{utt.id}</div>}
        allLayersOrdered={[layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[layer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [layer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        segmentsByLayer={segmentsByLayer}
      />,
    );

    expect(screen.getByTestId('ann-seg-view-1')).toBeTruthy();
    expect(screen.getByTestId('ann-seg-view-2')).toBeTruthy();
  });

  it('surfaces save error and retry callbacks for media translation rows', async () => {
    const translationLayer = makeLayer('trl-save', 'translation');
    const item = { ...makeUnit('u1', 0, 1, 's1'), layerId: translationLayer.id } as LayerUnitDocType;
    const scheduleAutoSave = vi.fn();
    const saveUnitLayerText = vi.fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValue(undefined);

    render(
      <TranscriptionTimelineMediaTranslationRow
        item={item as never}
        layer={translationLayer}
        layerForDisplay={translationLayer}
        baseLaneHeight={44}
        usesOwnSegments={false}
        unitById={new Map([[item.id, item]])}
        segmentById={new Map()}
        text="初始译文"
        draft="草稿译文"
        draftKey={`${translationLayer.id}-${item.id}`}
        audioMedia={undefined}
        recording={false}
        recordingUnitId={null}
        recordingLayerId={null}
        startRecordingForUnit={undefined}
        stopRecording={undefined}
        deleteVoiceTranslation={undefined}
        saveSegmentContentForLayer={undefined}
        saveUnitLayerText={saveUnitLayerText}
        scheduleAutoSave={scheduleAutoSave}
        clearAutoSaveTimer={vi.fn()}
        setTranslationDrafts={vi.fn()}
        focusedTranslationDraftKeyRef={{ current: null }}
        renderAnnotationItem={(_utt, _layer, draft, extra) => (
          <div>
            <div data-testid="media-save-status">{extra.saveStatus ?? 'none'}</div>
            <input aria-label="media-draft" value={draft} onChange={extra.onChange as never} onBlur={extra.onBlur as never} />
            <button type="button" onClick={() => extra.onRetrySave?.()}>retry</button>
          </div>
        )}
      />,
    );

    fireEvent.change(screen.getByLabelText('media-draft'), { target: { value: '已改译文' } });
    expect(screen.getByTestId('media-save-status').textContent).toBe('dirty');

    const schCalls = scheduleAutoSave.mock.calls;
    const scheduledTask = schCalls[schCalls.length - 1]?.[1] as (() => Promise<void>) | undefined;
    expect(scheduledTask).toBeTypeOf('function');
    await act(async () => {
      await scheduledTask?.();
    });

    expect(screen.getByTestId('media-save-status').textContent).toBe('error');

    const retryButton = screen.getByRole('button', { name: 'retry' });
    expect(retryButton).toBeTruthy();
    fireEvent.click(retryButton);
    expect(saveUnitLayerText.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('renders recording controls for audio translation rows and starts recording', () => {
    const transcriptionLayer = makeLayer('trc-base');
    const translationLayer = {
      ...makeLayer('trl-audio', 'translation'),
      key: 'trl_audio',
      modality: 'audio',
      acceptsAudio: true,
    } as LayerDocType;
    const unit = makeUnit('u1', 0, 1, 's1');
    const startRecordingForUnit = vi.fn(async () => undefined);

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        timelineRenderUnits={[unit]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        renderAnnotationItem={(_utt, _layer, _draft, extra) => {
          const audioExtra = extra as typeof extra & { content?: React.ReactNode; tools?: React.ReactNode };
          return <div>{audioExtra.content}{audioExtra.tools}</div>;
        }}
        allLayersOrdered={[translationLayer, transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer, transcriptionLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={new Map([[translationLayer.id, new Map()]])}
        mediaItems={[]}
        startRecordingForUnit={startRecordingForUnit}
        stopRecording={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i }));

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: unit.id }),
      expect.objectContaining({ id: translationLayer.id }),
    );
    expect(screen.getByText(/未录音|Not recorded/)).toBeTruthy();
  });

  it('renders enabled recording control for mixed translation rows in horizontal mode', () => {
    const transcriptionLayer = makeLayer('trc-mixed-base');
    const translationLayer = {
      ...makeLayer('trl-mixed', 'translation'),
      key: 'trl_mixed',
      modality: 'mixed',
      acceptsAudio: false,
    } as LayerDocType;
    const unit = makeUnit('u-mixed-1', 0, 1, 's1');
    const startRecordingForUnit = vi.fn(async () => undefined);

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        timelineRenderUnits={[unit]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        renderAnnotationItem={(_utt, _layer, _draft, extra) => {
          const audioExtra = extra as typeof extra & { content?: React.ReactNode; tools?: React.ReactNode };
          return <div>{audioExtra.content}{audioExtra.tools}</div>;
        }}
        allLayersOrdered={[translationLayer, transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer, transcriptionLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={new Map([[translationLayer.id, new Map()]])}
        mediaItems={[]}
        startRecordingForUnit={startRecordingForUnit}
        stopRecording={vi.fn()}
      />,
    );

    const recordButton = screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i });
    expect(recordButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(recordButton);

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: unit.id }),
      expect.objectContaining({ id: translationLayer.id }),
    );
  });

  it('resolves horizontal playback by segment fallback key when scope key is parent unit id', () => {
    const transcriptionLayer = makeLayer('trc-playback-base');
    const translationLayer = {
      ...makeLayer('trl-playback', 'translation'),
      key: 'trl_playback',
      modality: 'mixed',
      acceptsAudio: true,
    } as LayerDocType;
    const parentUnit = makeUnit('u-parent-1', 0, 2, 's1');
    const segmentItem = {
      ...makeUnit('seg-playback-1', 0, 2, 's1'),
      unitType: 'segment',
      parentUnitId: parentUnit.id,
      layerId: transcriptionLayer.id,
    } as LayerUnitDocType;
    const translationAudioByLayer = new Map<string, Map<string, LayerUnitContentDocType>>([
      [
        translationLayer.id,
        new Map([
          [
            segmentItem.id,
            {
              id: 'tr-audio-1',
              textId: 't1',
              unitId: segmentItem.id,
              layerId: translationLayer.id,
              modality: 'audio',
              sourceType: 'human',
              translationAudioMediaId: 'media-audio-1',
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        ]),
      ],
    ]);
    const mediaItems: MediaItemDocType[] = [{
      id: 'media-audio-1',
      textId: 't1',
      filename: 'playback.webm',
      url: 'blob:horizontal-playback',
      isOfflineCached: true,
      details: { source: 'translation-recording', mimeType: 'audio/webm' },
      createdAt: NOW,
    }] as MediaItemDocType[];

    render(
      <TranscriptionTimelineHorizontalMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        timelineRenderUnits={[segmentItem]}
        segmentParentUnitLookup={[parentUnit]}
        flashLayerRowId=""
        focusedLayerRowId=""
        defaultTranscriptionLayerId={transcriptionLayer.id}
        renderAnnotationItem={(_utt, _layer, _draft, extra) => {
          const audioExtra = extra as typeof extra & { content?: React.ReactNode; tools?: React.ReactNode };
          return <div>{audioExtra.content}{audioExtra.tools}</div>;
        }}
        allLayersOrdered={[translationLayer, transcriptionLayer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={[translationLayer, transcriptionLayer]}
        onFocusLayer={vi.fn()}
        laneHeights={{ [translationLayer.id]: 44, [transcriptionLayer.id]: 44 }}
        onLaneHeightChange={vi.fn()}
        translationAudioByLayer={translationAudioByLayer}
        mediaItems={mediaItems}
        startRecordingForUnit={vi.fn(async () => undefined)}
        stopRecording={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /播放录音翻译|播放已录音翻译|Play recorded translation/i })).toBeTruthy();
  });
});
