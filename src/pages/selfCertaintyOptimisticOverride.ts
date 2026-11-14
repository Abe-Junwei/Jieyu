import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

/**
 * 菜单写入的乐观覆盖只在对应请求等待期间压住读模型。
 * 成功后一直保留到权威读模型追上，或读模型换了新快照（撤销、重做、重新读取、层/媒体切换）。
 * 失败则按操作序号回滚。旧请求不能清掉更新的覆盖。
 *
 * Optimistic menu overrides mask the read model only while that write is in flight.
 * After success they stay until the authoritative read model catches up, or a new
 * snapshot arrives (undo, redo, reload, layer/media switch). Failure rolls back by
 * generation so an older request cannot clear a newer override.
 */
export type SelfCertaintyOverrideKind = 'segment' | 'unit';

export type SelfCertaintyOverrideEntry = {
  unitId: string;
  layerId: string;
  /** `null` 表示用户清除标记。`null` means the user cleared the mark. */
  value: UnitSelfCertainty | null;
  generation: number;
  phase: 'inflight' | 'settled';
  kind: SelfCertaintyOverrideKind;
  segmentsByLayerAtSettle: object | null;
  unitsAtSettle: object | null;
};

export type SelfCertaintyOverrideUpdate = {
  key: string;
  unitId: string;
  layerId: string;
  value: UnitSelfCertainty | null;
  generation: number;
  kind: SelfCertaintyOverrideKind;
};

type SourceSnapshot = {
  segmentsByLayer: object;
  units: object;
};

function writtenValue(entry: SelfCertaintyOverrideEntry): UnitSelfCertainty | undefined {
  return entry.value ?? undefined;
}

function sourceMovedSinceStart(
  entry: SelfCertaintyOverrideEntry,
  current: SourceSnapshot,
  atStart: SourceSnapshot,
): boolean {
  if (entry.kind === 'segment') return current.segmentsByLayer !== atStart.segmentsByLayer;
  if (entry.kind === 'unit') return current.units !== atStart.units;
  const unreachable: never = entry.kind;
  return unreachable;
}

function sourceMovedSinceSettle(
  entry: SelfCertaintyOverrideEntry,
  current: SourceSnapshot,
): boolean {
  if (entry.phase !== 'settled') return false;
  if (entry.kind === 'segment') return current.segmentsByLayer !== entry.segmentsByLayerAtSettle;
  if (entry.kind === 'unit') return current.units !== entry.unitsAtSettle;
  const unreachable: never = entry.kind;
  return unreachable;
}

/** 覆盖是否仍应挡住权威值。Whether the override should still mask the authoritative value. */
export function overrideMasksAuthoritative(
  entry: SelfCertaintyOverrideEntry,
  authoritative: UnitSelfCertainty | undefined,
  sources: SourceSnapshot,
): boolean {
  if (entry.phase === 'inflight') return true;
  if (entry.phase === 'settled') {
    if (writtenValue(entry) === authoritative) return false;
    return !sourceMovedSinceSettle(entry, sources);
  }
  const unreachable: never = entry.phase;
  return unreachable;
}

export function putInflightSelfCertaintyOverrides(
  prev: ReadonlyMap<string, SelfCertaintyOverrideEntry>,
  updates: readonly SelfCertaintyOverrideUpdate[],
): Map<string, SelfCertaintyOverrideEntry> {
  const next = new Map(prev);
  for (const update of updates) {
    next.set(update.key, {
      unitId: update.unitId,
      layerId: update.layerId,
      value: update.value,
      generation: update.generation,
      phase: 'inflight',
      kind: update.kind,
      segmentsByLayerAtSettle: null,
      unitsAtSettle: null,
    });
  }
  return next;
}

export function rollbackSelfCertaintyOverrides(
  prev: ReadonlyMap<string, SelfCertaintyOverrideEntry>,
  failed: readonly { key: string; generation: number }[],
): Map<string, SelfCertaintyOverrideEntry> {
  let next: Map<string, SelfCertaintyOverrideEntry> | null = null;
  for (const item of failed) {
    const entry = (next ?? prev).get(item.key);
    if (!entry || entry.generation !== item.generation) continue;
    if (!next) next = new Map(prev);
    next.delete(item.key);
  }
  return next ?? (prev as Map<string, SelfCertaintyOverrideEntry>);
}

/**
 * 成功落定时：权威值已经等于写入值，或等待期间对应读模型换过快照，就丢掉覆盖。
 * 否则记为 settled，直到之后的读回或新快照。
 */
export function settleSelfCertaintyOverrides(
  prev: ReadonlyMap<string, SelfCertaintyOverrideEntry>,
  input: {
    keys: readonly { key: string; generation: number }[];
    authoritativeFor: (entry: SelfCertaintyOverrideEntry) => UnitSelfCertainty | undefined;
    segmentsByLayer: object;
    units: object;
    segmentsByLayerAtStart: object;
    unitsAtStart: object;
  },
): Map<string, SelfCertaintyOverrideEntry> {
  let next: Map<string, SelfCertaintyOverrideEntry> | null = null;
  const current = { segmentsByLayer: input.segmentsByLayer, units: input.units };
  const atStart = {
    segmentsByLayer: input.segmentsByLayerAtStart,
    units: input.unitsAtStart,
  };
  for (const item of input.keys) {
    const entry = (next ?? prev).get(item.key);
    if (!entry || entry.generation !== item.generation || entry.phase !== 'inflight') continue;
    const authoritative = input.authoritativeFor(entry);
    const converged = writtenValue(entry) === authoritative;
    const moved = sourceMovedSinceStart(entry, current, atStart);
    if (!next) next = new Map(prev);
    if (converged || moved) {
      next.delete(item.key);
      continue;
    }
    next.set(item.key, {
      ...entry,
      phase: 'settled',
      segmentsByLayerAtSettle: input.segmentsByLayer,
      unitsAtSettle: input.units,
    });
  }
  return next ?? (prev as Map<string, SelfCertaintyOverrideEntry>);
}

/** 丢掉已经追上权威值、或读模型已经换快照的 settled 覆盖。Inflight 不动。 */
export function reconcileSettledSelfCertaintyOverrides(
  prev: ReadonlyMap<string, SelfCertaintyOverrideEntry>,
  input: {
    authoritativeFor: (entry: SelfCertaintyOverrideEntry) => UnitSelfCertainty | undefined;
    segmentsByLayer: object;
    units: object;
  },
): Map<string, SelfCertaintyOverrideEntry> {
  let next: Map<string, SelfCertaintyOverrideEntry> | null = null;
  const sources = { segmentsByLayer: input.segmentsByLayer, units: input.units };
  for (const [key, entry] of prev) {
    switch (entry.phase) {
      case 'inflight':
        continue;
      case 'settled':
        if (overrideMasksAuthoritative(entry, input.authoritativeFor(entry), sources)) continue;
        break;
      default: {
        const unreachable: never = entry.phase;
        return unreachable;
      }
    }
    if (!next) next = new Map(prev);
    next.delete(key);
  }
  return next ?? (prev as Map<string, SelfCertaintyOverrideEntry>);
}
