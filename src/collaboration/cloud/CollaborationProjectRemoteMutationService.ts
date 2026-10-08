import { LinguisticService } from '../../services/LinguisticService';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import type { PerLayerRowFieldPatch } from '../../hooks/transcription/useTranscriptionUnitActions';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import { asNumber, asRecord, asString } from './cloudSyncConflictHelpers';
import {
  listForeignOwnedLayers,
  listForeignOwnedUnits,
} from '../../services/projectOwnershipQueries';

/**
 * 远端变更指向本机另一个项目的行，或要把行写进另一个项目时拒绝应用（JY-03）。
 * A remote change that targets a row of another local project, or would write a row into another
 * project, is refused (JY-03).
 */
export class CollaborationRemoteProjectScopeError extends Error {
  constructor(
    public readonly changeId: string,
    public readonly opType: string,
    public readonly entityKind: 'unit' | 'layer',
    public readonly entityId: string,
    public readonly ownerTextId: string,
    public readonly projectTextId: string,
  ) {
    super(
      `Refusing remote change ${changeId} (${opType}): ${entityKind} "${entityId}" belongs to local project "${ownerTextId}", not to the collaboration project "${projectTextId}"`,
    );
    this.name = 'CollaborationRemoteProjectScopeError';
  }
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringIds(values: unknown): string[] {
  return Array.isArray(values) ? values.map((item) => asString(item)).filter(present) : [];
}

/** 收集这条变更会读写的单元 / 图层，以及载荷里声明的归属 | Units / layers a change touches */
function collectChangeTargets(change: CollaborationProjectChangeRecord): {
  unitIds: string[];
  layerIds: string[];
  declaredTextIds: Array<{ kind: 'unit' | 'layer'; id: string; textId: string | null }>;
} {
  const payload = asRecord(change.payload);
  const unitIds: string[] = [];
  const layerIds: string[] = [];
  const declaredTextIds: Array<{ kind: 'unit' | 'layer'; id: string; textId: string | null }> = [];
  const entityHead = asString(change.entityId?.split(':')[0]);
  switch (change.opType) {
    case 'upsert_unit_content': {
      const unitId = asString(payload?.unitId) ?? entityHead;
      if (present(unitId)) unitIds.push(unitId);
      const layerId = asString(payload?.layerId);
      if (present(layerId)) layerIds.push(layerId);
      break;
    }
    case 'upsert_unit': {
      const fullUnit = asRecord(payload?.unit);
      const unitId =
        asString(fullUnit?.id) ?? asString(payload?.unitId) ?? asString(change.entityId);
      if (present(unitId)) unitIds.push(unitId);
      if (fullUnit !== null && present(unitId)) {
        declaredTextIds.push({ kind: 'unit', id: unitId, textId: asString(fullUnit.textId) });
        const layerId = asString(fullUnit.layerId);
        if (present(layerId)) layerIds.push(layerId);
      }
      break;
    }
    case 'batch_patch':
      unitIds.push(...stringIds(payload?.unitIds));
      break;
    case 'upsert_layer': {
      const fullLayer = asRecord(payload?.layer);
      const layerId = asString(fullLayer?.id) ?? asString(change.entityId);
      if (present(layerId)) layerIds.push(layerId);
      if (fullLayer !== null && present(layerId)) {
        declaredTextIds.push({ kind: 'layer', id: layerId, textId: asString(fullLayer.textId) });
      }
      break;
    }
    case 'upsert_relation': {
      const [, entityLayerId] = change.entityId.split(':');
      const layerId = asString(payload?.layerId) ?? asString(entityLayerId);
      if (present(layerId)) layerIds.push(layerId);
      const hostId = asString(payload?.hostTranscriptionLayerId);
      if (present(hostId)) layerIds.push(hostId);
      break;
    }
    case 'delete_entity': {
      if (change.entityType === 'layer_unit') {
        const unitId = asString(payload?.unitId) ?? asString(change.entityId);
        if (present(unitId)) unitIds.push(unitId);
      }
      if (change.entityType === 'layer') {
        const layerId = asString(payload?.layerId) ?? asString(change.entityId);
        if (present(layerId) && layerId !== 'layer') layerIds.push(layerId);
      }
      break;
    }
    default:
      break;
  }
  return { unitIds, layerIds, declaredTextIds };
}

/**
 * 服务层归属检查：载荷声明的 `textId` 必须是协同项目；目标单元 / 图层若已存在，必须属于协同项目。
 * Service-level ownership check: declared `textId` must be the collaboration project, and existing
 * target units / layers must belong to it.
 */
export async function assertRemoteChangeWithinProject(
  change: CollaborationProjectChangeRecord,
  projectTextId: string,
): Promise<void> {
  const { unitIds, layerIds, declaredTextIds } = collectChangeTargets(change);
  for (const declared of declaredTextIds) {
    if (declared.textId !== projectTextId) {
      throw new CollaborationRemoteProjectScopeError(
        change.id,
        change.opType,
        declared.kind,
        declared.id,
        declared.textId ?? '',
        projectTextId,
      );
    }
  }
  const [foreignUnits, foreignLayers] = await Promise.all([
    listForeignOwnedUnits(unitIds, projectTextId),
    listForeignOwnedLayers(layerIds, projectTextId),
  ]);
  const foreignUnit = foreignUnits[0];
  if (foreignUnit) {
    throw new CollaborationRemoteProjectScopeError(
      change.id,
      change.opType,
      'unit',
      foreignUnit.id,
      foreignUnit.textId,
      projectTextId,
    );
  }
  const foreignLayer = foreignLayers[0];
  if (foreignLayer) {
    throw new CollaborationRemoteProjectScopeError(
      change.id,
      change.opType,
      'layer',
      foreignLayer.id,
      foreignLayer.textId,
      projectTextId,
    );
  }
}

export interface CloudSyncRawActions {
  saveUnitText: (unitId: string, value: string, layerId?: string) => Promise<void>;
  saveUnitSelfCertainty: (
    unitIds: Iterable<string>,
    value: UnitSelfCertainty | undefined,
  ) => Promise<void>;
  saveUnitLayerFields: (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => Promise<void>;
  saveUnitTiming: (unitId: string, startTime: number, endTime: number) => Promise<void>;
  deleteUnit: (unitId: string) => Promise<void>;
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  deleteLayer: (layerId: string, options?: { keepUnits?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
}

export interface ApplyCollaborationRemoteMutationOptions {
  skipLoadSnapshot?: boolean;
}

export interface ApplyCollaborationRemoteMutationDeps {
  /** 本机对应的协同项目 textId | Local textId of the collaboration project */
  projectTextId: string;
  runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
  rawActions: CloudSyncRawActions;
  layers: ReadonlyArray<{ id: string; key?: string; layerType?: string }>;
  layerLinks: ReadonlyArray<{
    transcriptionLayerKey: string;
    hostTranscriptionLayerId?: string;
    layerId: string;
  }>;
  /** 必须传当前项目 textId（JY-02）| Must pass the current project textId (JY-02) */
  loadSnapshot: (textId: string) => Promise<void>;
}

export async function applyCollaborationRemoteMutation(
  change: CollaborationProjectChangeRecord,
  options: ApplyCollaborationRemoteMutationOptions | undefined,
  deps: ApplyCollaborationRemoteMutationDeps,
): Promise<boolean> {
  const { runWithDbMutex, rawActions, layers, layerLinks, loadSnapshot } = deps;
  const projectTextId = deps.projectTextId.trim();
  if (projectTextId.length === 0) {
    throw new Error(
      `Refusing remote change ${change.id} (${change.opType}): no local collaboration project`,
    );
  }
  await assertRemoteChangeWithinProject(change, projectTextId);
  const payload = asRecord(change.payload);
  let mutated = false;

  if (change.opType === 'upsert_unit_content') {
    const payloadUnitId = asString(payload?.unitId);
    const payloadLayerId = asString(payload?.layerId);
    const payloadValue = asString(payload?.value) ?? '';
    const fallbackUnitId = asString(change.entityId?.split(':')[0]);
    const unitId = payloadUnitId ?? fallbackUnitId;
    if (unitId !== null) {
      await runWithDbMutex(() =>
        rawActions.saveUnitText(unitId, payloadValue, payloadLayerId ?? undefined),
      );
      mutated = true;
    }
  }

  if (change.opType === 'upsert_unit') {
    const fullUnit = asRecord(payload?.unit);
    if (fullUnit) {
      await runWithDbMutex(() =>
        LinguisticService.units
          .save(fullUnit as unknown as import('../../db').LayerUnitDocType)
          .then(() => undefined),
      );
      mutated = true;
    } else {
      const unitId = asString(payload?.unitId) ?? asString(change.entityId);
      const startTime = asNumber(payload?.startTime);
      const endTime = asNumber(payload?.endTime);
      if (unitId !== null && startTime !== null && endTime !== null) {
        await runWithDbMutex(() => rawActions.saveUnitTiming(unitId, startTime, endTime));
        mutated = true;
      }
    }
  }

  if (change.opType === 'batch_patch') {
    const action = asString(payload?.action);
    const unitIds = Array.isArray(payload?.unitIds)
      ? payload?.unitIds
          .map((item) => asString(item))
          .filter((item): item is string => Boolean(item))
      : [];

    if (action === 'delete-selected' && unitIds.length > 0) {
      await runWithDbMutex(() => rawActions.deleteSelectedUnits(new Set(unitIds)));
      mutated = true;
    }

    const certaintyValue = payload?.value;
    if (
      (action === null || action === 'self-certainty') &&
      unitIds.length > 0 &&
      certaintyValue !== undefined
    ) {
      await runWithDbMutex(() =>
        rawActions.saveUnitSelfCertainty(unitIds, certaintyValue as UnitSelfCertainty | undefined),
      );
      mutated = true;
    }

    const patchRecord = asRecord(payload?.patch);
    if (action === 'layer-fields' && unitIds.length > 0 && patchRecord) {
      await runWithDbMutex(() =>
        rawActions.saveUnitLayerFields(unitIds, patchRecord as PerLayerRowFieldPatch),
      );
      mutated = true;
    }
  }

  if (change.opType === 'upsert_layer') {
    const fullLayer = asRecord(payload?.layer);
    if (fullLayer) {
      await runWithDbMutex(() =>
        LinguisticService.layers
          .upsert(fullLayer as unknown as import('../../db').LayerDocType)
          .then(() => undefined),
      );
      mutated = true;
    }
  }

  if (change.opType === 'upsert_relation') {
    const transcriptionLayerKey = asString(payload?.transcriptionLayerKey);
    const hostTranscriptionLayerId = asString(payload?.hostTranscriptionLayerId);
    const [entityHostToken, entityLayerId] = change.entityId.split(':');
    const hostLayer = layers.find(
      (layer) =>
        layer.id === hostTranscriptionLayerId ||
        layer.key === transcriptionLayerKey ||
        layer.id === entityHostToken ||
        layer.key === entityHostToken,
    );
    const resolvedHostId = hostTranscriptionLayerId ?? hostLayer?.id;
    const resolvedHostKey = transcriptionLayerKey ?? hostLayer?.key;
    const layerId = asString(payload?.layerId) ?? asString(entityLayerId);
    const enabled = typeof payload?.enabled === 'boolean' ? payload.enabled : undefined;
    if (
      resolvedHostKey !== null &&
      resolvedHostKey !== undefined &&
      layerId !== null &&
      enabled !== undefined
    ) {
      const exists = layerLinks.some(
        (link) =>
          link.layerId === layerId &&
          ((resolvedHostId !== undefined &&
            resolvedHostId !== '' &&
            link.hostTranscriptionLayerId === resolvedHostId) ||
            link.transcriptionLayerKey === resolvedHostKey),
      );
      if (exists !== enabled) {
        await runWithDbMutex(() => rawActions.toggleLayerLink(resolvedHostKey, layerId));
        mutated = true;
      }
    }
  }

  if (change.opType === 'delete_entity') {
    if (change.entityType === 'layer_unit') {
      const unitId = asString(payload?.unitId) ?? asString(change.entityId);
      if (unitId !== null) {
        await runWithDbMutex(() => rawActions.deleteUnit(unitId));
        mutated = true;
      }
    }

    if (change.entityType === 'layer') {
      const layerId = asString(payload?.layerId) ?? asString(change.entityId);
      if (layerId !== null && layerId !== 'layer') {
        const keepUnits = typeof payload?.keepUnits === 'boolean' ? payload.keepUnits : undefined;
        await runWithDbMutex(() =>
          rawActions.deleteLayer(layerId, keepUnits === undefined ? undefined : { keepUnits }),
        );
        mutated = true;
      }
    }
  }

  if (mutated && options?.skipLoadSnapshot !== true) {
    await loadSnapshot(projectTextId);
  }

  return mutated;
}
