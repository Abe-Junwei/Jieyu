type TimeBoundUtteranceLike = {
  id: string;
  startTime: number;
  endTime: number;
  ai_metadata?: {
    confidence?: number;
  };
};

export interface WaveformLowConfidenceBand {
  id: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface WaveformOverlapBand {
  id: string;
  startTime: number;
  endTime: number;
  concurrentCount: number;
}

export interface WaveformGapBand {
  id: string;
  startTime: number;
  endTime: number;
  gapSeconds: number;
  /** 间隙内是否包含 VAD 检测到的语音（即未转写语音）| Whether VAD detected speech within this gap (untranscribed speech) */
  containsSpeech?: boolean;
}

export interface WaveformAnalysisOverlaySummary {
  lowConfidenceBands: WaveformLowConfidenceBand[];
  overlapBands: WaveformOverlapBand[];
  gapBands: WaveformGapBand[];
}

/** 风险热区 | Risk hot-zone cluster */
export interface RiskHotZone {
  startTime: number;
  endTime: number;
  /** 热区内各类信号总数 | Total signal count within this zone */
  signalCount: number;
  /** 信号类型分布 | Signal type breakdown */
  breakdown: {
    lowConfidence: number;
    overlap: number;
    gap: number;
  };
  /** 热区严重度 0-1（越高越需关注）| Severity score 0-1 */
  severity: number;
}

export interface WaveformAnalysisPromptSummary {
  lowConfidenceCount: number;
  overlapCount: number;
  gapCount: number;
  maxGapSeconds: number;
  /** 风险热区（按严重度降序）| Risk hot-zones sorted by severity */
  hotZones?: RiskHotZone[];
  /** 时间分布四分位 | Temporal quartile distribution of risk signals */
  temporalDistribution?: {
    /** 总时长（秒）| Total audio duration in seconds */
    durationSec: number;
    /** 各四分位信号占比 [Q1, Q2, Q3, Q4] | Signal density per quartile */
    quartileRatios: [number, number, number, number];
  };
  selectionLowConfidenceCount?: number;
  selectionOverlapCount?: number;
  selectionGapCount?: number;
  activeSignals?: string[];
  /** 间隙中包含 VAD 语音的数量（即遗漏转写段）| Gaps containing VAD-detected speech (untranscribed) */
  untranscribedSpeechGapCount?: number;
}

/** Loop-based max — safe for large arrays (no call-stack limit). */
function maxOfNumbers(values: number[]): number {
  let r = values[0]!;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! > r) r = values[i]!;
  }
  return r;
}

/** Loop-based min — safe for large arrays (no call-stack limit). */
function minOfNumbers(values: number[]): number {
  let r = values[0]!;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! < r) r = values[i]!;
  }
  return r;
}

function toSortedUtterances(input: TimeBoundUtteranceLike[]): TimeBoundUtteranceLike[] {
  return input
    .filter((item) => Number.isFinite(item.startTime) && Number.isFinite(item.endTime) && item.endTime > item.startTime)
    .sort((left, right) => {
      if (left.startTime !== right.startTime) return left.startTime - right.startTime;
      if (left.endTime !== right.endTime) return left.endTime - right.endTime;
      return left.id.localeCompare(right.id);
    });
}

/** VAD 段最小重叠（秒） | Minimum overlap to count as speech within a gap */
const VAD_OVERLAP_TOLERANCE_SEC = 0.05;

export interface VadSegmentLike {
  start: number;
  end: number;
}

export function buildWaveformAnalysisOverlaySummary(
  utterances: TimeBoundUtteranceLike[],
  options?: {
    lowConfidenceThreshold?: number;
    gapThresholdSeconds?: number;
    /** VAD 语音段，用于标记间隙内是否包含未转写语音 | VAD speech segments for detecting untranscribed speech in gaps */
    vadSegments?: VadSegmentLike[];
  },
): WaveformAnalysisOverlaySummary {
  const lowConfidenceThreshold = options?.lowConfidenceThreshold ?? 0.75;
  const gapThresholdSeconds = options?.gapThresholdSeconds ?? 0.8;
  const sorted = toSortedUtterances(utterances);

  const lowConfidenceBands: WaveformLowConfidenceBand[] = sorted
    .filter((utterance) => typeof utterance.ai_metadata?.confidence === 'number' && utterance.ai_metadata.confidence < lowConfidenceThreshold)
    .map((utterance) => ({
      id: utterance.id,
      startTime: utterance.startTime,
      endTime: utterance.endTime,
      confidence: utterance.ai_metadata!.confidence as number,
    }));

  const vadSegs = options?.vadSegments;
  const gapBands: WaveformGapBand[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    const gapSeconds = current.startTime - previous.endTime;
    if (gapSeconds >= gapThresholdSeconds) {
      const gapStart = previous.endTime;
      const gapEnd = current.startTime;
      const containsSpeech = vadSegs
        ? vadSegs.some((seg) => {
          const overlapStart = Math.max(seg.start, gapStart);
          const overlapEnd = Math.min(seg.end, gapEnd);
          return overlapEnd - overlapStart >= VAD_OVERLAP_TOLERANCE_SEC;
        })
        : undefined;
      gapBands.push({
        id: `gap:${previous.id}:${current.id}`,
        startTime: gapStart,
        endTime: gapEnd,
        gapSeconds,
        ...(containsSpeech !== undefined ? { containsSpeech } : {}),
      });
    }
  }

  const boundaries = Array.from(new Set(sorted.flatMap((utterance) => [utterance.startTime, utterance.endTime]))).sort((a, b) => a - b);
  const overlapBands: WaveformOverlapBand[] = [];

  for (let index = 1; index < boundaries.length; index += 1) {
    const startTime = boundaries[index - 1]!;
    const endTime = boundaries[index]!;
    if (endTime <= startTime) continue;
    const concurrentCount = sorted.filter((utterance) => utterance.startTime < endTime && utterance.endTime > startTime).length;
    if (concurrentCount < 2) continue;

    const previous = overlapBands[overlapBands.length - 1];
    if (previous && Math.abs(previous.endTime - startTime) < 0.0005 && previous.concurrentCount === concurrentCount) {
      previous.endTime = endTime;
      continue;
    }

    overlapBands.push({
      id: `overlap:${overlapBands.length + 1}`,
      startTime,
      endTime,
      concurrentCount,
    });
  }

  return {
    lowConfidenceBands,
    overlapBands,
    gapBands,
  };
}

function intersectsWindow(startTime: number, endTime: number, windowStart: number, windowEnd: number): boolean {
  return startTime < windowEnd && endTime > windowStart;
}

/** 所有信号统一时间表示 | Unified timed signal for clustering */
interface TimedSignal {
  startTime: number;
  endTime: number;
  type: 'lowConfidence' | 'overlap' | 'gap';
  /** 信号权重 0-1 | Signal weight for severity scoring */
  weight: number;
}

/**
 * 按时间邻近性聚合信号为风险热区 | Cluster nearby signals into risk hot-zones
 * 使用贪心滑窗：间距 ≤ clusterGapSec 的信号归为同一热区
 * Greedy sweep: signals within clusterGapSec of each other merge into one zone
 */
export function buildRiskHotZones(
  overlay: WaveformAnalysisOverlaySummary,
  options?: { clusterGapSec?: number; maxZones?: number },
): RiskHotZone[] {
  const clusterGap = options?.clusterGapSec ?? 3;
  const maxZones = options?.maxZones ?? 5;

  const signals: TimedSignal[] = [
    ...overlay.lowConfidenceBands.map((band) => ({
      startTime: band.startTime,
      endTime: band.endTime,
      type: 'lowConfidence' as const,
      weight: 1 - band.confidence,
    })),
    ...overlay.overlapBands.map((band) => ({
      startTime: band.startTime,
      endTime: band.endTime,
      type: 'overlap' as const,
      weight: Math.min(1, (band.concurrentCount - 1) * 0.4),
    })),
    ...overlay.gapBands.map((band) => ({
      startTime: band.startTime,
      endTime: band.endTime,
      type: 'gap' as const,
      weight: Math.min(1, band.gapSeconds / 5),
    })),
  ].sort((a, b) => a.startTime - b.startTime);

  if (signals.length === 0) return [];

  const clusters: TimedSignal[][] = [[signals[0]!]];
  for (let i = 1; i < signals.length; i++) {
    const signal = signals[i]!;
    const lastCluster = clusters[clusters.length - 1]!;
    const lastEnd = maxOfNumbers(lastCluster.map((s) => s.endTime));
    if (signal.startTime - lastEnd <= clusterGap) {
      lastCluster.push(signal);
    } else {
      clusters.push([signal]);
    }
  }

  const zones: RiskHotZone[] = clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => {
      const start = minOfNumbers(cluster.map((s) => s.startTime));
      const end = maxOfNumbers(cluster.map((s) => s.endTime));
      const breakdown = {
        lowConfidence: cluster.filter((s) => s.type === 'lowConfidence').length,
        overlap: cluster.filter((s) => s.type === 'overlap').length,
        gap: cluster.filter((s) => s.type === 'gap').length,
      };
      const totalWeight = cluster.reduce((sum, s) => sum + s.weight, 0);
      const severity = Math.min(1, totalWeight / cluster.length * (1 + Math.log2(cluster.length)) * 0.5);
      return { startTime: start, endTime: end, signalCount: cluster.length, breakdown, severity };
    })
    .sort((a, b) => b.severity - a.severity)
    .slice(0, maxZones);

  return zones;
}

/**
 * 计算信号时间四分位分布 | Compute temporal quartile distribution of risk signals
 */
function buildTemporalDistribution(
  overlay: WaveformAnalysisOverlaySummary,
  durationSec: number,
): WaveformAnalysisPromptSummary['temporalDistribution'] {
  if (durationSec <= 0) return undefined;
  const allMidpoints = [
    ...overlay.lowConfidenceBands.map((b) => (b.startTime + b.endTime) / 2),
    ...overlay.overlapBands.map((b) => (b.startTime + b.endTime) / 2),
    ...overlay.gapBands.map((b) => (b.startTime + b.endTime) / 2),
  ];
  const total = allMidpoints.length;
  if (total === 0) return undefined;
  const q = durationSec / 4;
  const quartileCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const mid of allMidpoints) {
    const idx = Math.min(3, Math.floor(mid / q));
    const currentCount = quartileCounts[idx] ?? 0;
    quartileCounts[idx] = currentCount + 1;
  }
  return {
    durationSec,
    quartileRatios: quartileCounts.map((c) => Math.round((c / total) * 100) / 100) as [number, number, number, number],
  };
}

export function buildWaveformAnalysisPromptSummary(
  utterances: TimeBoundUtteranceLike[],
  options?: {
    lowConfidenceThreshold?: number;
    gapThresholdSeconds?: number;
    selectionStartTime?: number;
    selectionEndTime?: number;
    audioTimeSec?: number;
    /** 音频总时长（秒），用于时间分布和热区 | Total audio duration for distribution */
    audioDurationSec?: number;
    /** VAD 语音段（来自缓存）| VAD speech segments (from cache) */
    vadSegments?: VadSegmentLike[];
  },
): WaveformAnalysisPromptSummary {
  const summary = buildWaveformAnalysisOverlaySummary(utterances, {
    ...(options?.lowConfidenceThreshold !== undefined ? { lowConfidenceThreshold: options.lowConfidenceThreshold } : {}),
    ...(options?.gapThresholdSeconds !== undefined ? { gapThresholdSeconds: options.gapThresholdSeconds } : {}),
    ...(options?.vadSegments !== undefined ? { vadSegments: options.vadSegments } : {}),
  });
  const maxGapSeconds = summary.gapBands.reduce((maxSeconds, band) => Math.max(maxSeconds, band.gapSeconds), 0);

  const hasSelectionWindow = typeof options?.selectionStartTime === 'number'
    && typeof options?.selectionEndTime === 'number'
    && options.selectionEndTime > options.selectionStartTime;

  const selectionLowConfidenceCount = hasSelectionWindow
    ? summary.lowConfidenceBands.filter((band) => intersectsWindow(
      band.startTime,
      band.endTime,
      options.selectionStartTime as number,
      options.selectionEndTime as number,
    )).length
    : undefined;

  const selectionOverlapCount = hasSelectionWindow
    ? summary.overlapBands.filter((band) => intersectsWindow(
      band.startTime,
      band.endTime,
      options.selectionStartTime as number,
      options.selectionEndTime as number,
      )).length
    : undefined;

  const selectionGapCount = hasSelectionWindow
    ? summary.gapBands.filter((band) => intersectsWindow(
      band.startTime,
      band.endTime,
      options.selectionStartTime as number,
      options.selectionEndTime as number,
    )).length
    : undefined;

  const activeSignals = typeof options?.audioTimeSec === 'number'
    ? [
      ...summary.lowConfidenceBands
        .filter((band) => band.startTime <= options.audioTimeSec! && band.endTime >= options.audioTimeSec!)
        .slice(0, 2)
        .map((band) => `low_confidence:${Math.round(band.confidence * 100)}%@${band.startTime.toFixed(1)}-${band.endTime.toFixed(1)}`),
      ...summary.overlapBands
        .filter((band) => band.startTime <= options.audioTimeSec! && band.endTime >= options.audioTimeSec!)
        .slice(0, 2)
        .map((band) => `overlap:x${band.concurrentCount}@${band.startTime.toFixed(1)}-${band.endTime.toFixed(1)}`),
      ...summary.gapBands
        .filter((band) => band.startTime <= options.audioTimeSec! && band.endTime >= options.audioTimeSec!)
        .slice(0, 2)
        .map((band) => `gap:${band.gapSeconds.toFixed(1)}s@${band.startTime.toFixed(1)}-${band.endTime.toFixed(1)}`),
    ]
    : undefined;

  // 风险热区聚类 | Risk hot-zone clustering
  const hotZones = buildRiskHotZones(summary);

  // 时间四分位分布 | Temporal quartile distribution
  const durationSec = options?.audioDurationSec
    ?? (utterances.length > 0
      ? maxOfNumbers(utterances.map((u) => u.endTime).filter(Number.isFinite))
      : 0);
  const temporalDistribution = buildTemporalDistribution(summary, durationSec);

  return {
    lowConfidenceCount: summary.lowConfidenceBands.length,
    overlapCount: summary.overlapBands.length,
    gapCount: summary.gapBands.length,
    maxGapSeconds,
    ...(hotZones.length > 0 ? { hotZones } : {}),
    ...(temporalDistribution ? { temporalDistribution } : {}),
    ...(selectionLowConfidenceCount !== undefined ? { selectionLowConfidenceCount } : {}),
    ...(selectionOverlapCount !== undefined ? { selectionOverlapCount } : {}),
    ...(selectionGapCount !== undefined ? { selectionGapCount } : {}),
    ...(activeSignals && activeSignals.length > 0 ? { activeSignals } : {}),
    ...(summary.gapBands.some((g) => g.containsSpeech !== undefined)
      ? { untranscribedSpeechGapCount: summary.gapBands.filter((g) => g.containsSpeech).length }
      : {}),
  };
}