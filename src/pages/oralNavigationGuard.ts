import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/** Route changes and window close wait until the open recording is saved or dropped. */
export function useOralNavigationGuard(
  holding: boolean,
  leave: (go: () => void, cancel?: () => void) => void,
) {
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const blocker = useBlocker(holding);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    leaveRef.current(
      () => blocker.proceed?.(),
      () => blocker.reset?.(),
    );
  }, [blocker]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!holding) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [holding]);
}
