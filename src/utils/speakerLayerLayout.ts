import type { UtteranceDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';

export type SpeakerLayerPlacement = {
  utteranceId: string;
  subTrackIndex: number;
  overlapGroupId: string;
};

export type SpeakerLayerLayoutResult = {
  placements: Map<string, SpeakerLayerPlacement>;
  subTrackCount: number;
  maxConcurrentSpeakerCount: number;
  overlapGroups: SpeakerOverlapGroupSummary[];
  overlapCycleItemsByGroupId: Map<string, Map<string, Array<{ id: string; startTime: number }>>>;
  lockConflictCount: number;
  lockConflictSpeakerIds: string[];
};

export type SpeakerOverlapGroupSummary = {
  id: string;
  startTime: number;
  endTime: number;
  centerTime: number;
  subTrackCount: number;
  speakerCount: number;
};

type OverlapGroup = {
  id: string;
  items: UtteranceDocType[];
};

export type SpeakerLaneLockMapInput = ReadonlyMap<string, number> | Record<string, number>;
export type SpeakerSortKeyMapInput = ReadonlyMap<string, number> | Record<string, number>;

export type SpeakerLayerLayoutOptions = {
  trackMode?: TranscriptionTrackDisplayMode;
  laneLockMap?: SpeakerLaneLockMapInput;
  speakerSortKeyById?: SpeakerSortKeyMapInput;
};

function normalizeSpeakerId(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'unknown-speaker';
}

function toReadonlyMap(input?: SpeakerLaneLockMapInput | SpeakerSortKeyMapInput): ReadonlyMap<string, number> {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  return new Map(Object.entries(input));
}

function compareSpeakerIds(
  left: string,
  right: string,
  laneMap: ReadonlyMap<string, number>,
  speakerSortKeyById: ReadonlyMap<string, number>,
): number {
  const leftLane = laneMap.get(left);
  const rightLane = laneMap.get(right);
  if (typeof leftLane === 'number' && typeof rightLane === 'number' && leftLane !== rightLane) {
    return leftLane - rightLane;
  }
  if (typeof leftLane === 'number') return -1;
  if (typeof rightLane === 'number') return 1;

  const leftSort = speakerSortKeyById.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightSort = speakerSortKeyById.get(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftSort !== rightSort) return leftSort - rightSort;
  return left.localeCompare(right);
}

export function buildStableSpeakerLaneMap(
  speakerIds: Iterable<string>,
  laneLockMapInput?: SpeakerLaneLockMapInput,
  speakerSortKeyInput?: SpeakerSortKeyMapInput,
): Record<string, number> {
  const laneLockMap = toReadonlyMap(laneLockMapInput);
  const speakerSortKeyById = toReadonlyMap(speakerSortKeyInput);
  const normalizedSpeakerIds = Array.from(new Set(
    Array.from(speakerIds)
      .map((speakerId) => normalizeSpeakerId(speakerId))
      .filter((speakerId) => speakerId !== 'unknown-speaker'),
  )).sort((left, right) => compareSpeakerIds(left, right, laneLockMap, speakerSortKeyById));

  const preliminary = new Map<string, number>();
  const occupied = new Set<number>();
  for (const speakerId of normalizedSpeakerIds) {
    const preferredLane = laneLockMap.get(speakerId);
    if (typeof preferredLane !== 'number' || preferredLane < 0 || occupied.has(preferredLane)) continue;
    preliminary.set(speakerId, preferredLane);
    occupied.add(preferredLane);
  }

  let nextLane = occupied.size > 0 ? Math.max(...occupied) + 1 : 0;
  for (const speakerId of normalizedSpeakerIds) {
    if (preliminary.has(speakerId)) continue;
    while (occupied.has(nextLane)) nextLane += 1;
    preliminary.set(speakerId, nextLane);
    occupied.add(nextLane);
  }

  const compacted = Array.from(preliminary.entries())
    .sort((left, right) => left[1] - right[1] || compareSpeakerIds(left[0], right[0], laneLockMap, speakerSortKeyById))
    .map(([speakerId], index) => [speakerId, index] as const);

  return Object.fromEntries(compacted);
}

function buildOverlapGroups(utterances: UtteranceDocType[]): OverlapGroup[] {
  if (utterances.length === 0) return [];

  const sorted = [...utterances].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.endTime !== b.endTime) return a.endTime - b.endTime;
    return a.id.localeCompare(b.id);
  });

  const groups: OverlapGroup[] = [];
  let current: UtteranceDocType[] = [];
  let currentMaxEnd = -Infinity;
  let groupIndex = 0;

  for (const utt of sorted) {
    // 边界接触(start===currentMaxEnd)不算重叠，所以仅在 start < currentMaxEnd 时并入当前组 | Touching edges (start===currentMaxEnd) are NOT overlap; merge only when start < currentMaxEnd.
    if (current.length === 0 || utt.startTime < currentMaxEnd) {
      current.push(utt);
      currentMaxEnd = Math.max(currentMaxEnd, utt.endTime);
      continue;
    }

    groups.push({ id: `spk-group-${groupIndex++}`, items: current });
    current = [utt];
    currentMaxEnd = utt.endTime;
  }

  if (current.length > 0) {
    groups.push({ id: `spk-group-${groupIndex++}`, items: current });
  }

  return groups;
}

function buildOverlapCycleItemsByUtteranceIdFromSorted(
  sortedUtterances: UtteranceDocType[],
): Map<string, Array<{ id: string; startTime: number }>> {
  const idsByUtteranceId = new Map<string, Set<string>>();
  const active: UtteranceDocType[] = [];

  for (const current of sortedUtterances) {
    while (active.length > 0 && active[0] && active[0].endTime <= current.startTime) {
      active.shift();
    }

    const currentIds = idsByUtteranceId.get(current.id) ?? new Set<string>();
    currentIds.add(current.id);
    idsByUtteranceId.set(current.id, currentIds);

    for (const candidate of active) {
      if (candidate.endTime <= current.startTime) continue;

      const candidateIds = idsByUtteranceId.get(candidate.id) ?? new Set<string>();
      candidateIds.add(candidate.id);
      candidateIds.add(current.id);
      idsByUtteranceId.set(candidate.id, candidateIds);

      currentIds.add(candidate.id);
    }

    active.push(current);
    active.sort((a, b) => a.endTime - b.endTime);
  }

  const byId = new Map(sortedUtterances.map((item) => [item.id, item]));
  const result = new Map<string, Array<{ id: string; startTime: number }>>();

  for (const base of sortedUtterances) {
    const ids = idsByUtteranceId.get(base.id) ?? new Set<string>([base.id]);
    const overlaps = Array.from(ids)
      .map((id) => byId.get(id))
      .filter((item): item is UtteranceDocType => Boolean(item))
      .sort((a, b) => {
        if (a.startTime !== b.startTime) return a.startTime - b.startTime;
        if (a.endTime !== b.endTime) return a.endTime - b.endTime;
        return a.id.localeCompare(b.id);
      })
      .map((item) => ({ id: item.id, startTime: item.startTime }));
    result.set(base.id, overlaps);
  }

  return result;
}

function assignSubTracksForGroup(
  group: OverlapGroup,
  laneLockMap: ReadonlyMap<string, number>,
  speakerSortKeyById: ReadonlyMap<string, number>,
): {
  placements: Array<{ utteranceId: string; subTrackIndex: number; overlapGroupId: string }>;
  subTrackCount: number;
  lockConflictSpeakerIds: Set<string>;
} {
  const getSpeakerSortKey = (speakerId: string): number => {
    const value = speakerSortKeyById.get(speakerId);
    return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER;
  };

  const sorted = [...group.items].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    const speakerCmp = getSpeakerSortKey(normalizeSpeakerId(a.speakerId)) - getSpeakerSortKey(normalizeSpeakerId(b.speakerId));
    if (speakerCmp !== 0) return speakerCmp;
    if (a.endTime !== b.endTime) return a.endTime - b.endTime;
    return a.id.localeCompare(b.id);
  });

  const trackEndTimes: number[] = [];
  const trackSpeakerIds: string[] = [];
  const speakerPreferredTrack = new Map<string, number>();
  const lockConflictSpeakerIds = new Set<string>();
  const placements: Array<{ utteranceId: string; subTrackIndex: number; overlapGroupId: string }> = [];

  const ensureTrackIndex = (trackIndex: number) => {
    while (trackEndTimes.length <= trackIndex) {
      trackEndTimes.push(-Infinity);
      trackSpeakerIds.push('');
    }
  };

  for (const utt of sorted) {
    const speakerId = normalizeSpeakerId(utt.speakerId);
    const reusableTracks: number[] = [];
    for (let i = 0; i < trackEndTimes.length; i += 1) {
      const endTime = trackEndTimes[i];
      if (endTime !== undefined && endTime <= utt.startTime) reusableTracks.push(i);
    }

    let targetTrack: number | undefined;
    const lockedTrack = laneLockMap.get(speakerId);
    if (typeof lockedTrack === 'number' && Number.isInteger(lockedTrack) && lockedTrack >= 0) {
      ensureTrackIndex(lockedTrack);
      if ((trackEndTimes[lockedTrack] ?? -Infinity) <= utt.startTime) {
        targetTrack = lockedTrack;
      } else {
        lockConflictSpeakerIds.add(speakerId);
      }
    }

    if (targetTrack === undefined) {
      const preferredTrack = speakerPreferredTrack.get(speakerId);
      if (preferredTrack !== undefined && reusableTracks.includes(preferredTrack)) {
        targetTrack = preferredTrack;
      }
    }

    if (targetTrack === undefined) {
      targetTrack = reusableTracks.find((idx) => trackSpeakerIds[idx] === speakerId);
    }
    if (targetTrack === undefined) {
      targetTrack = reusableTracks[0];
    }
    if (targetTrack === undefined) {
      targetTrack = trackEndTimes.length;
      trackEndTimes.push(-Infinity);
      trackSpeakerIds.push(speakerId);
    }

    trackEndTimes[targetTrack] = utt.endTime;
    trackSpeakerIds[targetTrack] = speakerId;
    speakerPreferredTrack.set(speakerId, targetTrack);

    placements.push({
      utteranceId: utt.id,
      subTrackIndex: targetTrack,
      overlapGroupId: group.id,
    });
  }

  return {
    placements,
    subTrackCount: Math.max(1, trackEndTimes.length),
    lockConflictSpeakerIds,
  };
}

function buildMaxConcurrentSpeakerCount(utterances: UtteranceDocType[]): number {
  const events = utterances.flatMap((utt) => {
    const speakerId = normalizeSpeakerId(utt.speakerId);
    return [
      { time: utt.startTime, type: 'start' as const, speakerId },
      { time: utt.endTime, type: 'end' as const, speakerId },
    ];
  }).sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type !== b.type) return a.type === 'end' ? -1 : 1;
    return a.speakerId.localeCompare(b.speakerId);
  });

  const activeBySpeaker = new Map<string, number>();
  let maxConcurrentSpeakerCount = 1;
  for (const event of events) {
    const cur = activeBySpeaker.get(event.speakerId) ?? 0;
    if (event.type === 'start') {
      activeBySpeaker.set(event.speakerId, cur + 1);
    } else if (cur <= 1) {
      activeBySpeaker.delete(event.speakerId);
    } else {
      activeBySpeaker.set(event.speakerId, cur - 1);
    }
    maxConcurrentSpeakerCount = Math.max(maxConcurrentSpeakerCount, activeBySpeaker.size);
  }
  return maxConcurrentSpeakerCount;
}

function buildGroupedSpeakerLayerLayout(
  utterances: UtteranceDocType[],
  laneLockMap: ReadonlyMap<string, number>,
  speakerSortKeyById: ReadonlyMap<string, number>,
): SpeakerLayerLayoutResult {
  const groups = buildOverlapGroups(utterances);
  const placements = new Map<string, SpeakerLayerPlacement>();
  const overlapGroups: SpeakerOverlapGroupSummary[] = [];
  const overlapCycleItemsByGroupId = new Map<string, Map<string, Array<{ id: string; startTime: number }>>>();
  let maxTrack = 1;
  const lockConflictSpeakerIds = new Set<string>();

  for (const group of groups) {
    const {
      placements: groupPlacements,
      subTrackCount,
      lockConflictSpeakerIds: groupLockConflictSpeakerIds,
    } = assignSubTracksForGroup(group, laneLockMap, speakerSortKeyById);
    for (const item of groupPlacements) {
      placements.set(item.utteranceId, item);
      maxTrack = Math.max(maxTrack, item.subTrackIndex + 1);
    }
    for (const speakerId of groupLockConflictSpeakerIds) {
      lockConflictSpeakerIds.add(speakerId);
    }

    const startTime = Math.min(...group.items.map((item) => item.startTime));
    const endTime = Math.max(...group.items.map((item) => item.endTime));
    const speakerCount = new Set(group.items.map((item) => normalizeSpeakerId(item.speakerId))).size;
    overlapGroups.push({
      id: group.id,
      startTime,
      endTime,
      centerTime: (startTime + endTime) / 2,
      subTrackCount,
      speakerCount,
    });

    overlapCycleItemsByGroupId.set(group.id, buildOverlapCycleItemsByUtteranceIdFromSorted(group.items));
  }

  overlapCycleItemsByGroupId.set('__all__', buildOverlapCycleItemsByUtteranceIdFromSorted(groups.flatMap((group) => group.items)));

  return {
    placements,
    subTrackCount: Math.max(1, maxTrack),
    maxConcurrentSpeakerCount: buildMaxConcurrentSpeakerCount(utterances),
    overlapGroups,
    overlapCycleItemsByGroupId,
    lockConflictCount: lockConflictSpeakerIds.size,
    lockConflictSpeakerIds: Array.from(lockConflictSpeakerIds),
  };
}

function buildSpeakerFixedLayout(
  utterances: UtteranceDocType[],
  laneLockMap: ReadonlyMap<string, number>,
  speakerSortKeyById: ReadonlyMap<string, number>,
): SpeakerLayerLayoutResult {
  const groups = buildOverlapGroups(utterances);
  const groupIdByUtteranceId = new Map<string, string>();
  for (const group of groups) {
    for (const item of group.items) {
      groupIdByUtteranceId.set(item.id, group.id);
    }
  }

  const speakerLaneMap = new Map(Object.entries(buildStableSpeakerLaneMap(
    utterances.map((utterance) => utterance.speakerId ?? ''),
    laneLockMap,
    speakerSortKeyById,
  )));
  const placements = new Map<string, SpeakerLayerPlacement>();
  const conflictSpeakerIds = new Set<string>();
  const namedSpeakerLastEnd = new Map<string, number>();

  const sortedUtterances = [...utterances].sort((left, right) => {
    if (left.startTime !== right.startTime) return left.startTime - right.startTime;
    if (left.endTime !== right.endTime) return left.endTime - right.endTime;
    return left.id.localeCompare(right.id);
  });

  const unknownUtterances: UtteranceDocType[] = [];
  for (const utterance of sortedUtterances) {
    const speakerId = normalizeSpeakerId(utterance.speakerId);
    if (speakerId === 'unknown-speaker') {
      unknownUtterances.push(utterance);
      continue;
    }
    const subTrackIndex = speakerLaneMap.get(speakerId) ?? 0;
    const previousEnd = namedSpeakerLastEnd.get(speakerId) ?? -Infinity;
    if (previousEnd > utterance.startTime) {
      conflictSpeakerIds.add(speakerId);
    }
    namedSpeakerLastEnd.set(speakerId, Math.max(previousEnd, utterance.endTime));
    placements.set(utterance.id, {
      utteranceId: utterance.id,
      subTrackIndex,
      overlapGroupId: groupIdByUtteranceId.get(utterance.id) ?? '__all__',
    });
  }

  const namedLaneCount = speakerLaneMap.size;
  let unknownLaneCount = 0;
  if (unknownUtterances.length > 0) {
    const syntheticUnknownUtterances = unknownUtterances.map((utterance) => ({
      ...utterance,
      speakerId: `__unknown__:${utterance.id}`,
    }));
    const unknownLayout = buildGroupedSpeakerLayerLayout(syntheticUnknownUtterances, new Map(), new Map());
    unknownLaneCount = unknownLayout.subTrackCount;
    for (const utterance of unknownUtterances) {
      const placement = unknownLayout.placements.get(utterance.id);
      placements.set(utterance.id, {
        utteranceId: utterance.id,
        subTrackIndex: namedLaneCount + (placement?.subTrackIndex ?? 0),
        overlapGroupId: groupIdByUtteranceId.get(utterance.id) ?? '__all__',
      });
    }
  }

  const overlapGroups: SpeakerOverlapGroupSummary[] = groups.map((group) => {
    const subTrackCount = Math.max(
      1,
      ...group.items.map((item) => (placements.get(item.id)?.subTrackIndex ?? 0) + 1),
    );
    const speakerCount = new Set(group.items.map((item) => normalizeSpeakerId(item.speakerId))).size;
    const startTime = Math.min(...group.items.map((item) => item.startTime));
    const endTime = Math.max(...group.items.map((item) => item.endTime));
    return {
      id: group.id,
      startTime,
      endTime,
      centerTime: (startTime + endTime) / 2,
      subTrackCount,
      speakerCount,
    };
  });

  const overlapCycleItemsByGroupId = new Map<string, Map<string, Array<{ id: string; startTime: number }>>>();
  for (const group of groups) {
    overlapCycleItemsByGroupId.set(group.id, buildOverlapCycleItemsByUtteranceIdFromSorted(group.items));
  }
  overlapCycleItemsByGroupId.set('__all__', buildOverlapCycleItemsByUtteranceIdFromSorted(groups.flatMap((group) => group.items)));

  return {
    placements,
    subTrackCount: Math.max(1, namedLaneCount + unknownLaneCount),
    maxConcurrentSpeakerCount: buildMaxConcurrentSpeakerCount(utterances),
    overlapGroups,
    overlapCycleItemsByGroupId,
    lockConflictCount: conflictSpeakerIds.size,
    lockConflictSpeakerIds: Array.from(conflictSpeakerIds),
  };
}

export function buildSpeakerLayerLayout(utterances: UtteranceDocType[]): SpeakerLayerLayoutResult {
  return buildSpeakerLayerLayoutWithOptions(utterances, {});
}

export function buildSpeakerLayerLayoutWithOptions(
  utterances: UtteranceDocType[],
  options: SpeakerLayerLayoutOptions,
): SpeakerLayerLayoutResult {
  const laneLockMap = toReadonlyMap(options.laneLockMap);
  const speakerSortKeyById = toReadonlyMap(options.speakerSortKeyById);
  if (options.trackMode === 'multi-speaker-fixed') {
    return buildSpeakerFixedLayout(utterances, laneLockMap, speakerSortKeyById);
  }
  return buildGroupedSpeakerLayerLayout(utterances, laneLockMap, speakerSortKeyById);
}
