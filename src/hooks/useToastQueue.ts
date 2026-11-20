import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastItem } from '../contexts/ToastContext';

/** 同屏最多 3 条（ADR-0116）。 | Max visible toasts (ADR-0116). */
export const TOAST_MAX_VISIBLE = 3;
export const TOAST_FADE_OUT_MS = 260;

interface TimerEntry {
  timer: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  startedAt: number;
}

/** 结果类优先被挤掉；需要处理的（错误、警告、常驻）后挤。 | Results are evicted before items needing attention. */
function evictionRank(item: ToastItem): number {
  return item.variant === 'success' || item.variant === 'info' ? 0 : 1;
}

export interface ToastQueue {
  items: ToastItem[];
  /** delayMs<=0 表示不自动关闭；同 key 原位更新。 | delayMs<=0 persists; same key updates in place. */
  push: (item: ToastItem, delayMs: number) => void;
  dismiss: (id: string) => void;
  dismissWhere: (predicate: (item: ToastItem) => boolean) => void;
  dismissAll: () => void;
  /** 悬停、键盘焦点、窗口失焦时暂停计时。 | Pause timers on hover, focus or window blur. */
  setPaused: (paused: boolean) => void;
}

export function useToastQueue(): ToastQueue {
  const [items, setItems] = useState<ToastItem[]>([]);
  const itemsRef = useRef<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, TimerEntry>());
  const removeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pausedRef = useRef(false);

  const commit = useCallback((next: ToastItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const clearTimer = useCallback((id: string) => {
    const entry = timersRef.current.get(id);
    if (entry?.timer != null) clearTimeout(entry.timer);
    timersRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target || target.exiting === true) return;
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, exiting: true } : item)));
      removeTimersRef.current.set(
        id,
        setTimeout(() => {
          removeTimersRef.current.delete(id);
          commit(itemsRef.current.filter((item) => item.id !== id));
        }, TOAST_FADE_OUT_MS),
      );
    },
    [clearTimer, commit],
  );

  const startTimer = useCallback(
    (id: string, ms: number) => {
      clearTimer(id);
      if (ms <= 0) return;
      const entry: TimerEntry = { timer: null, remainingMs: ms, startedAt: Date.now() };
      if (!pausedRef.current) {
        entry.timer = setTimeout(() => dismiss(id), ms);
      }
      timersRef.current.set(id, entry);
    },
    [clearTimer, dismiss],
  );

  const push = useCallback(
    (item: ToastItem, delayMs: number) => {
      let next = itemsRef.current.filter((existing) => existing.exiting !== true);
      const sameKey = item.key !== undefined ? next.find((e) => e.key === item.key) : undefined;
      if (sameKey) {
        clearTimer(sameKey.id);
        next = next.map((e) => (e.id === sameKey.id ? { ...item, id: sameKey.id } : e));
        commit([...itemsRef.current.filter((e) => e.exiting === true), ...next]);
        startTimer(sameKey.id, delayMs);
        return;
      }
      next = [...next, item];
      const evicted: string[] = [];
      while (next.length > TOAST_MAX_VISIBLE) {
        const victim = [...next].sort((a, b) => evictionRank(a) - evictionRank(b))[0]!;
        next = next.filter((e) => e.id !== victim.id);
        evicted.push(victim.id);
      }
      evicted.forEach(clearTimer);
      commit([...itemsRef.current.filter((e) => e.exiting === true), ...next]);
      startTimer(item.id, delayMs);
    },
    [clearTimer, commit, startTimer],
  );

  const dismissWhere = useCallback(
    (predicate: (item: ToastItem) => boolean) => {
      itemsRef.current.filter(predicate).forEach((item) => dismiss(item.id));
    },
    [dismiss],
  );

  const dismissAll = useCallback(() => dismissWhere(() => true), [dismissWhere]);

  const setPaused = useCallback(
    (paused: boolean) => {
      if (pausedRef.current === paused) return;
      pausedRef.current = paused;
      const now = Date.now();
      timersRef.current.forEach((entry, id) => {
        if (paused) {
          if (entry.timer != null) clearTimeout(entry.timer);
          entry.timer = null;
          entry.remainingMs = Math.max(entry.remainingMs - (now - entry.startedAt), 0);
        } else {
          entry.startedAt = now;
          entry.timer = setTimeout(() => dismiss(id), entry.remainingMs);
        }
      });
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    const removeTimers = removeTimersRef.current;
    return () => {
      timers.forEach((entry) => {
        if (entry.timer != null) clearTimeout(entry.timer);
      });
      removeTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { items, push, dismiss, dismissWhere, dismissAll, setPaused };
}
