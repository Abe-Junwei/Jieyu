import { useSyncExternalStore } from 'react';

/**
 * 转写页主波形播放时钟（秒）。由 `useWaveSurfer` 在 rAF 边界写入；
 * 纯展示组件可 `subscribe` + DOM 更新，或 `useTranscriptionPlaybackClock` 细粒度订阅，
 * 避免把高频时间绑在巨型 props 链上。
 */
let clockSec = 0;
const listeners = new Set<() => void>();

export function getTranscriptionPlaybackClockSnapshot(): number {
  return clockSec;
}

export function subscribeTranscriptionPlaybackClock(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function setTranscriptionPlaybackClock(nextSec: number): void {
  if (Object.is(clockSec, nextSec)) return;
  clockSec = nextSec;
  listeners.forEach((listener) => {
    listener();
  });
}

/** 仅单测：复位时钟并通知订阅方 | Tests only: reset clock and notify */
export function resetTranscriptionPlaybackClockForTests(nextSec = 0): void {
  clockSec = nextSec;
  listeners.forEach((listener) => {
    listener();
  });
}

export function useTranscriptionPlaybackClock(): number {
  return useSyncExternalStore(
    subscribeTranscriptionPlaybackClock,
    getTranscriptionPlaybackClockSnapshot,
    getTranscriptionPlaybackClockSnapshot,
  );
}
