import { useRef } from 'react';

const IDLE_MS = 500;
const CAP_MS = 5000;

/** Idle and capped save triggers for a raw time-field edit. */
export function useEdgeSaveTimer() {
  const idle = useRef<number | null>(null);
  const cap = useRef<number | null>(null);

  const cancelIdle = () => {
    if (idle.current !== null) window.clearTimeout(idle.current);
    idle.current = null;
  };

  const schedule = (fire: () => void) => {
    cancelIdle();
    idle.current = window.setTimeout(() => {
      idle.current = null;
      fire();
    }, IDLE_MS);
    if (cap.current !== null) return;
    cap.current = window.setTimeout(() => {
      cap.current = null;
      cancelIdle();
      fire();
    }, CAP_MS);
  };

  return { schedule, cancelIdle };
}
