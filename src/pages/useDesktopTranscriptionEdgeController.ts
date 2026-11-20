import { useEffect, useRef, useState } from 'react';
import { useEdgeSaveTimer } from './useEdgeSaveTimer';
import type { TimeEdge } from './desktopTranscriptionEdge';
import { watchTimeDraft } from './desktopTranscriptionEdgeSession';
import { bindEdgeKeys, type ShownPreview } from './desktopTranscriptionEdgePointer';
import {
  createEdgeActions,
  EMPTY_EDGE_UI,
  type EdgeControllerInput,
  type EdgeUi,
} from './desktopTranscriptionEdgeActions';

export type { ShownPreview };

export function useDesktopTranscriptionEdgeController(input: EdgeControllerInput) {
  const live = useRef(input);
  live.current = input;
  const [ui, setUi] = useState<EdgeUi>(EMPTY_EDGE_UI);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const edited = useRef(false);
  const watchedUnit = useRef<string | null>(null);
  const [actions] = useState(() => createEdgeActions({ live, uiRef, setUi, edited }));
  const timer = useEdgeSaveTimer();

  useEffect(
    () =>
      bindEdgeKeys({
        selectedUnitId: () => live.current.selectedUnitId,
        edge: () => uiRef.current.edge,
        undo: () => void actions.runStack('undo'),
        redo: () => void actions.runStack('redo'),
        remove: (id) => void actions.askDelete(id),
        cycle: (id) => actions.cycle(id),
        nudge: (selected, delta) => void actions.nudge(selected, delta),
      }),
    [actions],
  );

  const selectedUnit = input.units.find((unit) => unit.id === input.selectedUnitId);
  const selectedStart = selectedUnit?.startMs ?? null;
  const selectedEnd = selectedUnit?.endMs ?? null;
  // Re-read the stored drafts when the selected unit's formal edges move (undo, redo, a
  // neighbor's shared move), so a draft typed against the old value shows as a conflict.
  useEffect(() => {
    const unitId = input.selectedUnitId;
    if (watchedUnit.current !== unitId) {
      watchedUnit.current = unitId;
      edited.current = false;
      setUi((current) => ({
        ...current,
        edge:
          current.edge && (current.edge.unitId === unitId || current.edge.otherId === unitId)
            ? current.edge
            : null,
        raw: { ...EMPTY_EDGE_UI.raw, unitId: unitId ?? '' },
      }));
    }
    return watchTimeDraft({
      sessionId: input.sessionId,
      desktopCall: input.desktopCall,
      unitId,
      stale: () => edited.current,
      apply: (raw) => setUi((current) => ({ ...current, raw: { unitId: unitId ?? '', ...raw } })),
    });
  }, [input.desktopCall, input.selectedUnitId, input.sessionId, selectedStart, selectedEnd]);

  function schedule(edge: TimeEdge) {
    timer.schedule(() => void actions.flush(edge));
  }

  return {
    ...actions,
    ui,
    hasMedia: input.hasMedia,
    editTime(edge: TimeEdge, value: string) {
      edited.current = true;
      setUi((current) => ({
        ...current,
        raw: {
          ...current.raw,
          unitId: live.current.selectedUnitId ?? '',
          [edge]: value,
          saved: false,
          conflicts: { ...current.raw.conflicts, [edge]: null },
        },
      }));
      schedule(edge);
    },
    flushTime(edge: TimeEdge) {
      timer.cancelIdle();
      void actions.flush(edge);
    },
  };
}
