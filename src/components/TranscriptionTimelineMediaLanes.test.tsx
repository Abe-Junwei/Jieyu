// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationLayerDocType, UtteranceDocType } from '../db';
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

vi.mock('./TimelineLaneHeader', () => ({
  TimelineLaneHeader: ({ layer, onToggleCollapsed }: { layer: { id: string }; onToggleCollapsed: () => void }) => (
    <button type="button" data-testid={`toggle-${layer.id}`} onClick={onToggleCollapsed}>toggle</button>
  ),
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

function makeUtterance(id: string, startTime: number, endTime: number, speakerId: string): UtteranceDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    speakerId,
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
    cleanup();
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
});
