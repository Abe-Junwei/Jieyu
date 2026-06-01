import { LinguisticService } from '../../services/LinguisticService';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import type { PerLayerRowFieldPatch } from '../../hooks/transcription/useTranscriptionUnitActions';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import { asNumber, asRecord, asString } from './cloudSyncConflictHelpers';

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
  runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
  rawActions: CloudSyncRawActions;
  layers: ReadonlyArray<{ id: string; key?: string; layerType?: string }>;
  layerLinks: ReadonlyArray<{
    transcriptionLayerKey: string;
    hostTranscriptionLayerId?: string;
    layerId: string;
  }>;
  loadSnapshot: () => Promise<void>;
}

export async function applyCollaborationRemoteMutation(
  change: CollaborationProjectChangeRecord,
  options: ApplyCollaborationRemoteMutationOptions | undefined,
  deps: ApplyCollaborationRemoteMutationDeps,
): Promise<boolean> {
  const { runWithDbMutex, rawActions, layers, layerLinks, loadSnapshot } = deps;
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
    await loadSnapshot();
  }

  return mutated;
}
