import type { TimelineUnitKind } from './transcriptionTypes';

export interface EditEvent {
  action: 'create' | 'delete' | 'edit_text' | 'move' | 'split' | 'merge' | 'assign_speaker' | 'undo' | 'redo';
  unitId: string;
  unitKind: TimelineUnitKind;
  timestamp: number;
  detail?: string;
}

export type PushTimelineEditInput = Omit<EditEvent, 'timestamp'> & { timestamp?: number };

const DEFAULT_RING_CAPACITY = 10;

export function pushTimelineEditToRing(
  prev: readonly EditEvent[],
  input: PushTimelineEditInput,
  capacity = DEFAULT_RING_CAPACITY,
): EditEvent[] {
  const event: EditEvent = {
    action: input.action,
    unitId: input.unitId,
    unitKind: input.unitKind,
    timestamp: input.timestamp ?? Date.now(),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
  return [event, ...prev].slice(0, capacity);
}

export function formatRecentActions(events: readonly EditEvent[]): string[] {
  return events.map((event) => `${event.action}:${event.unitKind}:${event.unitId}${event.detail ? ` ${event.detail}` : ''}`);
}
