import { getEffectiveKeymap, matchKeyEvent } from '../services/KeybindingService';

export function playbackKeyAction(event: KeyboardEvent): 'playPause' | 'playSegment' | null {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
    return null;
  }
  const keymap = getEffectiveKeymap();
  const playPause = keymap.get('playPause');
  if (playPause && matchKeyEvent(event, playPause)) return 'playPause';
  const playSegment = keymap.get('playSegment');
  if (playSegment && matchKeyEvent(event, playSegment)) return 'playSegment';
  return null;
}
