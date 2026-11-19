import { createDesktopClient, EDIT_OUTCOME_UNKNOWN } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { formatPlaybackTime } from './useDesktopTranscriptionMediaController';
import {
  edgeRejectKind,
  parseTimecode,
  selectedPair,
  type TimeEdge,
  type TimedEdgeUnit,
} from './desktopTranscriptionEdge';
import type { EdgeSelection } from './desktopTranscriptionEdge';

export interface EdgeCall {
  sessionId: string;
  api: ReturnType<typeof createDesktopClient>;
}

/** A stored draft typed against an older formal edge (ADR-0129 E02). */
export interface TimeConflict {
  currentMs: number;
  rawInput: string;
}

export interface StoredTimes {
  start: string | null;
  end: string | null;
  saved: boolean;
  conflicts: Record<TimeEdge, TimeConflict | null>;
}

export const NO_CONFLICTS: StoredTimes['conflicts'] = { start: null, end: null };

export function watchTimeDraft(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  unitId: string | null;
  stale: () => boolean;
  apply: (raw: StoredTimes) => void;
}): () => void {
  if (input.unitId === null || input.sessionId === null || input.desktopCall === undefined) {
    return () => undefined;
  }
  let cancel = false;
  const unitId = input.unitId;
  void createDesktopClient({ desktopCall: input.desktopCall })
    .readTimeDraft(input.sessionId, unitId)
    .then((rows) => {
      if (cancel || input.stale()) return;
      const conflict = (edge: TimeEdge): TimeConflict | null => {
        const row = rows.find((item) => item.edge === edge);
        return row?.conflict && row.currentMs !== null
          ? { currentMs: row.currentMs, rawInput: row.rawInput }
          : null;
      };
      input.apply({
        start: rows.find((row) => row.edge === 'start')?.rawInput ?? null,
        end: rows.find((row) => row.edge === 'end')?.rawInput ?? null,
        saved: rows.length > 0,
        conflicts: { start: conflict('start'), end: conflict('end') },
      });
    })
    .catch(() => undefined);
  return () => {
    cancel = true;
  };
}

export function openEdgeCall(
  sessionId: string | null,
  desktopCall: DesktopReadHost['desktopCall'] | undefined,
): EdgeCall | null {
  if (sessionId === null || desktopCall === undefined) return null;
  return { sessionId, api: createDesktopClient({ desktopCall }) };
}

export function edgeFailureMessage(
  error: unknown,
  timeMs: number,
  message: (kind: ReturnType<typeof edgeRejectKind>, time: string) => string,
): string {
  const text = error instanceof Error ? error.message : '';
  return message(edgeRejectKind(text), formatPlaybackTime(timeMs / 1000));
}

export async function commitUnitEdge(call: EdgeCall, unitId: string, edge: TimeEdge, time: number) {
  await call.api.moveUnitEdge(call.sessionId, { unitId, edge, time });
}

export async function commitSharedEdge(
  call: EdgeCall,
  leftId: string,
  rightId: string,
  time: number,
) {
  await call.api.moveSharedBoundary(call.sessionId, { leftId, rightId, time });
}

export async function nudgeSelection(
  call: EdgeCall,
  units: readonly TimedEdgeUnit[],
  selected: EdgeSelection,
  delta: number,
): Promise<
  | { kind: 'edge'; unitId: string; edge: TimeEdge; time: number }
  | { kind: 'shared'; leftId: string; rightId: string; time: number }
  | null
> {
  const unit = units.find((item) => item.id === selected.unitId);
  if (!unit) return null;
  if (selected.edge === 'shared') {
    const pair = selectedPair(units, selected);
    if (!pair) return null;
    const time = pair.timeMs + delta;
    await commitSharedEdge(call, pair.leftId, pair.rightId, time);
    return { kind: 'shared', leftId: pair.leftId, rightId: pair.rightId, time };
  }
  const time = (selected.edge === 'start' ? unit.startMs : unit.endMs) + delta;
  await commitUnitEdge(call, unit.id, selected.edge, time);
  return { kind: 'edge', unitId: unit.id, edge: selected.edge, time };
}

export async function applyNudge(input: {
  call: EdgeCall;
  units: readonly TimedEdgeUnit[];
  selected: EdgeSelection;
  delta: number;
}): Promise<{ failed: false } | { failed: true; error: unknown; time: number } | null> {
  try {
    const moved = await nudgeSelection(input.call, input.units, input.selected, input.delta);
    if (!moved) return null;
    return { failed: false };
  } catch (error) {
    const unit = input.units.find((item) => item.id === input.selected.unitId);
    const time =
      !unit || input.selected.edge === 'shared'
        ? 0
        : input.selected.edge === 'start'
          ? unit.startMs
          : unit.endMs;
    return { failed: true, error, time };
  }
}

export type StackResult = 'empty' | 'done' | 'stale' | 'unknown' | 'failed';

/** Undo/redo. A stale step stays on the stack until it is dropped explicitly (ADR-0129 E04). */
export async function runEdgeStack(
  call: EdgeCall,
  manuscriptId: string | null,
  action: 'undo' | 'redo',
): Promise<StackResult> {
  try {
    if (action === 'undo') await call.api.undoStep(call.sessionId, manuscriptId ?? undefined);
    else await call.api.redoStep(call.sessionId, manuscriptId ?? undefined);
    return 'done';
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    if (text.endsWith('is empty')) return 'empty';
    if (text.endsWith('is stale')) return 'stale';
    return text.includes(EDIT_OUTCOME_UNKNOWN) ? 'unknown' : 'failed';
  }
}

export async function dropEdgeStack(
  call: EdgeCall,
  manuscriptId: string | null,
  action: 'undo' | 'redo',
): Promise<void> {
  if (action === 'undo') await call.api.dropUndoStep(call.sessionId, manuscriptId ?? undefined);
  else await call.api.dropRedoStep(call.sessionId, manuscriptId ?? undefined);
}

/**
 * Re-checks a conflicting draft against the current formal edge and commits it through the
 * normal edge move. When it is still not a valid time the draft stays, now based on the
 * current value and carrying the reason.
 */
export async function rebaseTimeDraft(input: {
  call: EdgeCall;
  unit: TimedEdgeUnit;
  edge: TimeEdge;
  raw: string;
}): Promise<{ committed: true } | { committed: false; error: unknown; time: number }> {
  const baseMs = input.edge === 'start' ? input.unit.startMs : input.unit.endMs;
  const parsed = parseTimecode(input.raw);
  let error: unknown = new Error('time draft is unfinished');
  if (parsed !== null) {
    try {
      await commitUnitEdge(input.call, input.unit.id, input.edge, parsed);
      return { committed: true };
    } catch (caught) {
      error = caught;
    }
  }
  const text = error instanceof Error ? error.message : '';
  await input.call.api.putTimeDraft(input.call.sessionId, {
    unitId: input.unit.id,
    edge: input.edge,
    rawInput: input.raw,
    baseMs,
    issue: parsed === null ? 'format' : edgeRejectKind(text),
  });
  return { committed: false, error, time: parsed ?? baseMs };
}

export async function flushTypedEdge(input: {
  call: EdgeCall;
  unit: TimedEdgeUnit;
  edge: TimeEdge;
  raw: string;
  onDraft: () => void;
}): Promise<'draft' | 'official' | 'commit'> {
  const baseMs = input.edge === 'start' ? input.unit.startMs : input.unit.endMs;
  if (input.raw === formatPlaybackTime(baseMs / 1000)) {
    await input.call.api.discardTimeDraft(input.call.sessionId, input.unit.id, input.edge);
    return 'official';
  }
  const parsed = parseTimecode(input.raw);
  if (parsed === null) {
    await input.call.api.putTimeDraft(input.call.sessionId, {
      unitId: input.unit.id,
      edge: input.edge,
      rawInput: input.raw,
      baseMs,
      issue: null,
    });
    input.onDraft();
    return 'draft';
  }
  await commitUnitEdge(input.call, input.unit.id, input.edge, parsed);
  return 'commit';
}
