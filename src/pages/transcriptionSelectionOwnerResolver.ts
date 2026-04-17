import { createMetricTags, recordMetric } from '../observability/metrics';

type TimelineOwnerCandidate = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
};

type TimelineSegmentOwnerTarget = {
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
  unitId?: string | undefined;
};

const OWNER_RESOLUTION_EPS = 0.01;

export function resolveFallbackOwnerUnit<T extends TimelineOwnerCandidate>(
  segment: TimelineSegmentOwnerTarget,
  units: ReadonlyArray<T>,
): T | undefined {
  const segmentCenter = (segment.startTime + segment.endTime) / 2;
  let fallbackCandidateCount = 0;

  let bestContaining: { unit: T; span: number; centerDistance: number } | undefined;
  let bestOverlap: { unit: T; overlap: number; centerDistance: number } | undefined;

  for (const unit of units) {
    if (segment.mediaId && unit.mediaId !== segment.mediaId) continue;
    if (unit.startTime > segment.endTime - OWNER_RESOLUTION_EPS || unit.endTime < segment.startTime + OWNER_RESOLUTION_EPS) continue;
    fallbackCandidateCount += 1;

    const contains = unit.startTime <= segment.startTime + OWNER_RESOLUTION_EPS
      && unit.endTime >= segment.endTime - OWNER_RESOLUTION_EPS;
    const centerDistance = Math.abs(((unit.startTime + unit.endTime) / 2) - segmentCenter);

    if (contains) {
      const span = unit.endTime - unit.startTime;
      if (
        !bestContaining
        || span < bestContaining.span
        || (span === bestContaining.span && centerDistance < bestContaining.centerDistance)
      ) {
        bestContaining = { unit, span, centerDistance };
      }
      continue;
    }

    const overlapStart = Math.max(segment.startTime, unit.startTime);
    const overlapEnd = Math.min(segment.endTime, unit.endTime);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (
      !bestOverlap
      || overlap > bestOverlap.overlap
      || (overlap === bestOverlap.overlap && centerDistance < bestOverlap.centerDistance)
    ) {
      bestOverlap = { unit, overlap, centerDistance };
    }
  }

  const resolved = bestContaining?.unit ?? bestOverlap?.unit;
  try {
    recordMetric({
      id: 'parent_fallback_attempt_total',
      value: 1,
      tags: createMetricTags('transcriptionSelectionOwnerResolver', {
        candidateCount: fallbackCandidateCount,
        resolved: Boolean(resolved),
      }),
    });
    // 仅多宿主重叠计为歧义；0 候选为「无重叠」、1 候选为唯一，均不计入 ambiguous | Only >1 overlapping hosts counts as ambiguous
    if (fallbackCandidateCount > 1) {
      recordMetric({
        id: 'parent_fallback_ambiguous_total',
        value: 1,
        tags: createMetricTags('transcriptionSelectionOwnerResolver', {
          candidateCount: fallbackCandidateCount,
        }),
      });
    }
  } catch {
    // 指标上报失败不影响回退判定 | Ignore metrics failures to keep owner resolution deterministic
  }

  return resolved;
}

export function resolveSegmentOwnerUnit<T extends TimelineOwnerCandidate>(
  segment: TimelineSegmentOwnerTarget,
  units: ReadonlyArray<T>,
): T | undefined {
  const explicitOwnerId = segment.unitId?.trim();
  if (explicitOwnerId) {
    const explicit = units.find((item) => item.id === explicitOwnerId);
    if (explicit) return explicit;
  }
  return resolveFallbackOwnerUnit(segment, units);
}