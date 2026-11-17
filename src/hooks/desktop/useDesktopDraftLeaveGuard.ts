import { useEffect, useRef, useState, type RefObject } from 'react';
import { useBlocker } from 'react-router-dom';
import type { DesktopTextDraft } from '../../desktop/desktopTextDraft';

/** Owns pending navigation and unload blocking; persistence remains in the text guard. */
export function useDesktopDraftLeaveGuard(
  draftRef: RefObject<DesktopTextDraft | null>,
  held: (draft: DesktopTextDraft | null) => boolean,
  submittable: (draft: DesktopTextDraft) => boolean,
  trySave: (draft: DesktopTextDraft) => Promise<boolean>,
) {
  const [prompt, setPrompt] = useState<{ failed: boolean } | null>(null);
  const pending = useRef<{ go: () => void; cancel: () => void } | null>(null);
  const leave = (go: () => void, cancel: () => void = () => {}) => {
    const current = draftRef.current;
    if (current === null || held(current)) {
      go();
      return;
    }
    pending.current = { go, cancel };
    if (!submittable(current)) {
      setPrompt({ failed: false });
      return;
    }
    void trySave(current).then((saved) => {
      if (!saved) {
        setPrompt({ failed: true });
        return;
      }
      const latest = draftRef.current;
      if (latest !== null && latest !== current && !held(latest)) {
        const next = pending.current;
        if (next === null) return;
        leave(next.go, next.cancel);
        return;
      }
      pending.current = null;
      go();
    });
  };

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      draftRef.current !== null &&
      !held(draftRef.current) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  const blocked = blocker.state === 'blocked';
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  useEffect(() => {
    if (!blocked) return;
    leave(
      () => blockerRef.current.proceed?.(),
      () => blockerRef.current.reset?.(),
    );
    // `leave` reads refs only; re-running on its identity would re-block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = draftRef.current;
      if (current === null || held(current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [draftRef, held]);

  const finish = (go: boolean) => {
    const next = pending.current;
    pending.current = null;
    setPrompt(null);
    if (next === null) return;
    if (go) next.go();
    else next.cancel();
  };

  const retry = () => {
    const current = draftRef.current;
    if (current === null || !submittable(current)) return;
    const next = pending.current;
    leave(next?.go ?? (() => finish(true)), next?.cancel);
  };
  return { prompt, leave, retry, finish, fail: () => setPrompt({ failed: true }) };
}
