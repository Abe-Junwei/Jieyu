/**
 * Pure helpers for cloud sync conflict snapshots (no React).
 */
import type { FieldValue } from '../collaborationConflictRuntime';
import type { CollaborationPresenceRecord, ProjectChangeOperation, ProjectEntityType } from './syncTypes';

export const RECOVERY_TIMELINE_PAGE_SIZE = 200;
export const MAX_RECOVERY_TIMELINE_PAGES = 50;

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object') return null;
	return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export function isImportableDatabaseSnapshot(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const source = value as Record<string, unknown>;
	return Number.isFinite(source.schemaVersion) && Boolean(source.collections && typeof source.collections === 'object');
}

export function createLocalSessionId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `local-${crypto.randomUUID()}`;
	}
	return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function toTimestampMs(isoMaybe: string): number {
	const parsed = Date.parse(isoMaybe);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

export function toFieldValueOrUndefined(value: unknown): FieldValue | undefined {
	if (value === null) return null;
	if (typeof value === 'string') return value;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return undefined;
}

export function pushFieldIfPrimitive(fields: Record<string, FieldValue>, key: string, value: unknown): void {
	const primitive = toFieldValueOrUndefined(value);
	if (primitive !== undefined) {
		fields[key] = primitive;
	}
}

export function collectPrimitivePayloadFields(payload: Record<string, unknown> | null): Record<string, FieldValue> {
	if (!payload) return {};
	const fields: Record<string, FieldValue> = {};
	for (const [key, value] of Object.entries(payload)) {
		pushFieldIfPrimitive(fields, key, value);
	}
	return fields;
}

export function createEntityShadowKey(entityType: ProjectEntityType, entityId: string): string {
	return `${entityType}:${entityId}`;
}

export interface ExtractConflictFieldsInput {
	entityType: ProjectEntityType;
	entityId: string;
	opType: ProjectChangeOperation;
	payload: Record<string, unknown> | null;
}

export function extractConflictFields(input: ExtractConflictFieldsInput): Record<string, FieldValue> {
	const fields = collectPrimitivePayloadFields(input.payload);
	fields.opType = input.opType;
	fields.entityType = input.entityType;

	if (input.opType === 'upsert_unit_content') {
		pushFieldIfPrimitive(fields, 'unitId', input.payload?.unitId ?? input.entityId.split(':')[0]);
		pushFieldIfPrimitive(fields, 'layerId', input.payload?.layerId ?? input.entityId.split(':')[1]);
		pushFieldIfPrimitive(fields, 'value', input.payload?.value);
	}

	if (input.opType === 'upsert_unit') {
		const unit = asRecord(input.payload?.unit);
		pushFieldIfPrimitive(fields, 'unitId', input.payload?.unitId ?? unit?.id ?? input.entityId);
		pushFieldIfPrimitive(fields, 'startTime', input.payload?.startTime ?? unit?.startTime);
		pushFieldIfPrimitive(fields, 'endTime', input.payload?.endTime ?? unit?.endTime);
		pushFieldIfPrimitive(fields, 'speakerId', unit?.speakerId);
		pushFieldIfPrimitive(fields, 'text', unit?.text);
	}

	if (input.opType === 'upsert_layer') {
		const layer = asRecord(input.payload?.layer);
		pushFieldIfPrimitive(fields, 'layerId', input.payload?.layerId ?? layer?.id ?? input.entityId);
		pushFieldIfPrimitive(fields, 'layerType', input.payload?.layerType ?? layer?.layerType);
		pushFieldIfPrimitive(fields, 'name', layer?.name);
		pushFieldIfPrimitive(fields, 'modality', input.payload?.modality ?? layer?.modality);
	}

	if (input.opType === 'upsert_relation') {
		pushFieldIfPrimitive(fields, 'transcriptionLayerKey', input.payload?.transcriptionLayerKey);
		pushFieldIfPrimitive(fields, 'layerId', input.payload?.layerId);
		pushFieldIfPrimitive(fields, 'enabled', input.payload?.enabled);
	}

	if (input.opType === 'batch_patch') {
		const unitIds = Array.isArray(input.payload?.unitIds)
			? input.payload.unitIds.map((value) => asString(value)).filter((value): value is string => Boolean(value))
			: [];
		if (unitIds.length > 0) {
			fields.unitCount = unitIds.length;
		}
		pushFieldIfPrimitive(fields, 'action', input.payload?.action);
		pushFieldIfPrimitive(fields, 'value', input.payload?.value);
	}

	if (input.opType === 'delete_entity') {
		fields.deleted = true;
		pushFieldIfPrimitive(fields, 'reason', input.payload?.reason);
	}

	return fields;
}

export function toPresencePersistKey(record: CollaborationPresenceRecord): string {
	return [
		record.state,
		record.focusedEntityType ?? '',
		record.focusedEntityId ?? '',
	].join('|');
}
