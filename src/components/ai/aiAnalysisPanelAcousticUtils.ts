import { trackBrowserWorkerLifecycle } from '../../observability/trackBrowserWorkerLifecycle';
import { serializeAcousticPanelBatchDetailCsv, serializeAcousticPanelBatchDetailJson, serializeAcousticPanelBatchDetailJsonResearch, serializeAcousticPanelDetailCsv, serializeAcousticPanelDetailJson, serializeAcousticPanelDetailJsonResearch, serializeAcousticPitchTierText, type AcousticPanelBatchDetail, type AcousticPanelDetail } from '../../utils/acousticPanelDetail';
import { ACOUSTIC_ANALYSIS_PRESETS, type AcousticAnalysisPresetKey } from '../../utils/acousticAnalysisPresets';
import { type AcousticAnalysisConfig } from '../../utils/acousticOverlayTypes';

export function formatDb(value: number | null | undefined, digits = 1): string | null {
  return typeof value === 'number' ? `${value.toFixed(digits)} dB` : null;
}

export function formatHz(value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value)} Hz` : null;
}

export function formatRatio(value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : null;
}

export function formatZeroCrossing(value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : null;
}

export function formatScalar(value: number | null | undefined, digits = 3): string | null {
  return typeof value === 'number' ? value.toFixed(digits) : null;
}

export function formatCoefficients(values: number[] | null | undefined, count = 3): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.slice(0, count).map((value) => value.toFixed(2)).join(' / ');
}

export function buildNormalizedPath(
  points: Array<{ timeRatio: number; normalizedF0?: number | null; normalizedIntensity?: number | null }>,
  key: 'normalizedF0' | 'normalizedIntensity',
  width = 120,
  height = 42,
): string | null {
  const plotted = points.filter((point) => typeof point[key] === 'number');
  if (plotted.length === 0) return null;

  return plotted
    .map((point, index) => {
      const x = 2 + (point.timeRatio * (width - 4));
      const y = 2 + ((1 - (point[key] as number)) * (height - 4));
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function findNearestFrameByTime<T extends { timeSec: number }>(frames: T[], timeSec: number | undefined): T | null {
  if (timeSec === undefined || frames.length === 0) return null;
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = frames[mid]?.timeSec ?? Number.POSITIVE_INFINITY;
    if (midTime < timeSec) {
      low = mid + 1;
    } else if (midTime > timeSec) {
      high = mid - 1;
    } else {
      return frames[mid] ?? null;
    }
  }

  const right = low < frames.length ? (frames[low] ?? null) : null;
  const left = low > 0 ? (frames[low - 1] ?? null) : null;
  if (!left) return right;
  if (!right) return left;
  return Math.abs(left.timeSec - timeSec) <= Math.abs(right.timeSec - timeSec) ? left : right;
}

export type AcousticExportFormat = 'csv' | 'json' | 'json_research' | 'pitchtier';

type AcousticExportWorkerRequest = {
  requestId: string;
  type: 'serialize';
  scope: 'single' | 'batch';
  format: AcousticExportFormat;
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[];
};

type AcousticExportWorkerResponse = {
  requestId: string;
  ok: boolean;
  content?: string;
  error?: string;
};

const MAX_ACOUSTIC_EXPORT_FRAME_COUNT = 120_000;
const MAX_ACOUSTIC_EXPORT_ESTIMATED_BYTES = 48 * 1024 * 1024;
const ACOUSTIC_EXPORT_ESTIMATED_BYTES_PER_FRAME = 256;
const ACOUSTIC_EXPORT_ESTIMATED_BYTES_PER_TONE_BIN = 96;

type AcousticExportPayloadStats = {
  frameCount: number;
  toneBinCount: number;
  estimatedBytes: number;
};

export function measureAcousticExportPayloadStats(
  scope: 'single' | 'batch',
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[],
): AcousticExportPayloadStats {
  if (scope === 'single') {
    const detail = payload as AcousticPanelDetail;
    const frameCount = detail.frames.length;
    const toneBinCount = detail.toneBins.length;
    return {
      frameCount,
      toneBinCount,
      estimatedBytes: (frameCount * ACOUSTIC_EXPORT_ESTIMATED_BYTES_PER_FRAME)
        + (toneBinCount * ACOUSTIC_EXPORT_ESTIMATED_BYTES_PER_TONE_BIN),
    };
  }

  const items = payload as AcousticPanelBatchDetail[];
  const frameCount = items.reduce((sum, item) => sum + item.detail.frames.length, 0);
  const toneBinCount = items.reduce((sum, item) => sum + item.detail.toneBins.length, 0);
  return {
    frameCount,
    toneBinCount,
    estimatedBytes: (frameCount * ACOUSTIC_EXPORT_ESTIMATED_BYTES_PER_FRAME)
      + (toneBinCount * ACOUSTIC_EXPORT_ESTIMATED_BYTES_PER_TONE_BIN),
  };
}

export function resolveAcousticExportMimeType(format: AcousticExportFormat): string {
  if (format === 'csv') return 'text/csv;charset=utf-8';
  if (format === 'pitchtier') return 'text/plain;charset=utf-8';
  return 'application/json;charset=utf-8';
}

export function resolveAcousticExportFilename(stem: string, format: AcousticExportFormat): string {
  if (format === 'csv') return `${stem}.csv`;
  if (format === 'pitchtier') return `${stem}.PitchTier`;
  if (format === 'json_research') return `${stem}.research.json`;
  return `${stem}.json`;
}

export function serializeAcousticExportSync(
  scope: 'single' | 'batch',
  format: AcousticExportFormat,
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[],
): string | null {
  if (scope === 'batch') {
    const items = payload as AcousticPanelBatchDetail[];
    if (format === 'pitchtier') return null;
    if (format === 'csv') return serializeAcousticPanelBatchDetailCsv(items);
    if (format === 'json_research') return serializeAcousticPanelBatchDetailJsonResearch(items);
    return serializeAcousticPanelBatchDetailJson(items);
  }

  const detail = payload as AcousticPanelDetail;
  if (format === 'csv') return serializeAcousticPanelDetailCsv(detail);
  if (format === 'pitchtier') return serializeAcousticPitchTierText(detail);
  if (format === 'json_research') return serializeAcousticPanelDetailJsonResearch(detail);
  return serializeAcousticPanelDetailJson(detail);
}

export async function serializeAcousticExportWithWorker(
  scope: 'single' | 'batch',
  format: AcousticExportFormat,
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[],
): Promise<string | null> {
  if (scope === 'batch' && format === 'pitchtier') {
    return null;
  }

  if (typeof Worker === 'undefined') {
    return serializeAcousticExportSync(scope, format, payload);
  }

  return new Promise<string | null>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/acousticExport.worker.ts', import.meta.url), { type: 'module' });
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const releaseTrack = trackBrowserWorkerLifecycle(worker, {
      id: `acousticExport-${requestId}`,
      source: 'serializeAcousticExportWithWorker',
    });
    let settled = false;
    let timeoutId: number | undefined;
    const rejectAndCleanup = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      try {
        worker.terminate();
      } finally {
        releaseTrack();
      }
      reject(error);
    };
    const resolveAndCleanup = (content: string) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      try {
        worker.terminate();
      } finally {
        releaseTrack();
      }
      resolve(content);
    };
    timeoutId = window.setTimeout(() => {
      rejectAndCleanup(new Error('Acoustic export serialization timed out'));
    }, 30_000);

    worker.onmessage = (event: MessageEvent<AcousticExportWorkerResponse>) => {
      const message = event.data;
      if (!message || message.requestId !== requestId) return;
      if (!message.ok) {
        rejectAndCleanup(new Error(message.error ?? 'Acoustic export serialization failed'));
        return;
      }
      resolveAndCleanup(message.content ?? '');
    };

    worker.onerror = () => {
      rejectAndCleanup(new Error('Acoustic export worker failed'));
    };

    const request: AcousticExportWorkerRequest = {
      requestId,
      type: 'serialize',
      scope,
      format,
      payload,
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      rejectAndCleanup(error instanceof Error ? error : new Error('Acoustic export worker failed'));
    }
  });
}

export function formatDelta(
  current: number | null | undefined,
  baseline: number | null | undefined,
  unit: string,
  digits: number,
): string | null {
  if (typeof current !== 'number' || typeof baseline !== 'number') return null;
  return `${(current - baseline).toFixed(digits)} ${unit}`;
}

export const ACOUSTIC_NUMERIC_BOUNDS: Record<
keyof Pick<AcousticAnalysisConfig, 'pitchFloorHz' | 'pitchCeilingHz' | 'analysisWindowSec' | 'frameStepSec' | 'silenceRmsThreshold'>,
{ min: number; max: number }
> = {
  pitchFloorHz: { min: 30, max: 500 },
  pitchCeilingHz: { min: 80, max: 1200 },
  analysisWindowSec: { min: 0.01, max: 0.12 },
  frameStepSec: { min: 0.002, max: 0.04 },
  silenceRmsThreshold: { min: 0.001, max: 0.2 },
};

export function resolvePresetKeyFromOverride(
  override: Partial<AcousticAnalysisConfig> | null | undefined,
): AcousticAnalysisPresetKey {
  if (!override || Object.keys(override).length === 0) return 'default';

  const preset = ACOUSTIC_ANALYSIS_PRESETS.find((item) => {
    if (item.key === 'default' || item.key === 'custom') return false;
    const presetKeys = Object.keys(item.config) as Array<keyof AcousticAnalysisConfig>;
    const overrideKeys = Object.keys(override) as Array<keyof AcousticAnalysisConfig>;
    if (presetKeys.length !== overrideKeys.length) return false;
    return presetKeys.every((configKey) => override[configKey] === item.config[configKey]);
  });

  return preset?.key ?? 'custom';
}

export function downloadTextPayload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export const PROVIDER_PREFERENCE_AUTO = '__auto__';
export type AcousticConfigOverride = Partial<AcousticAnalysisConfig> | null;

export function pruneAcousticConfigOverride(override: AcousticConfigOverride): AcousticConfigOverride {
  if (!override) return null;
  const entries = Object.entries(override)
    .filter(([, value]) => value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as Partial<AcousticAnalysisConfig>;
}

export function areAcousticConfigOverridesEqual(
  left: AcousticConfigOverride,
  right: AcousticConfigOverride,
): boolean {
  const normalizedLeft = pruneAcousticConfigOverride(left);
  const normalizedRight = pruneAcousticConfigOverride(right);
  if (normalizedLeft === null || normalizedRight === null) {
    return normalizedLeft === normalizedRight;
  }

  const leftEntries = Object.entries(normalizedLeft).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(normalizedRight).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value], index) => {
    const [rightKey, rightValue] = rightEntries[index] ?? [];
    return key === rightKey && value === rightValue;
  });
}

export function shouldRejectAcousticExportPayload(
  stats: AcousticExportPayloadStats,
): { frameCount: number; toneBinCount: number; estimatedBytes: number } | null {
  if (stats.frameCount > MAX_ACOUSTIC_EXPORT_FRAME_COUNT || stats.estimatedBytes > MAX_ACOUSTIC_EXPORT_ESTIMATED_BYTES) {
    return {
      frameCount: stats.frameCount,
      toneBinCount: stats.toneBinCount,
      estimatedBytes: stats.estimatedBytes,
    };
  }
  return null;
}