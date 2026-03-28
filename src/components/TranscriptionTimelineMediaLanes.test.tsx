// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, UtteranceDocType } from '../db';
import { TranscriptionTimelineMediaLanes } from './TranscriptionTimelineMediaLanes';

const NOW = new Date().toISOString();

const editorContextValue = {
  utteranceDrafts: {} as Record<string, string>,
  setUtteranceDrafts: vi.fn(),
  translationDrafts: {} as Record<string, string>,
  setTranslationDrafts: vi.fn(),
  translationTextByLayer: new Map(),
  focusedTranslationDraftKeyRef: { current: null as string | null },
  renderLaneLabel: vi.fn(() => 'lane'),
  getUtteranceTextForLayer: vi.fn(() => ''),
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

const timelineLaneHeaderMock = vi.fn(
  ({ layer, onToggleCollapsed }: { layer: { id: string }; onToggleCollapsed: () => void; trackModeControl?: { lockConflictCount?: number } }) => (
    <button type="button" data-testid={`toggle-${layer.id}`} onClick={onToggleCollapsed}>toggle</button>
  ),
);

vi.mock('./TimelineLaneHeader', () => ({
  TimelineLaneHeader: (props: { layer: { id: string }; onToggleCollapsed: () => void; trackModeControl?: { lockConflictCount?: number } }) => timelineLaneHeaderMock(props),
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

function makeUtterance(id: string, startTime: number, endTime: number, speakerId?: string, speaker?: string): UtteranceDocType {
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
  } as UtteranceDocType;
}

describe('TranscriptionTimelineMediaLanes overlap hint local expansion', () => {
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
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        timelineRenderUtterances={[makeUtterance('u1', 0, 1, 's1')]}
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

  it('expands only the clicked overlap window and auto-collapses after timeout', () => {
    const layer = makeLayer('trc-1');
    const utterances = [
      makeUtterance('u1', 0, 5, 's1'),
      makeUtterance('u2', 1, 4, 's2'),
      makeUtterance('u3', 7, 8, 's3'),
      makeUtterance('u4', 10, 13, 's1'),
      makeUtterance('u5', 11, 12, 's2'),
    ];

    const { container } = render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
    const utterances = [
      makeUtterance('u1', 0, 5, 's1'),
      makeUtterance('u2', 1, 4, 's2'),
      makeUtterance('u3', 7, 8, 's3'),
      makeUtterance('u4', 10, 13, 's1'),
      makeUtterance('u5', 11, 12, 's2'),
    ];

    const { container } = render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
    const utterances = [makeUtterance('u1', 0, 5, 's1')];

    render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
    const utterances = [
      makeUtterance('u1', 0, 5, 's1'),
      makeUtterance('u2', 1, 4, 's2'),
      makeUtterance('u3', 2, 3, 's3'),
    ];

    const { container } = render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[]}
        translationLayers={[trLayer]}
        timelineRenderUtterances={utterances}
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

    render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[]}
        translationLayers={[translationLayer]}
        timelineRenderUtterances={[makeUtterance('u-main', 0, 2, 's1')]}
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
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        timelineRenderUtterances={[makeUtterance('u-main', 0, 2, 's1')]}
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
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[parentLayer, childLayer]}
        translationLayers={[]}
        timelineRenderUtterances={[makeUtterance('u-main', 0, 2, 's1')]}
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

  it('dims non-target speakers in focus-soft mode', () => {
    const layer = makeLayer('trc-1');
    const utterances = [
      makeUtterance('u1', 0, 2, 's1'),
      makeUtterance('u2', 2, 4, 's2'),
    ];

    const { container } = render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
        speakerFocusMode="focus-soft"
        speakerFocusSpeakerKey="s1"
      />,
    );

    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(container.querySelectorAll('.timeline-annotation-subtrack-focus-dim').length).toBe(1);
  });

  it('hides non-target speaker in focus-hard mode', () => {
    const layer = makeLayer('trc-1');
    const utterances = [
      makeUtterance('u1', 0, 2, 's1'),
      makeUtterance('u2', 2, 4, 's2'),
    ];

    render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
        speakerFocusMode="focus-hard"
        speakerFocusSpeakerKey="s1"
      />,
    );

    const container = screen.getByTestId('ann-u1').closest('.timeline-content') as HTMLElement;
    expect(screen.getByTestId('ann-u1')).toBeTruthy();
    expect(screen.getByTestId('ann-u2')).toBeTruthy();
    expect(container.querySelectorAll('.timeline-annotation-subtrack-focus-dim').length).toBe(0);
    expect(container.querySelectorAll('.timeline-annotation-subtrack-focus-hidden').length).toBe(1);
  });

  it('uses independent segment speakerId when no owner utterance exists', () => {
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
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={[]}
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
        speakerFocusMode="focus-hard"
        speakerFocusSpeakerKey="s2"
      />,
    );

    const container = screen.getByTestId('ann-seg_1').closest('.timeline-content') as HTMLElement;
    expect(container.querySelectorAll('.timeline-annotation-subtrack-focus-hidden').length).toBe(1);
  });

  it('passes overlap cycle status to annotation renderer for overlapping items', () => {
    const layer = makeLayer('trc-1');
    const utterances = [
      makeUtterance('u1', 0, 3, 's1'),
      makeUtterance('u2', 1, 4, 's2'),
      makeUtterance('u3', 5, 6, 's3'),
    ];

    render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
    const utterances = [
      makeUtterance('u1', 0, 4, 's1'),
      makeUtterance('u2', 1, 3, 's2'),
    ];

    const { rerender } = render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[layer]}
        translationLayers={[]}
        timelineRenderUtterances={utterances}
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

  it('renders recording controls for audio translation rows and starts recording', () => {
    const transcriptionLayer = makeLayer('trc-base');
    const translationLayer = {
      ...makeLayer('trl-audio', 'translation'),
      key: 'trl_audio',
      modality: 'audio',
      acceptsAudio: true,
    } as LayerDocType;
    const utterance = makeUtterance('u1', 0, 1, 's1');
    const startRecordingForUtterance = vi.fn(async () => undefined);

    render(
      <TranscriptionTimelineMediaLanes
        playerDuration={20}
        zoomPxPerSec={100}
        lassoRect={null}
        transcriptionLayers={[transcriptionLayer]}
        translationLayers={[translationLayer]}
        timelineRenderUtterances={[utterance]}
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
        startRecordingForUtterance={startRecordingForUtterance}
        stopRecording={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '开始录音翻译' }));

    expect(startRecordingForUtterance).toHaveBeenCalledWith(
      expect.objectContaining({ id: utterance.id }),
      expect.objectContaining({ id: translationLayer.id }),
    );
    expect(screen.getByText('未录音')).toBeTruthy();
  });
});
