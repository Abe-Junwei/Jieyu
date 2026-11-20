import { useEffect, useRef } from 'react';

const IDLE_MS = 500;
const CAP_MS = 5000;

/** Idle and capped save triggers for one dirty draft. `onFire` runs the guard's flush. */
export function useDesktopDraftTimers(onFire: () => void) {
  const dirtySince = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const capTimer = useRef<number | null>(null);
  const fireRef = useRef(onFire);
  fireRef.current = onFire;

  const clear = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    if (capTimer.current !== null) window.clearTimeout(capTimer.current);
    idleTimer.current = null;
    capTimer.current = null;
    dirtySince.current = null;
  };

  // `skip` is true when the draft is gone or already committed: only the idle timer is dropped.
  const arm = (skip: boolean) => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    if (skip) return;
    if (dirtySince.current === null) {
      dirtySince.current = Date.now();
      capTimer.current = window.setTimeout(() => fireRef.current(), CAP_MS);
    }
    idleTimer.current = window.setTimeout(() => fireRef.current(), IDLE_MS);
  };

  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      if (capTimer.current !== null) window.clearTimeout(capTimer.current);
    },
    [],
  );

  return { arm, clear };
}
