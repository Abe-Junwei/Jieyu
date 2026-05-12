import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import { reportActionError } from '../utils/actionErrorReporter';
import { createMetricTags, recordDurationMetric } from '../observability/metrics';

export function setSegmentMutationActionError(
  setSaveState: (state: SaveState) => void,
  actionLabel: string,
  i18nKey: string,
  error: unknown,
): void {
  const { message, meta } = reportActionError({ actionLabel, error, i18nKey });
  setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) });
}

export function recordSegmentMutationLatency(
  action: string,
  status: 'success' | 'error',
  startedAtMs: number,
): void {
  try {
    recordDurationMetric(
      'business.transcription.segment_action_latency_ms',
      startedAtMs,
      createMetricTags('transcription', { action, status }),
    );
  } catch {
    // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
  }
}
