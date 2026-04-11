import { useSyncExternalStore } from 'react';

// 订阅 resize 事件 | Subscribe to window resize events
function subscribeResize(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function getViewportWidth(): number | undefined {
  return typeof window !== 'undefined' ? window.innerWidth : undefined;
}
function getServerViewportWidth(): undefined { return undefined; }

export function useViewportWidth(): number | undefined {
  return useSyncExternalStore(subscribeResize, getViewportWidth, getServerViewportWidth);
}
