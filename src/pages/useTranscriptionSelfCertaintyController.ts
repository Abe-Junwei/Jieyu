import { useCallback, useMemo, useState } from 'react';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import { mergeUnitSelfCertaintyConservative, resolveSelfCertaintyHostUnitId, type UnitSelfCertainty } from '../utils/unitSelfCertainty';

type SelfCertaintyHintUnit = {
  id: string;
  layerId?: string | undefined;
  unitId?: string | undefined;
  parentUnitId?: string | undefined;
  mediaId?: string | undefined;
  selfCertainty?: UnitSelfCertainty | undefined;
  startTime: number;
  endTime: number;
};

type SelfCertaintyUnit = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
  selfCertainty?: UnitSelfCertainty | undefined;
};

type UseTranscriptionSelfCertaintyControllerInput = {
  segmentsByLayer: ReadonlyMap<string, readonly SelfCertaintyHintUnit[]>;
  currentMediaUnits: readonly SelfCertaintyHintUnit[];
  units: readonly SelfCertaintyUnit[];
  saveUnitSelfCertainty: (
    unitIds: string[],
    value: UnitSelfCertainty | undefined,
  ) => Promise<unknown> | unknown;
};

export function useTranscriptionSelfCertaintyController(
  input: UseTranscriptionSelfCertaintyControllerInput,
) {
  const selfCertaintyHostHintsByUnitAndLayerId = useMemo(() => {
    const out = new Map<string, {
      parentUnitId?: string;
      mediaId?: string;
      startTime?: number;
      endTime?: number;
    }>();
    const scopedKey = (layerId: string, unitId: string) => `${layerId}::${unitId}`;

    for (const segments of input.segmentsByLayer.values()) {
      for (const seg of segments) {
        out.set(scopedKey(seg.layerId ?? '', seg.id), {
          ...(seg.unitId ? { parentUnitId: seg.unitId } : {}),
          ...(seg.mediaId ? { mediaId: seg.mediaId } : {}),
          startTime: seg.startTime,
          endTime: seg.endTime,
        });
      }
    }

    for (const unit of input.currentMediaUnits) {
      out.set(scopedKey(unit.layerId ?? '', unit.id), {
        ...((unit.parentUnitId && unit.parentUnitId.trim().length > 0)
          ? { parentUnitId: unit.parentUnitId }
          : {}),
        ...(unit.mediaId ? { mediaId: unit.mediaId } : {}),
        startTime: unit.startTime,
        endTime: unit.endTime,
      });
    }

    return out;
  }, [input.currentMediaUnits, input.segmentsByLayer]);

  const [localSelfCertaintyByScopedUnitId, setLocalSelfCertaintyByScopedUnitId] = useState<Map<string, UnitSelfCertainty | null>>(() => new Map());

  const selfCertaintyByUnitId = useMemo(() => {
    const out = new Map<string, UnitSelfCertainty>();
    for (const unit of input.units) {
      if (unit.selfCertainty) {
        out.set(unit.id, unit.selfCertainty);
      }
    }
    for (const segments of input.segmentsByLayer.values()) {
      for (const seg of segments) {
        if (seg.selfCertainty && !out.has(seg.id)) {
          out.set(seg.id, seg.selfCertainty);
        }
      }
    }
    for (const unit of input.currentMediaUnits) {
      if (unit.selfCertainty && !out.has(unit.id)) {
        out.set(unit.id, unit.selfCertainty);
      }
    }
    return out;
  }, [input.currentMediaUnits, input.segmentsByLayer, input.units]);

  const collectCandidateHostIdsForUnit = useCallback((
    unitId: string,
    options?: { parentUnitId?: string; mediaId?: string; startTime?: number; endTime?: number },
  ) => {
    const normalizedUnitId = unitId.trim();
    if (!normalizedUnitId) return [] as string[];

    const out = new Set<string>();
    const explicitParentId = options?.parentUnitId?.trim() ?? '';
    const hasExplicitUnitParent = explicitParentId
      ? input.units.some((unit) => unit.id === explicitParentId)
      : false;
    const isSelfHostedUnit = input.units.some((unit) => unit.id === normalizedUnitId);

    if (hasExplicitUnitParent) {
      out.add(explicitParentId);
      return [...out];
    }
    if (isSelfHostedUnit) {
      out.add(normalizedUnitId);
      return [...out];
    }

    if (typeof options?.startTime !== 'number' || typeof options?.endTime !== 'number') {
      return [...out];
    }

    const normalizedMediaId = options.mediaId?.trim() ?? '';
    const sameMediaUnits = normalizedMediaId
      ? input.units.filter((unit) => (unit.mediaId?.trim() ?? '') === normalizedMediaId)
      : input.units;
    const mediaAgnosticUnits = normalizedMediaId
      ? input.units.filter((unit) => (unit.mediaId?.trim() ?? '') === '')
      : [];
    const candidateGroups = normalizedMediaId
      ? [sameMediaUnits, mediaAgnosticUnits]
      : [sameMediaUnits];

    for (const candidates of candidateGroups) {
      for (const unit of candidates) {
        if (unit.startTime > options.endTime - 0.01 || unit.endTime < options.startTime + 0.01) continue;
        out.add(unit.id);
      }
    }

    if (out.size === 0 && input.units.length === 0) {
      out.add(normalizedUnitId);
    }

    return [...out];
  }, [input.units]);

  const fallbackHostIdsByUnitId = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [scopedUnitKey, hint] of selfCertaintyHostHintsByUnitAndLayerId.entries()) {
      const separatorIndex = scopedUnitKey.indexOf('::');
      const unitId = separatorIndex >= 0 ? scopedUnitKey.slice(separatorIndex + 2) : scopedUnitKey;
      if (!unitId) continue;
      const resolvedHostIds = collectCandidateHostIdsForUnit(unitId, hint);
      if (resolvedHostIds.length === 0) continue;
      const existing = out.get(unitId) ?? [];
      const merged = [...existing];
      for (const resolvedHostId of resolvedHostIds) {
        if (!merged.includes(resolvedHostId)) {
          merged.push(resolvedHostId);
        }
      }
      out.set(unitId, merged);
    }
    return out;
  }, [collectCandidateHostIdsForUnit, selfCertaintyHostHintsByUnitAndLayerId]);

  const displaySelfCertaintyByScopedUnitId = useMemo(() => {
    const out = new Map<string, UnitSelfCertainty>();
    const scopedKey = (layerId: string | undefined, unitId: string) => `${layerId ?? ''}::${unitId}`;
    const writeScopedValue = (
      layerId: string | undefined,
      unitId: string,
      options?: { parentUnitId?: string; mediaId?: string; startTime?: number; endTime?: number },
    ) => {
      const candidateHostIds = collectCandidateHostIdsForUnit(unitId, options);
      const markedValues = [
        selfCertaintyByUnitId.get(unitId),
        ...candidateHostIds.map((hostId) => selfCertaintyByUnitId.get(hostId)),
      ].filter((value): value is UnitSelfCertainty => value !== undefined);
      const value = mergeUnitSelfCertaintyConservative(markedValues);
      if (value) out.set(scopedKey(layerId, unitId), value);
    };

    for (const segments of input.segmentsByLayer.values()) {
      for (const seg of segments) {
        writeScopedValue(seg.layerId ?? '', seg.id, {
          ...(seg.unitId ? { parentUnitId: seg.unitId } : {}),
          ...(seg.mediaId ? { mediaId: seg.mediaId } : {}),
          startTime: seg.startTime,
          endTime: seg.endTime,
        });
      }
    }

    for (const unit of input.currentMediaUnits) {
      writeScopedValue(unit.layerId ?? '', unit.id, {
        ...(unit.parentUnitId ? { parentUnitId: unit.parentUnitId } : {}),
        ...(unit.mediaId ? { mediaId: unit.mediaId } : {}),
        startTime: unit.startTime,
        endTime: unit.endTime,
      });
    }

    return out;
  }, [collectCandidateHostIdsForUnit, input.currentMediaUnits, input.segmentsByLayer, selfCertaintyByUnitId]);

  const resolveSelfCertaintyUnitIds = useCallback((ids: readonly string[], layerId?: string) => {
    const normalizedLayerId = layerId?.trim() ?? '';
    const resolved = new Set<string>();

    for (const rawId of ids) {
      const unitId = rawId.trim();
      if (!unitId) continue;

      if (normalizedLayerId) {
        const scopedKey = `${normalizedLayerId}::${unitId}`;
        const scopedHint = selfCertaintyHostHintsByUnitAndLayerId.get(scopedKey);
        const scopedHostIds = collectCandidateHostIdsForUnit(unitId, scopedHint);
        if (scopedHostIds.length > 0) {
          for (const scopedHostId of scopedHostIds) {
            resolved.add(scopedHostId);
          }
          continue;
        }
      }

      const fallbackHostIds = fallbackHostIdsByUnitId.get(unitId) ?? [];
      if (fallbackHostIds.length > 0) {
        for (const fallbackHostId of fallbackHostIds) {
          resolved.add(fallbackHostId);
        }
        continue;
      }

      const directHostId = resolveSelfCertaintyHostUnitId(unitId, input.units);
      if (directHostId) {
        resolved.add(directHostId);
      }
    }

    return [...resolved];
  }, [collectCandidateHostIdsForUnit, fallbackHostIdsByUnitId, input.units, selfCertaintyHostHintsByUnitAndLayerId]);

  const resolveSelfCertaintyForUnit = useCallback((unitId: string, layerId?: string) => {
    const normalizedUnitId = unitId.trim();
    if (!normalizedUnitId) return undefined;

    const normalizedLayerId = layerId?.trim() ?? '';
    const localScopedKey = `${normalizedLayerId}::${normalizedUnitId}`;
    if (localSelfCertaintyByScopedUnitId.has(localScopedKey)) {
      return localSelfCertaintyByScopedUnitId.get(localScopedKey) ?? undefined;
    }

    if (normalizedLayerId) {
      const scopedValue = displaySelfCertaintyByScopedUnitId.get(`${normalizedLayerId}::${normalizedUnitId}`);
      if (scopedValue) return scopedValue;

      const scopedHint = selfCertaintyHostHintsByUnitAndLayerId.get(`${normalizedLayerId}::${normalizedUnitId}`);
      const scopedHostIds = collectCandidateHostIdsForUnit(normalizedUnitId, scopedHint);
      if (scopedHostIds.length > 0) {
        const mergedScopedValue = mergeUnitSelfCertaintyConservative(
          scopedHostIds
            .map((scopedHostId) => selfCertaintyByUnitId.get(scopedHostId))
            .filter((value): value is UnitSelfCertainty => value !== undefined),
        );
        if (mergedScopedValue) return mergedScopedValue;
        return undefined;
      }
    }

    const fallbackHostIds = fallbackHostIdsByUnitId.get(normalizedUnitId) ?? [];
    if (fallbackHostIds.length > 0) {
      const mergedFallbackValue = mergeUnitSelfCertaintyConservative(
        fallbackHostIds
          .map((fallbackHostId) => selfCertaintyByUnitId.get(fallbackHostId))
          .filter((value): value is UnitSelfCertainty => value !== undefined),
      );
      if (mergedFallbackValue) return mergedFallbackValue;
    }

    return selfCertaintyByUnitId.get(normalizedUnitId)
      ?? (() => {
        const fallbackHostId = resolveSelfCertaintyHostUnitId(normalizedUnitId, input.units);
        return fallbackHostId ? selfCertaintyByUnitId.get(fallbackHostId) : undefined;
      })();
  }, [collectCandidateHostIdsForUnit, displaySelfCertaintyByScopedUnitId, fallbackHostIdsByUnitId, input.units, localSelfCertaintyByScopedUnitId, selfCertaintyByUnitId, selfCertaintyHostHintsByUnitAndLayerId]);

  const handleSetUnitSelfCertaintyFromMenu = useCallback((
    unitIds: Iterable<string>,
    _kind: TimelineUnitKind,
    value: UnitSelfCertainty | undefined,
    layerId?: string,
  ) => {
    const normalizedUnitIds = [...unitIds].map((id) => id.trim()).filter((id) => id.length > 0);
    if (normalizedUnitIds.length === 0) return;

    setLocalSelfCertaintyByScopedUnitId((prev) => {
      const next = new Map(prev);
      const normalizedLayerId = layerId?.trim() ?? '';
      for (const unitId of normalizedUnitIds) {
        next.set(`${normalizedLayerId}::${unitId}`, value ?? null);
        for (const scopedUnitKey of selfCertaintyHostHintsByUnitAndLayerId.keys()) {
          if (scopedUnitKey.endsWith(`::${unitId}`)) {
            next.set(scopedUnitKey, value ?? null);
          }
        }
      }
      return next;
    });

    const resolved = resolveSelfCertaintyUnitIds(normalizedUnitIds, layerId);
    if (resolved.length === 0) return;
    fireAndForget(Promise.resolve(input.saveUnitSelfCertainty(resolved, value)));
  }, [input.saveUnitSelfCertainty, resolveSelfCertaintyUnitIds, selfCertaintyHostHintsByUnitAndLayerId]);

  return {
    resolveSelfCertaintyUnitIds,
    resolveSelfCertaintyForUnit,
    handleSetUnitSelfCertaintyFromMenu,
  };
}
