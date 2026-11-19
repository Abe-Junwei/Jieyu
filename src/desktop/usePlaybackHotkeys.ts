import { useEffect, useRef } from 'react';
import { playbackKeyAction } from './playbackKeys';

export function usePlaybackHotkeys(actions: {
  playPause: () => void;
  playSegment: () => void;
}): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = playbackKeyAction(event);
      if (action === null) return;
      event.preventDefault();
      actionsRef.current[action]();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
