import { useCallback, useMemo } from 'react';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import {
  resolveSelfCertaintyHostUtteranceId,
  resolveSelfCertaintyHostUtteranceIds,
  type UtteranceSelfCertainty,
} from '../utils/utteranceSelfCertainty';

type SelfCertaintyHintUnit = {
  id: string;
  layerId: string;
  utteranceId?: string;
  parentUtteranceId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
};

type SelfCertaintyUtterance = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string;
};

type UseTranscriptionSelfCertaintyControllerInput = {
  segmentsByLayer: ReadonlyMap<string, readonly SelfCertaintyHintUnit[]>;
  currentMediaUnits: readonly SelfCertaintyHintUnit[];
  utterances: readonly SelfCertaintyUtterance[];
  saveUtteranceSelfCertainty: (
    utteranceIds: string[],
    value: UtteranceSelfCertainty | undefined,
  ) => Promise<unknown> | unknown;
};

export function useTranscriptionSelfCertaintyController(
  input: UseTranscriptionSelfCertaintyControllerInput,
) {
  const selfCertaintyHostHintsByUnitAndLayerId = useMemo(() => {
    const out = new Map<string, {
      parentUtteranceId?: string;
      mediaId?: string;
      startTime?: number;
      endTime?: number;
    }>();
    const scopedKey = (layerId: string, unitId: string) => `${layerId}::${unitId}`;

    for (const segments of input.segmentsByLayer.values()) {
      for (const seg of segments) {
        out.set(scopedKey(seg.layerId, seg.id), {
          ...(seg.utteranceId ? { parentUtteranceId: seg.utteranceId } : {}),
          ...(seg.mediaId ? { mediaId: seg.mediaId } : {}),
          startTime: seg.startTime,
          endTime: seg.endTime,
        });
      }
    }

    for (const unit of input.currentMediaUnits) {
      out.set(scopedKey(unit.layerId, unit.id), {
        ...((unit.parentUtteranceId && unit.parentUtteranceId.trim().length > 0)
          ? { parentUtteranceId: unit.parentUtteranceId }
          : {}),
        ...(unit.mediaId ? { mediaId: unit.mediaId } : {}),
        startTime: unit.startTime,
        endTime: unit.endTime,
      });
    }

    return out;
  }, [input.currentMediaUnits, input.segmentsByLayer]);

  const resolveSelfCertaintyUtteranceIds = useCallback((ids: readonly string[], layerId?: string) => {
    const normalizedLayerId = layerId?.trim() ?? '';
    if (!normalizedLayerId) {
      return resolveSelfCertaintyHostUtteranceIds(ids, input.utterances);
    }

    const resolved = new Set<string>();
    for (const rawId of ids) {
      const unitId = rawId.trim();
      if (!unitId) continue;
      const scopedHint = selfCertaintyHostHintsByUnitAndLayerId.get(`${normalizedLayerId}::${unitId}`);
      const hostId = resolveSelfCertaintyHostUtteranceId(unitId, input.utterances, scopedHint);
      if (hostId) resolved.add(hostId);
    }
    return [...resolved];
  }, [input.utterances, selfCertaintyHostHintsByUnitAndLayerId]);

  const handleSetUtteranceSelfCertaintyFromMenu = useCallback((
    unitIds: Iterable<string>,
    _kind: TimelineUnitKind,
    value: UtteranceSelfCertainty | undefined,
    layerId?: string,
  ) => {
    const resolved = resolveSelfCertaintyUtteranceIds([...unitIds], layerId);
    if (resolved.length === 0) return;
    fireAndForget(Promise.resolve(input.saveUtteranceSelfCertainty(resolved, value)));
  }, [input.saveUtteranceSelfCertainty, resolveSelfCertaintyUtteranceIds]);

  return {
    resolveSelfCertaintyUtteranceIds,
    handleSetUtteranceSelfCertaintyFromMenu,
  };
}
