import { useCallback, useMemo, useState } from 'react';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import { resolveSelfCertaintyHostUnitId, type UnitSelfCertainty } from '../utils/unitSelfCertainty';

type SelfCertaintyHostResolution = {
  hostIds: string[];
  explicit: boolean;
};

type LayerScopedSelfCertaintyResolution =
  | { kind: 'none' }
  | { kind: 'exact'; hostId: string }
  | { kind: 'fallback-single'; hostId: string }
  | { kind: 'ambiguous' };

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
    for (const unit of input.currentMediaUnits) {
      const normalizedLayerId = unit.layerId?.trim() ?? '';
      if (!normalizedLayerId && unit.selfCertainty && !out.has(unit.id)) {
        out.set(unit.id, unit.selfCertainty);
      }
    }
    return out;
  }, [input.currentMediaUnits, input.segmentsByLayer, input.units]);

  const selfCertaintyByScopedUnitId = useMemo(() => {
    const out = new Map<string, UnitSelfCertainty>();
    const scopedKey = (layerId: string | undefined, unitId: string) => `${layerId ?? ''}::${unitId}`;

    for (const segments of input.segmentsByLayer.values()) {
      for (const seg of segments) {
        if (seg.selfCertainty) {
          out.set(scopedKey(seg.layerId ?? '', seg.id), seg.selfCertainty);
        }
      }
    }

    for (const unit of input.currentMediaUnits) {
      if (unit.selfCertainty) {
        out.set(scopedKey(unit.layerId ?? '', unit.id), unit.selfCertainty);
      }
    }

    return out;
  }, [input.currentMediaUnits, input.segmentsByLayer]);

  const resolveCandidateHostsForUnit = useCallback((
    unitId: string,
    options?: { parentUnitId?: string; mediaId?: string; startTime?: number; endTime?: number },
  ): SelfCertaintyHostResolution => {
    const normalizedUnitId = unitId.trim();
    if (!normalizedUnitId) return { hostIds: [], explicit: false };

    const out = new Set<string>();
    const explicitParentId = options?.parentUnitId?.trim() ?? '';
    const hasExplicitUnitParent = explicitParentId
      ? input.units.some((unit) => unit.id === explicitParentId)
      : false;
    const isSelfHostedUnit = input.units.some((unit) => unit.id === normalizedUnitId);

    if (hasExplicitUnitParent) {
      out.add(explicitParentId);
      return { hostIds: [...out], explicit: true };
    }
    if (isSelfHostedUnit) {
      out.add(normalizedUnitId);
      return { hostIds: [...out], explicit: true };
    }

    if (typeof options?.startTime !== 'number' || typeof options?.endTime !== 'number') {
      return { hostIds: [...out], explicit: false };
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
      return { hostIds: [...out], explicit: true };
    }

    return { hostIds: [...out], explicit: false };
  }, [input.units]);

  const fallbackHostIdsByUnitId = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [scopedUnitKey, hint] of selfCertaintyHostHintsByUnitAndLayerId.entries()) {
      const separatorIndex = scopedUnitKey.indexOf('::');
      const unitId = separatorIndex >= 0 ? scopedUnitKey.slice(separatorIndex + 2) : scopedUnitKey;
      if (!unitId) continue;
      const { hostIds: resolvedHostIds } = resolveCandidateHostsForUnit(unitId, hint);
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
  }, [resolveCandidateHostsForUnit, selfCertaintyHostHintsByUnitAndLayerId]);

  const resolveLayerScopedSelfCertaintyResolution = useCallback((
    unitId: string,
    layerId?: string,
  ): LayerScopedSelfCertaintyResolution => {
    const normalizedUnitId = unitId.trim();
    const normalizedLayerId = layerId?.trim() ?? '';
    if (!normalizedUnitId || !normalizedLayerId) {
      return { kind: 'none' };
    }

    const scopedHint = selfCertaintyHostHintsByUnitAndLayerId.get(`${normalizedLayerId}::${normalizedUnitId}`);
    const scopedResolution = resolveCandidateHostsForUnit(normalizedUnitId, scopedHint);
    if (scopedResolution.hostIds.length === 1) {
      return scopedResolution.explicit
        ? { kind: 'exact', hostId: scopedResolution.hostIds[0] as string }
        : { kind: 'fallback-single', hostId: scopedResolution.hostIds[0] as string };
    }
    if (scopedResolution.hostIds.length > 1) {
      return { kind: 'ambiguous' };
    }

    const fallbackHostIds = fallbackHostIdsByUnitId.get(normalizedUnitId) ?? [];
    if (fallbackHostIds.length === 1) {
      return { kind: 'fallback-single', hostId: fallbackHostIds[0] as string };
    }
    if (fallbackHostIds.length > 1) {
      return { kind: 'ambiguous' };
    }

    return { kind: 'none' };
  }, [fallbackHostIdsByUnitId, resolveCandidateHostsForUnit, selfCertaintyHostHintsByUnitAndLayerId]);

  const resolveSelfCertaintyUnitIds = useCallback((ids: readonly string[], layerId?: string) => {
    const normalizedLayerId = layerId?.trim() ?? '';
    const resolved = new Set<string>();

    for (const rawId of ids) {
      const unitId = rawId.trim();
      if (!unitId) continue;

      if (normalizedLayerId) {
        const scopedKey = `${normalizedLayerId}::${unitId}`;
        const scopedHint = selfCertaintyHostHintsByUnitAndLayerId.get(scopedKey);
        const { hostIds: scopedHostIds } = resolveCandidateHostsForUnit(unitId, scopedHint);
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
  }, [fallbackHostIdsByUnitId, input.units, resolveCandidateHostsForUnit, selfCertaintyHostHintsByUnitAndLayerId]);

  const resolveSelfCertaintyForUnit = useCallback((unitId: string, layerId?: string) => {
    const normalizedUnitId = unitId.trim();
    if (!normalizedUnitId) return undefined;

    const normalizedLayerId = layerId?.trim() ?? '';
    const localScopedKey = `${normalizedLayerId}::${normalizedUnitId}`;
    if (localSelfCertaintyByScopedUnitId.has(localScopedKey)) {
      return localSelfCertaintyByScopedUnitId.get(localScopedKey) ?? undefined;
    }

    if (normalizedLayerId) {
      const scopedDirectValue = selfCertaintyByScopedUnitId.get(`${normalizedLayerId}::${normalizedUnitId}`);
      if (scopedDirectValue) return scopedDirectValue;

      const scopedResolution = resolveLayerScopedSelfCertaintyResolution(normalizedUnitId, normalizedLayerId);
      if (scopedResolution.kind === 'exact' || scopedResolution.kind === 'fallback-single') {
        return selfCertaintyByUnitId.get(scopedResolution.hostId);
      }
    }

    const fallbackHostIds = fallbackHostIdsByUnitId.get(normalizedUnitId) ?? [];
    if (fallbackHostIds.length === 1) {
      return selfCertaintyByUnitId.get(fallbackHostIds[0] as string);
    }

    if (normalizedLayerId) {
      return undefined;
    }

    return selfCertaintyByUnitId.get(normalizedUnitId)
      ?? (() => {
        const fallbackHostId = resolveSelfCertaintyHostUnitId(normalizedUnitId, input.units);
        return fallbackHostId ? selfCertaintyByUnitId.get(fallbackHostId) : undefined;
      })();
  }, [fallbackHostIdsByUnitId, input.units, localSelfCertaintyByScopedUnitId, resolveLayerScopedSelfCertaintyResolution, selfCertaintyByScopedUnitId, selfCertaintyByUnitId]);

  const resolveSelfCertaintyAmbiguityForUnit = useCallback((unitId: string, layerId?: string) => {
    const normalizedUnitId = unitId.trim();
    if (!normalizedUnitId) return false;

    const normalizedLayerId = layerId?.trim() ?? '';
    if (!normalizedLayerId) return false;

    const localScopedKey = `${normalizedLayerId}::${normalizedUnitId}`;
    if (localSelfCertaintyByScopedUnitId.has(localScopedKey)) {
      return false;
    }

    const scopedDirectValue = selfCertaintyByScopedUnitId.get(localScopedKey);
    if (scopedDirectValue) {
      return false;
    }

    return resolveLayerScopedSelfCertaintyResolution(normalizedUnitId, normalizedLayerId).kind === 'ambiguous';
  }, [localSelfCertaintyByScopedUnitId, resolveLayerScopedSelfCertaintyResolution, selfCertaintyByScopedUnitId]);

  const handleSetUnitSelfCertaintyFromMenu = useCallback((
    unitIds: Iterable<string>,
    kind: TimelineUnitKind,
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
      }
      return next;
    });

    const resolved = kind === 'segment'
      ? normalizedUnitIds
      : resolveSelfCertaintyUnitIds(normalizedUnitIds, layerId);
    if (resolved.length === 0) return;
    fireAndForget(Promise.resolve(input.saveUnitSelfCertainty(resolved, value)));
  }, [input.saveUnitSelfCertainty, resolveSelfCertaintyUnitIds]);

  return {
    resolveSelfCertaintyUnitIds,
    resolveSelfCertaintyForUnit,
    resolveSelfCertaintyAmbiguityForUnit,
    handleSetUnitSelfCertaintyFromMenu,
  };
}
