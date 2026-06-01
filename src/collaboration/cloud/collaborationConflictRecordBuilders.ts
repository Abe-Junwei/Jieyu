import type { CollaborationRecord, FieldValue } from '../collaborationConflictRuntime';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import {
  asRecord,
  asString,
  createEntityShadowKey,
  extractConflictFields,
  pushFieldIfPrimitive,
  toTimestampMs,
} from './cloudSyncConflictHelpers';

export function buildRemoteConflictRecord(
  change: CollaborationProjectChangeRecord,
): CollaborationRecord {
  const payload = asRecord(change.payload);
  const fields = extractConflictFields({
    entityType: change.entityType,
    entityId: change.entityId,
    opType: change.opType,
    payload,
  });

  return {
    entityId: change.entityId,
    sessionId:
      asString(change.sessionId) ??
      asString(change.clientId) ??
      asString(change.actorId) ??
      'remote-session',
    version: Math.max(0, Math.floor(change.projectRevision)),
    updatedAt: toTimestampMs(change.createdAt),
    fields,
    ...(change.opType === 'delete_entity' || payload?.deleted === true ? { deleted: true } : {}),
  };
}

export interface BuildLocalSnapshotFieldsDeps {
  units: ReadonlyArray<Record<string, unknown> & { id: string }>;
  layers: ReadonlyArray<Record<string, unknown> & { id: string; key?: string; layerType?: string }>;
  layerLinks: ReadonlyArray<{
    transcriptionLayerKey: string;
    hostTranscriptionLayerId?: string;
    layerId: string;
  }>;
}

export function buildLocalSnapshotFields(
  change: CollaborationProjectChangeRecord,
  deps: BuildLocalSnapshotFieldsDeps,
): Record<string, FieldValue> {
  const { units, layers, layerLinks } = deps;
  const fields: Record<string, FieldValue> = {
    entityType: change.entityType,
  };

  if (change.entityType === 'layer_unit' || change.entityType === 'layer_unit_content') {
    const unitId = asString(change.entityId.split(':')[0]) ?? change.entityId;
    const unit = units.find((item) => item.id === unitId);
    const unitRecord = asRecord(unit);
    fields.exists = Boolean(unit);
    pushFieldIfPrimitive(fields, 'unitId', unitRecord?.id ?? unitId);
    pushFieldIfPrimitive(fields, 'startTime', unitRecord?.startTime);
    pushFieldIfPrimitive(fields, 'endTime', unitRecord?.endTime);
    pushFieldIfPrimitive(fields, 'speakerId', unitRecord?.speakerId);
    pushFieldIfPrimitive(fields, 'text', unitRecord?.text);

    if (change.entityType === 'layer_unit_content') {
      const layerId = asString(change.entityId.split(':')[1]);
      if (layerId !== '') {
        fields.layerId = layerId;
      }
      pushFieldIfPrimitive(fields, 'value', unitRecord?.text ?? unitRecord?.value);
    }

    return fields;
  }

  if (change.entityType === 'layer') {
    const layer = layers.find((item) => item.id === change.entityId);
    const layerRecord = asRecord(layer);
    fields.exists = Boolean(layer);
    pushFieldIfPrimitive(fields, 'layerId', layerRecord?.id ?? change.entityId);
    pushFieldIfPrimitive(fields, 'layerType', layerRecord?.layerType);
    pushFieldIfPrimitive(fields, 'name', layerRecord?.name);
    pushFieldIfPrimitive(fields, 'modality', layerRecord?.modality);
    return fields;
  }

  if (change.entityType === 'unit_relation') {
    const payload = asRecord(change.payload);
    const [entityHostToken, entityLayerId] = change.entityId.split(':');
    const layerId = asString(payload?.layerId) ?? asString(entityLayerId) ?? '';
    const payloadHostId = asString(payload?.hostTranscriptionLayerId);
    const payloadHostKey = asString(payload?.transcriptionLayerKey);
    const hostLayer = layers.find(
      (layer) =>
        layer.id === payloadHostId ||
        layer.key === payloadHostKey ||
        layer.id === entityHostToken ||
        layer.key === entityHostToken,
    );
    const hostTranscriptionLayerId = payloadHostId ?? hostLayer?.id ?? undefined;
    const transcriptionLayerKey = payloadHostKey ?? hostLayer?.key ?? undefined;
    const exists = layerLinks.some(
      (link) =>
        link.layerId === layerId &&
        ((hostTranscriptionLayerId !== undefined &&
          hostTranscriptionLayerId !== '' &&
          link.hostTranscriptionLayerId === hostTranscriptionLayerId) ||
          (transcriptionLayerKey !== undefined &&
            transcriptionLayerKey !== '' &&
            link.transcriptionLayerKey === transcriptionLayerKey)),
    );
    fields.exists = exists;
    pushFieldIfPrimitive(fields, 'hostTranscriptionLayerId', hostTranscriptionLayerId);
    pushFieldIfPrimitive(fields, 'transcriptionLayerKey', transcriptionLayerKey);
    pushFieldIfPrimitive(fields, 'layerId', layerId);
    fields.enabled = exists;
    return fields;
  }

  return fields;
}

export interface BuildLocalConflictRecordDeps extends BuildLocalSnapshotFieldsDeps {
  localSessionId: string;
  getLocalShadow: (shadowKey: string) => CollaborationRecord | undefined;
}

export function buildLocalConflictRecord(
  change: CollaborationProjectChangeRecord,
  remoteRecord: CollaborationRecord,
  deps: BuildLocalConflictRecordDeps,
): CollaborationRecord {
  const shadowKey = createEntityShadowKey(change.entityType, change.entityId);
  const shadow = deps.getLocalShadow(shadowKey);
  if (shadow) {
    return {
      ...shadow,
      fields: { ...shadow.fields },
    };
  }

  const snapshotFields = buildLocalSnapshotFields(change, deps);
  if (snapshotFields.exists !== true) {
    return {
      ...remoteRecord,
      fields: { ...remoteRecord.fields },
      updatedAt: Math.max(0, remoteRecord.updatedAt - 60_000),
    };
  }

  return {
    entityId: change.entityId,
    sessionId: deps.localSessionId,
    version: Math.max(0, remoteRecord.version),
    updatedAt: Math.max(0, remoteRecord.updatedAt - 60_000),
    fields: snapshotFields,
  };
}
