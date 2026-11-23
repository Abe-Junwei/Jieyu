/** @vitest-environment jsdom */
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createEdgeActions,
  EMPTY_EDGE_UI,
  type EdgeControllerInput,
  type EdgeUi,
} from './desktopTranscriptionEdgeActions';

const tx = {
  id: 'tx',
  tierType: 'time-aligned',
  contentType: 'transcription',
  units: [{ id: 'u1', speakerId: 's1', startMs: 0, endMs: 1000 }],
};
const tr = { id: 'tr', tierType: 'symbolic-association', contentType: 'translation', units: [] };
const links = [{ layerId: 'tr', hostLayerId: 'tx', isPreferred: true, sortOrder: 0 }];

function setup() {
  const desktopCall = vi.fn(async (_session: string, method: string) =>
    method === 'units.create' ? { id: 'new' } : null,
  );
  const notify = vi.fn();
  const selectUnits = vi.fn();
  const reload = vi.fn(async () => undefined);
  const input: EdgeControllerInput = {
    sessionId: 's',
    manuscriptId: 'm',
    // The translation lane is the target; creates land on its host transcription layer.
    layerId: 'tr',
    desktopCall,
    units: [{ id: 'u1', startMs: 0, endMs: 1000 }],
    hasMedia: true,
    zoomPxPerSec: 100,
    selectedUnitId: null,
    selectedUnitIds: [],
    clearSelection: vi.fn(),
    playheadMs: () => null,
    reload,
    message: (kind) => kind,
    snapMessage: () => '',
    draftSavedMessage: '',
    skipped: () => false,
    notify,
    createRoute: { layers: [tx, tr], links },
    selectUnits,
  };
  const actions = createEdgeActions({
    live: { current: input },
    uiRef: { current: EMPTY_EDGE_UI },
    setUi: vi.fn(),
    edited: { current: false },
  });
  return { actions, desktopCall, notify, selectUnits, reload };
}

function drag(
  actions: ReturnType<typeof createEdgeActions>,
  fromPx: number,
  toPx: number,
  speakerId?: string | null,
  msPerPx = 10,
) {
  const event = { button: 0, clientX: fromPx } as ReactPointerEvent<HTMLElement>;
  const msAt = (x: number) => x * msPerPx;
  if (speakerId === undefined) actions.beginWaveCreate(event, msAt);
  else {
    const track = document.createElement('div');
    Object.assign(event, { target: track, currentTarget: track });
    track.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
    actions.beginCreate(event, { speakerId });
  }
  window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: toPx, clientY: 0 }));
  window.dispatchEvent(new Event('pointerup'));
}

describe('edge actions create (ADR-0132 routing)', () => {
  it('creates on the host layer of a symbolic target from the waveform', async () => {
    const run = setup();
    drag(run.actions, 200, 300);
    await vi.waitFor(() => expect(run.reload).toHaveBeenCalled());
    expect(run.desktopCall).toHaveBeenCalledWith(
      's',
      'units.create',
      expect.objectContaining({
        layerId: 'tx',
        startMs: 2000,
        endMs: 3000,
        speakerId: null,
        parentUnitId: null,
      }),
    );
  });

  it('turns a waveform drag over a segment into a selection', () => {
    const run = setup();
    drag(run.actions, 150, 50);
    expect(run.selectUnits).toHaveBeenCalledWith(['u1']);
    expect(run.desktopCall).not.toHaveBeenCalled();
  });

  it('lets another speaker lane create over that segment', async () => {
    const run = setup();
    drag(run.actions, 150, 50, 's2');
    await vi.waitFor(() => expect(run.reload).toHaveBeenCalled());
    expect(run.desktopCall).toHaveBeenCalledWith(
      's',
      'units.create',
      expect.objectContaining({ layerId: 'tx', startMs: 500, endMs: 1500, speakerId: 's2' }),
    );
  });

  it('refuses a drag under 50ms without writing', () => {
    const run = setup();
    drag(run.actions, 200, 208, undefined, 5);
    expect(run.notify).toHaveBeenCalledWith('createShort');
    expect(run.desktopCall).not.toHaveBeenCalled();
  });
});

describe('edge actions delete selection', () => {
  it('previews and deletes all selected units, then clears the selection', async () => {
    const run = setup();
    const clearSelection = vi.fn();
    const desktopCall = vi.fn(async (_session: string, method: string) =>
      method === 'units.deleteManyPreview'
        ? {
            linkedTexts: 0,
            tokens: 0,
            morphemes: 0,
            notes: 0,
            lexemeLinks: 0,
            analysisCandidates: 0,
            customFieldValues: 0,
            drafts: 0,
            receptionRecords: 0,
          }
        : { ids: ['u1', 'u2'] },
    );
    const input = {
      sessionId: 's',
      manuscriptId: 'm',
      layerId: 'tx',
      desktopCall,
      units: [
        { id: 'u1', startMs: 0, endMs: 1000 },
        { id: 'u2', startMs: 1000, endMs: 2000 },
      ],
      selectedUnitId: 'u1',
      selectedUnitIds: ['u1', 'u2'],
      clearSelection,
      reload: run.reload,
      notify: run.notify,
      message: (kind: string) => kind,
      hasMedia: true,
      zoomPxPerSec: 100,
      playheadMs: () => null,
      snapMessage: () => '',
      draftSavedMessage: '',
      skipped: () => false,
    } as EdgeControllerInput;
    const uiRef = { current: EMPTY_EDGE_UI as EdgeUi };
    const setUi: Dispatch<SetStateAction<EdgeUi>> = (next) => {
      uiRef.current = typeof next === 'function' ? next(uiRef.current) : next;
    };
    const actions = createEdgeActions({
      live: { current: input },
      uiRef,
      setUi,
      edited: { current: false },
    });
    await actions.askDelete('u1');
    expect(uiRef.current.deletePrompt?.unitIds).toEqual(['u1', 'u2']);
    actions.confirmDelete();
    await vi.waitFor(() => expect(clearSelection).toHaveBeenCalledOnce());
    expect(desktopCall).toHaveBeenCalledWith(
      's',
      'units.deleteMany',
      expect.objectContaining({ unitIds: ['u1', 'u2'] }),
    );
  });

  it('does not report a committed deletion as a write failure when refresh fails', async () => {
    const run = setup();
    const uiRef = { current: EMPTY_EDGE_UI as EdgeUi };
    const setUi: Dispatch<SetStateAction<EdgeUi>> = (next) => {
      uiRef.current = typeof next === 'function' ? next(uiRef.current) : next;
    };
    const input: EdgeControllerInput = {
      sessionId: 's',
      manuscriptId: 'm',
      layerId: 'tx',
      desktopCall: vi.fn(async () => null),
      units: [{ id: 'u1', startMs: 0, endMs: 1000 }],
      hasMedia: true,
      zoomPxPerSec: 100,
      selectedUnitId: 'u1',
      selectedUnitIds: ['u1'],
      clearSelection: vi.fn(),
      playheadMs: () => null,
      reload: vi.fn(async () => {
        throw new Error('read failed');
      }),
      message: (kind) => kind,
      snapMessage: () => '',
      draftSavedMessage: '',
      skipped: () => false,
      notify: run.notify,
    };
    const actions = createEdgeActions({
      live: { current: input },
      uiRef,
      setUi,
      edited: { current: false },
    });
    await actions.askDelete('u1');
    actions.confirmDelete();
    await vi.waitFor(() => expect(run.notify).toHaveBeenCalledWith('deleteRefreshFailed'));
    expect(run.notify).not.toHaveBeenCalledWith('deleteFailed');
  });
});
