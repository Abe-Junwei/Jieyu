export type OverlapCycleTelemetryState = {
  cycleCount: number;
  stepSum: number;
  avgStep: number;
  candidateTotalSum: number;
  avgCandidateTotal: number;
  lastUtteranceId: string | null;
  lastIndex: number | null;
  lastTotal: number | null;
};

export const INITIAL_OVERLAP_CYCLE_TELEMETRY: OverlapCycleTelemetryState = {
  cycleCount: 0,
  stepSum: 0,
  avgStep: 0,
  candidateTotalSum: 0,
  avgCandidateTotal: 0,
  lastUtteranceId: null,
  lastIndex: null,
  lastTotal: null,
};

export function updateOverlapCycleTelemetry(
  prev: OverlapCycleTelemetryState,
  payload: { utteranceId: string; index: number; total: number },
): OverlapCycleTelemetryState {
  const normalizedTotal = Number.isFinite(payload.total) && payload.total > 0 ? Math.floor(payload.total) : 1;
  const normalizedIndex = Number.isFinite(payload.index)
    ? Math.max(1, Math.min(normalizedTotal, Math.floor(payload.index)))
    : 1;

  const isSameSeries =
    prev.lastUtteranceId === payload.utteranceId
    && prev.lastTotal === normalizedTotal
    && prev.lastIndex != null;

  const step = isSameSeries
    ? ((normalizedIndex - prev.lastIndex! + normalizedTotal) % normalizedTotal) || normalizedTotal
    : 1;

  const cycleCount = prev.cycleCount + 1;
  const stepSum = prev.stepSum + step;
  const candidateTotalSum = prev.candidateTotalSum + normalizedTotal;

  return {
    cycleCount,
    stepSum,
    avgStep: Number((stepSum / cycleCount).toFixed(3)),
    candidateTotalSum,
    avgCandidateTotal: Number((candidateTotalSum / cycleCount).toFixed(3)),
    lastUtteranceId: payload.utteranceId,
    lastIndex: normalizedIndex,
    lastTotal: normalizedTotal,
  };
}
