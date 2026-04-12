import { createMetricTags, recordMetric } from './metrics';

let lcpObserverInitialized = false;

export function initLcpMetricObserver(): void {
  if (lcpObserverInitialized) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof PerformanceObserver === 'undefined') return;
  if (!Array.isArray(PerformanceObserver.supportedEntryTypes)) return;
  if (!PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) return;

  let latestLcp = 0;
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    observer.disconnect();
    if (latestLcp <= 0) return;
    try {
      recordMetric({
        id: 'ux.web_vitals.lcp_ms',
        value: Math.round(latestLcp),
        tags: createMetricTags('shell'),
      });
    } catch {
      // noop
    }
  };

  const observer = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    const lastEntry = entries[entries.length - 1];
    if (!lastEntry) return;
    latestLcp = Math.max(latestLcp, lastEntry.startTime);
  });

  try {
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    return;
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      finalize();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };

  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', finalize, { once: true });

  lcpObserverInitialized = true;
}
