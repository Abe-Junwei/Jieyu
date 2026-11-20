import { getEffectiveKeymap, matchKeyEvent } from '../services/KeybindingService';

export type EdgeKeyAction =
  | 'nudgeEdgeBack'
  | 'nudgeEdgeForward'
  | 'nudgeEdgeBackCoarse'
  | 'nudgeEdgeForwardCoarse'
  | 'undo'
  | 'redo'
  | 'deleteSegment'
  | 'cycleEdge';

const ORDER: readonly EdgeKeyAction[] = [
  'nudgeEdgeBackCoarse',
  'nudgeEdgeForwardCoarse',
  'nudgeEdgeBack',
  'nudgeEdgeForward',
  'undo',
  'redo',
  'deleteSegment',
  'cycleEdge',
];

export function edgeKeyAction(event: KeyboardEvent): EdgeKeyAction | null {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
    return null;
  }
  const keymap = getEffectiveKeymap();
  for (const id of ORDER) {
    const combo = keymap.get(id);
    if (combo && matchKeyEvent(event, combo)) return id;
  }
  return null;
}
