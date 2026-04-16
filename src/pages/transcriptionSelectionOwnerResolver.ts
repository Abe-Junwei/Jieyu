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
  utteranceId?: string | undefined;
};

const OWNER_RESOLUTION_EPS = 0.01;

export function resolveFallbackOwnerUtterance<T extends TimelineOwnerCandidate>(
  segment: TimelineSegmentOwnerTarget,
  utterances: ReadonlyArray<T>,
): T | undefined {
  const segmentCenter = (segment.startTime + segment.endTime) / 2;

  let bestContaining: { utterance: T; span: number; centerDistance: number } | undefined;
  let bestOverlap: { utterance: T; overlap: number; centerDistance: number } | undefined;

  for (const utterance of utterances) {
    if (segment.mediaId && utterance.mediaId !== segment.mediaId) continue;
    if (utterance.startTime > segment.endTime - OWNER_RESOLUTION_EPS || utterance.endTime < segment.startTime + OWNER_RESOLUTION_EPS) continue;

    const contains = utterance.startTime <= segment.startTime + OWNER_RESOLUTION_EPS
      && utterance.endTime >= segment.endTime - OWNER_RESOLUTION_EPS;
    const centerDistance = Math.abs(((utterance.startTime + utterance.endTime) / 2) - segmentCenter);

    if (contains) {
      const span = utterance.endTime - utterance.startTime;
      if (
        !bestContaining
        || span < bestContaining.span
        || (span === bestContaining.span && centerDistance < bestContaining.centerDistance)
      ) {
        bestContaining = { utterance, span, centerDistance };
      }
      continue;
    }

    const overlapStart = Math.max(segment.startTime, utterance.startTime);
    const overlapEnd = Math.min(segment.endTime, utterance.endTime);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (
      !bestOverlap
      || overlap > bestOverlap.overlap
      || (overlap === bestOverlap.overlap && centerDistance < bestOverlap.centerDistance)
    ) {
      bestOverlap = { utterance, overlap, centerDistance };
    }
  }

  return bestContaining?.utterance ?? bestOverlap?.utterance;
}

export function resolveSegmentOwnerUtterance<T extends TimelineOwnerCandidate>(
  segment: TimelineSegmentOwnerTarget,
  utterances: ReadonlyArray<T>,
): T | undefined {
  const explicitOwnerId = segment.utteranceId?.trim();
  if (explicitOwnerId) {
    const explicit = utterances.find((item) => item.id === explicitOwnerId);
    if (explicit) return explicit;
  }
  return resolveFallbackOwnerUtterance(segment, utterances);
}