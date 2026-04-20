/**
 * 协同写操作包装 Hook | Cloud-sync write action wrappers
 *
 * 将远端回放逻辑与出站 enqueue 封装在独立 Hook 中，
 * 保持 useTranscriptionData 为薄组合层。
 * Keeps useTranscriptionData as a thin composition layer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranscriptionCollaborationBridge } from './useTranscriptionCollaborationBridge';
import { useCloudSyncAutoSnapshot } from './useCloudSyncAutoSnapshot';
import { generateTraceId } from '../observability/aiTrace';
import { LinguisticService } from '../services/LinguisticService';
import {
	CollaborationPresenceService,
	upsertCollaborationPresenceRecord,
	type CollaborationPresenceLiveMember,
	type PresenceStatePatch,
} from '../collaboration/cloud/CollaborationPresenceService';
import {
	listAccessibleCloudProjects as fetchAccessibleCloudProjects,
	listCloudProjectMembers as fetchCloudProjectMembers,
} from '../collaboration/cloud/CollaborationDirectoryService';
import { getSupabaseUserId, hasSupabaseBrowserClientConfig } from '../collaboration/cloud/collaborationSupabaseFacade';
import {
	RECOVERY_TIMELINE_PAGE_SIZE,
	MAX_RECOVERY_TIMELINE_PAGES,
	asRecord,
	asString,
	asNumber,
	isImportableDatabaseSnapshot,
	createLocalSessionId,
	toTimestampMs,
	createEntityShadowKey,
	extractConflictFields,
	pushFieldIfPrimitive,
	toPresencePersistKey,
} from '../collaboration/cloud/cloudSyncConflictHelpers';
import type {
	CollaborationProjectChangeRecord,
	CollaborationProjectSnapshotRecord,
	ProjectChangeOperation,
	ProjectEntityType,
} from '../collaboration/cloud/syncTypes';
import {
	createConflictResolutionLog,
	detectCollaborationConflicts,
	resolveCollaborationConflicts,
	type CollaborationRecord,
	type ConflictDescriptor,
	type FieldValue,
} from '../collaboration/collaborationConflictRuntime';
import {
	mergeOperationLogs,
	openArbitrationTicket,
	persistCollaborationOperationLogs,
	prioritizeConflicts,
	toArbitrationOperationLogs,
	type ArbitrationTicket,
	type CollaborationOperationLog,
} from '../collaboration/collaborationRulesRuntime';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import type { LayerCreateInput } from './transcriptionTypes';
import type { PerLayerRowFieldPatch } from './useTranscriptionUnitActions';
import {
	deriveCollaborationSyncBadge,
	type CollaborationCloudDirectoryMember,
	type CollaborationCloudDirectoryProject,
} from '../collaboration/cloud/collaborationSyncDerived';

interface ApplyRemoteChangeOptions {
	skipLoadSnapshot?: boolean;
	skipConflictGovernance?: boolean;
}

export interface CloudSyncConflictReviewTicket {
	ticketId: string;
	entityType: ProjectEntityType;
	entityId: string;
	createdAt: number;
	priority: 'critical' | 'high' | 'medium' | 'low';
	conflictCodes: string[];
	remoteChange: CollaborationProjectChangeRecord;
	localRecord: CollaborationRecord;
	remoteRecord: CollaborationRecord;
	conflicts: ConflictDescriptor[];
	arbitration: ArbitrationTicket;
}

// ─── 参数类型 | Input parameter types ───

export interface CloudSyncRawActions {
	saveUnitText: (unitId: string, value: string, layerId?: string) => Promise<void>;
	saveUnitSelfCertainty: (unitIds: Iterable<string>, value: UnitSelfCertainty | undefined) => Promise<void>;
	saveUnitLayerFields: (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => Promise<void>;
	saveUnitTiming: (unitId: string, startTime: number, endTime: number) => Promise<void>;
	deleteUnit: (unitId: string) => Promise<void>;
	deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
	deleteLayer: (layerId: string, options?: { keepUnits?: boolean }) => Promise<void>;
	toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
}

export interface CloudSyncWrappedActions {
	saveUnitText: (unitId: string, value: string, layerId?: string) => Promise<void>;
	saveUnitSelfCertainty: (unitIds: Iterable<string>, value: UnitSelfCertainty | undefined) => Promise<void>;
	saveUnitLayerFields: (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => Promise<void>;
	saveUnitTiming: (unitId: string, startTime: number, endTime: number) => Promise<void>;
	saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
	createUnitFromSelection: (start: number, end: number, options?: { speakerId?: string; focusedLayerId?: string }) => Promise<void>;
	deleteUnit: (unitId: string) => Promise<void>;
	deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
	createLayer: (layerType: 'transcription' | 'translation', input: LayerCreateInput, modality?: 'text' | 'audio' | 'mixed') => Promise<boolean>;
	deleteLayer: (targetLayerId?: string, options?: { keepUnits?: boolean }) => Promise<void>;
	toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
}

export interface UseTranscriptionCloudSyncActionsParams {
	phase: string;
	units: ReadonlyArray<{ id: string; textId?: string }>;
	layers: ReadonlyArray<{ id: string; textId?: string; key?: string; layerType?: string }>;
	unitsRef: { readonly current: ReadonlyArray<{ id: string }> };
	layersRef: { readonly current: ReadonlyArray<{ id: string; key?: string; layerType?: string }> };
	layerLinksRef: { readonly current: ReadonlyArray<{ transcriptionLayerKey: string; hostTranscriptionLayerId?: string; layerId: string }> };
	rawActions: CloudSyncRawActions;
	wrappedActions: CloudSyncWrappedActions;
	runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
	loadSnapshot: () => Promise<void>;
	presenceDisplayName?: string;
	presenceFocus?: {
		entityType?: ProjectEntityType;
		entityId?: string;
	};
}

export function useTranscriptionCloudSyncActions({
	phase,
	units,
	layers,
	unitsRef,
	layersRef,
	layerLinksRef,
	rawActions,
	wrappedActions,
	runWithDbMutex,
	loadSnapshot,
	presenceDisplayName,
	presenceFocus,
}: UseTranscriptionCloudSyncActionsParams) {
	const rawActionsRef = useRef(rawActions);
	rawActionsRef.current = rawActions;
	const wrappedActionsRef = useRef(wrappedActions);
	wrappedActionsRef.current = wrappedActions;

	const collaborationProjectId = useMemo(
		() => (units[0]?.textId ?? layers[0]?.textId ?? '').trim(),
		[layers, units],
	);

	const [presenceMembers, setPresenceMembers] = useState<CollaborationPresenceLiveMember[]>([]);
	const [presenceCurrentUserId, setPresenceCurrentUserId] = useState('');
	const [conflictReviewTickets, setConflictReviewTickets] = useState<CloudSyncConflictReviewTicket[]>([]);
	const [conflictOperationLogs, setConflictOperationLogs] = useState<CollaborationOperationLog[]>([]);
	const presenceServiceRef = useRef<CollaborationPresenceService | null>(null);
	const latestPresenceStateRef = useRef<'online' | 'idle' | 'offline'>('offline');
	const persistedPresenceKeyRef = useRef('');
	const latestFocusKeyRef = useRef('');
	const localSessionIdRef = useRef<string>(createLocalSessionId());
	const localShadowRecordsRef = useRef<Map<string, CollaborationRecord>>(new Map());
	const conflictReviewTicketsRef = useRef<CloudSyncConflictReviewTicket[]>([]);

	const collaborationSupabaseConfigured = useMemo(() => hasSupabaseBrowserClientConfig(), []);

	const [collaborationBrowserOnline, setCollaborationBrowserOnline] = useState(
		typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
	);

	useEffect(() => {
		const onOnline = () => setCollaborationBrowserOnline(true);
		const onOffline = () => setCollaborationBrowserOnline(false);
		if (typeof window === 'undefined') return undefined;
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		return () => {
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
		};
	}, []);

	useEffect(() => {
		conflictReviewTicketsRef.current = conflictReviewTickets;
	}, [conflictReviewTickets]);

	useEffect(() => {
		setConflictReviewTickets([]);
		setConflictOperationLogs([]);
		localShadowRecordsRef.current.clear();
	}, [collaborationProjectId]);

	const appendConflictLogs = useCallback((logs: CollaborationOperationLog[]): void => {
		if (logs.length === 0) return;
		setConflictOperationLogs((prev) => mergeOperationLogs([...prev, ...logs]).slice(-200));
		void persistCollaborationOperationLogs(logs).catch((error) => {
			console.warn('[collaboration] failed to persist conflict operation logs', error);
		});
	}, []);

	const buildRemoteConflictRecord = useCallback((change: CollaborationProjectChangeRecord): CollaborationRecord => {
		const payload = asRecord(change.payload);
		const fields = extractConflictFields({
			entityType: change.entityType,
			entityId: change.entityId,
			opType: change.opType,
			payload,
		});

		return {
			entityId: change.entityId,
			sessionId: asString(change.sessionId) ?? asString(change.clientId) ?? asString(change.actorId) ?? 'remote-session',
			version: Math.max(0, Math.floor(change.projectRevision)),
			updatedAt: toTimestampMs(change.createdAt),
			fields,
			...((change.opType === 'delete_entity' || payload?.deleted === true) ? { deleted: true } : {}),
		};
	}, []);

	const buildLocalSnapshotFields = useCallback((change: CollaborationProjectChangeRecord): Record<string, FieldValue> => {
		const fields: Record<string, FieldValue> = {
			entityType: change.entityType,
		};

		if (change.entityType === 'layer_unit' || change.entityType === 'layer_unit_content') {
			const unitId = asString(change.entityId.split(':')[0]) ?? change.entityId;
			const unit = unitsRef.current.find((item) => item.id === unitId);
			const unitRecord = asRecord(unit);
			fields.exists = Boolean(unit);
			pushFieldIfPrimitive(fields, 'unitId', unitRecord?.id ?? unitId);
			pushFieldIfPrimitive(fields, 'startTime', unitRecord?.startTime);
			pushFieldIfPrimitive(fields, 'endTime', unitRecord?.endTime);
			pushFieldIfPrimitive(fields, 'speakerId', unitRecord?.speakerId);
			pushFieldIfPrimitive(fields, 'text', unitRecord?.text);

			if (change.entityType === 'layer_unit_content') {
				const layerId = asString(change.entityId.split(':')[1]);
				if (layerId) {
					fields.layerId = layerId;
				}
				pushFieldIfPrimitive(fields, 'value', unitRecord?.text ?? unitRecord?.value);
			}

			return fields;
		}

		if (change.entityType === 'layer') {
			const layer = layersRef.current.find((item) => item.id === change.entityId);
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
			const hostLayer = layersRef.current.find((layer) => (
				layer.id === payloadHostId
				|| layer.key === payloadHostKey
				|| layer.id === entityHostToken
				|| layer.key === entityHostToken
			));
			const hostTranscriptionLayerId = payloadHostId ?? hostLayer?.id ?? undefined;
			const transcriptionLayerKey = payloadHostKey ?? hostLayer?.key ?? undefined;
			const exists = layerLinksRef.current.some((link) => (
				link.layerId === layerId
				&& ((hostTranscriptionLayerId && link.hostTranscriptionLayerId === hostTranscriptionLayerId)
					|| (transcriptionLayerKey && link.transcriptionLayerKey === transcriptionLayerKey))
			));
			fields.exists = exists;
			pushFieldIfPrimitive(fields, 'hostTranscriptionLayerId', hostTranscriptionLayerId);
			pushFieldIfPrimitive(fields, 'transcriptionLayerKey', transcriptionLayerKey);
			pushFieldIfPrimitive(fields, 'layerId', layerId);
			fields.enabled = exists;
			return fields;
		}

		return fields;
	}, [layerLinksRef, layersRef, unitsRef]);

	const buildLocalConflictRecord = useCallback((
		change: CollaborationProjectChangeRecord,
		remoteRecord: CollaborationRecord,
	): CollaborationRecord => {
		const shadowKey = createEntityShadowKey(change.entityType, change.entityId);
		const shadow = localShadowRecordsRef.current.get(shadowKey);
		if (shadow) {
			return {
				...shadow,
				fields: { ...shadow.fields },
			};
		}

		const snapshotFields = buildLocalSnapshotFields(change);
		if (snapshotFields.exists !== true) {
			return {
				...remoteRecord,
				fields: { ...remoteRecord.fields },
				updatedAt: Math.max(0, remoteRecord.updatedAt - 60_000),
			};
		}

		return {
			entityId: change.entityId,
			sessionId: localSessionIdRef.current,
			version: Math.max(0, remoteRecord.version),
			updatedAt: Math.max(0, remoteRecord.updatedAt - 60_000),
			fields: snapshotFields,
		};
	}, [buildLocalSnapshotFields]);

	const rememberLocalShadowMutation = useCallback((
		entityType: ProjectEntityType,
		entityId: string,
		opType: ProjectChangeOperation,
		payload: Record<string, unknown> | undefined,
	): void => {
		const shadowKey = createEntityShadowKey(entityType, entityId);
		const previous = localShadowRecordsRef.current.get(shadowKey);

		const next: CollaborationRecord = {
			entityId,
			sessionId: localSessionIdRef.current,
			version: (previous?.version ?? 0) + 1,
			updatedAt: Date.now(),
			fields: {
				...(previous?.fields ?? {}),
				...extractConflictFields({
					entityType,
					entityId,
					opType,
					payload: asRecord(payload),
				}),
			},
			...(opType === 'delete_entity' ? { deleted: true } : {}),
		};

		localShadowRecordsRef.current.set(shadowKey, next);
	}, []);

	const applyRemoteMutation = useCallback(async (
		change: CollaborationProjectChangeRecord,
		options?: ApplyRemoteChangeOptions,
	): Promise<boolean> => {
		const payload = asRecord(change.payload);
		let mutated = false;

		if (change.opType === 'upsert_unit_content') {
			const payloadUnitId = asString(payload?.unitId);
			const payloadLayerId = asString(payload?.layerId);
			const payloadValue = asString(payload?.value) ?? '';
			const fallbackUnitId = asString(change.entityId?.split(':')[0]);
			const unitId = payloadUnitId ?? fallbackUnitId;
			if (unitId) {
				await runWithDbMutex(() => rawActionsRef.current.saveUnitText(unitId, payloadValue, payloadLayerId ?? undefined));
				mutated = true;
			}
		}

		if (change.opType === 'upsert_unit') {
			const fullUnit = asRecord(payload?.unit);
			if (fullUnit) {
				await runWithDbMutex(() => LinguisticService.saveUnit(fullUnit as unknown as import('../db').LayerUnitDocType).then(() => undefined));
				mutated = true;
			} else {
				const unitId = asString(payload?.unitId) ?? asString(change.entityId);
				const startTime = asNumber(payload?.startTime);
				const endTime = asNumber(payload?.endTime);
				if (unitId && startTime !== null && endTime !== null) {
					await runWithDbMutex(() => rawActionsRef.current.saveUnitTiming(unitId, startTime, endTime));
					mutated = true;
				}
			}
		}

		if (change.opType === 'batch_patch') {
			const action = asString(payload?.action);
			const unitIds = Array.isArray(payload?.unitIds)
				? payload?.unitIds.map((item) => asString(item)).filter((item): item is string => Boolean(item))
				: [];

			if (action === 'delete-selected' && unitIds.length > 0) {
				await runWithDbMutex(() => rawActionsRef.current.deleteSelectedUnits(new Set(unitIds)));
				mutated = true;
			}

			const certaintyValue = payload?.value;
			if ((action === null || action === 'self-certainty') && unitIds.length > 0 && certaintyValue !== undefined) {
				await runWithDbMutex(() => rawActionsRef.current.saveUnitSelfCertainty(unitIds, certaintyValue as UnitSelfCertainty | undefined));
				mutated = true;
			}

			const patchRecord = asRecord(payload?.patch);
			if (action === 'layer-fields' && unitIds.length > 0 && patchRecord) {
				await runWithDbMutex(() => rawActionsRef.current.saveUnitLayerFields(unitIds, patchRecord as PerLayerRowFieldPatch));
				mutated = true;
			}
		}

		if (change.opType === 'upsert_layer') {
			const fullLayer = asRecord(payload?.layer);
			if (fullLayer) {
				await runWithDbMutex(() => LinguisticService.upsertLayer(fullLayer as unknown as import('../db').LayerDocType).then(() => undefined));
				mutated = true;
			}
		}

		if (change.opType === 'upsert_relation') {
			const transcriptionLayerKey = asString(payload?.transcriptionLayerKey);
			const hostTranscriptionLayerId = asString(payload?.hostTranscriptionLayerId);
			const [entityHostToken, entityLayerId] = change.entityId.split(':');
			const hostLayer = layersRef.current.find((layer) => (
				layer.id === hostTranscriptionLayerId
				|| layer.key === transcriptionLayerKey
				|| layer.id === entityHostToken
				|| layer.key === entityHostToken
			));
			const resolvedHostId = hostTranscriptionLayerId ?? hostLayer?.id;
			const resolvedHostKey = transcriptionLayerKey ?? hostLayer?.key;
			const layerId = asString(payload?.layerId) ?? asString(entityLayerId);
			const enabled = typeof payload?.enabled === 'boolean' ? payload.enabled : undefined;
			if (resolvedHostKey && layerId && enabled !== undefined) {
				const exists = layerLinksRef.current.some((link) => (
					link.layerId === layerId
					&& ((resolvedHostId && link.hostTranscriptionLayerId === resolvedHostId)
						|| link.transcriptionLayerKey === resolvedHostKey)
				));
				if (exists !== enabled) {
					await runWithDbMutex(() => rawActionsRef.current.toggleLayerLink(resolvedHostKey, layerId));
					mutated = true;
				}
			}
		}

		if (change.opType === 'delete_entity') {
			if (change.entityType === 'layer_unit') {
				const unitId = asString(payload?.unitId) ?? asString(change.entityId);
				if (unitId) {
					await runWithDbMutex(() => rawActionsRef.current.deleteUnit(unitId));
					mutated = true;
				}
			}

			if (change.entityType === 'layer') {
				const layerId = asString(payload?.layerId) ?? asString(change.entityId);
				if (layerId && layerId !== 'layer') {
					const keepUnits = typeof payload?.keepUnits === 'boolean' ? payload.keepUnits : undefined;
					await runWithDbMutex(() => rawActionsRef.current.deleteLayer(layerId, keepUnits === undefined ? undefined : { keepUnits }));
					mutated = true;
				}
			}
		}

		if (mutated && !options?.skipLoadSnapshot) {
			await loadSnapshot();
		}

		return mutated;
	}, [
		layerLinksRef,
		loadSnapshot,
		runWithDbMutex,
	]);

	const applyRemoteChangeToLocal = useCallback(async (
		change: CollaborationProjectChangeRecord,
		options?: ApplyRemoteChangeOptions,
	): Promise<void> => {
		const shadowKey = createEntityShadowKey(change.entityType, change.entityId);
		let resolvedLog: CollaborationOperationLog | null = null;

		if (!options?.skipConflictGovernance) {
			const remoteRecord = buildRemoteConflictRecord(change);
			const localRecord = buildLocalConflictRecord(change, remoteRecord);
			const detection = detectCollaborationConflicts(localRecord, remoteRecord, { stage: 'cross-device' });

			if (detection.hasConflict) {
				const prioritized = prioritizeConflicts(detection.conflicts);
				const hasHighRisk = prioritized.some((item) => item.priority === 'critical' || item.priority === 'high');
				const arbitration = openArbitrationTicket({
					entityId: change.entityId,
					operatorId: asString(change.actorId) ?? 'remote-operator',
					localSessionId: localRecord.sessionId,
					remoteSessionId: remoteRecord.sessionId,
					conflicts: detection.conflicts,
					preferredStrategy: hasHighRisk ? 'manual-review' : 'last-write-wins',
					note: `inbound:${change.opType}`,
				});
				appendConflictLogs(toArbitrationOperationLogs(arbitration));

				if (arbitration.decision.selectedStrategy === 'manual-review') {
					const reviewTicket: CloudSyncConflictReviewTicket = {
						ticketId: arbitration.ticketId,
						entityType: change.entityType,
						entityId: change.entityId,
						createdAt: arbitration.createdAt,
						priority: prioritized[0]?.priority ?? 'medium',
						conflictCodes: detection.conflicts.map((item) => `${item.scope}:${item.code}:${item.fieldKey ?? '*'}`),
						remoteChange: change,
						localRecord,
						remoteRecord,
						conflicts: detection.conflicts,
						arbitration,
					};
					setConflictReviewTickets((prev) => {
						if (prev.some((item) => item.ticketId === reviewTicket.ticketId)) return prev;
						return [reviewTicket, ...prev].slice(0, 100);
					});
					return;
				}

				const resolution = resolveCollaborationConflicts(
					localRecord,
					remoteRecord,
					{ stage: 'cross-device' },
					arbitration.decision.selectedStrategy,
				);
				if (resolution.resolved) {
					resolvedLog = createConflictResolutionLog(
						resolution.resolvedRecord ?? remoteRecord,
						arbitration.decision.selectedStrategy,
						detection.conflicts,
						Date.now(),
						arbitration.ticketId,
						resolution.resolutionTraceId,
					);
				}
			}
		}

		const mutated = await applyRemoteMutation(change, options);

		if (resolvedLog) {
			appendConflictLogs([resolvedLog]);
		}

		if (mutated) {
			localShadowRecordsRef.current.delete(shadowKey);
		}
	}, [
		appendConflictLogs,
		applyRemoteMutation,
		buildLocalConflictRecord,
		buildRemoteConflictRecord,
	]);

	const applyRemoteConflictTicket = useCallback(async (ticketId: string): Promise<boolean> => {
		const ticket = conflictReviewTicketsRef.current.find((item) => item.ticketId === ticketId);
		if (!ticket) return false;

		await applyRemoteChangeToLocal(ticket.remoteChange, {
			skipConflictGovernance: true,
		});

		appendConflictLogs([
			createConflictResolutionLog(
				ticket.remoteRecord,
				'manual-apply-remote',
				ticket.conflicts,
				Date.now(),
				`${ticket.ticketId}:apply-remote`,
				generateTraceId(),
			),
		]);

		setConflictReviewTickets((prev) => prev.filter((item) => item.ticketId !== ticketId));
		localShadowRecordsRef.current.delete(createEntityShadowKey(ticket.entityType, ticket.entityId));
		return true;
	}, [appendConflictLogs, applyRemoteChangeToLocal]);

	const keepLocalConflictTicket = useCallback((ticketId: string): boolean => {
		const ticket = conflictReviewTicketsRef.current.find((item) => item.ticketId === ticketId);
		if (!ticket) return false;

		appendConflictLogs([
			createConflictResolutionLog(
				ticket.localRecord,
				'manual-keep-local',
				ticket.conflicts,
				Date.now(),
				`${ticket.ticketId}:keep-local`,
				generateTraceId(),
			),
		]);

		setConflictReviewTickets((prev) => prev.filter((item) => item.ticketId !== ticketId));
		return true;
	}, [appendConflictLogs]);

	const postponeConflictTicket = useCallback((ticketId: string): void => {
		setConflictReviewTickets((prev) => {
			const index = prev.findIndex((item) => item.ticketId === ticketId);
			if (index < 0) return prev;
			if (index === 0) return prev;
			const next = [...prev];
			const [target] = next.splice(index, 1);
			if (!target) return prev;
			return [target, ...next];
		});
	}, []);

	const {
		isBridgeReady,
		collaborationProtocolGuard,
		collaborationOutboundPendingCount,
		enqueueMutation,
		markProjectRevisionSeen,
		getLatestKnownRevision,
		registerProjectAsset,
		listProjectAssets,
		removeProjectAsset,
		getProjectAssetSignedUrl,
		createProjectSnapshot,
		listProjectSnapshots,
		restoreProjectSnapshotById,
		queryProjectChangeTimeline,
		queryProjectEntityHistory,
	} = useTranscriptionCollaborationBridge({
		enabled: phase === 'ready',
		projectId: collaborationProjectId,
		onApplyRemoteChange: applyRemoteChangeToLocal,
	});

	const collaborationSyncBadge = useMemo(
		() => deriveCollaborationSyncBadge({
			supabaseConfigured: collaborationSupabaseConfigured,
			collaborationProjectId,
			isBridgeReady,
			protocolWritesDisabled: collaborationProtocolGuard.cloudWritesDisabled,
			conflictTicketCount: conflictReviewTickets.length,
			pendingOutboundCount: collaborationOutboundPendingCount,
			browserOnline: collaborationBrowserOnline,
		}),
		[
			collaborationSupabaseConfigured,
			collaborationProjectId,
			isBridgeReady,
			collaborationProtocolGuard.cloudWritesDisabled,
			conflictReviewTickets.length,
			collaborationOutboundPendingCount,
			collaborationBrowserOnline,
		],
	);

	const listAccessibleCloudProjects = useCallback(async (): Promise<CollaborationCloudDirectoryProject[]> => (
		fetchAccessibleCloudProjects()
	), []);

	const listCloudProjectMembers = useCallback(async (projectId: string): Promise<CollaborationCloudDirectoryMember[]> => (
		fetchCloudProjectMembers(projectId)
	), []);

	const restoreProjectSnapshotToLocalById = useCallback(async (
		snapshotId: string,
	): Promise<CollaborationProjectSnapshotRecord> => {
		const restored = await restoreProjectSnapshotById(snapshotId);
		await runWithDbMutex(() => LinguisticService.importFromJSON(restored.payloadJson, 'replace-all').then(() => undefined));
		await loadSnapshot();
		return restored.record;
	}, [loadSnapshot, restoreProjectSnapshotById, runWithDbMutex]);

	useCloudSyncAutoSnapshot({
		phase,
		collaborationProjectId,
		isBridgeReady,
		cloudWritesDisabled: collaborationProtocolGuard.cloudWritesDisabled,
		runWithDbMutex,
		listProjectSnapshots,
		createProjectSnapshot,
		getLatestKnownRevision,
	});

	const persistPresencePatch = useCallback(async (patch: PresenceStatePatch): Promise<void> => {
		const service = presenceServiceRef.current;
		if (!service) return;

		const persisted = service.toPersistedRecord(patch);
		if (!persisted) return;

		const nextPersistKey = toPresencePersistKey(persisted);
		if (persistedPresenceKeyRef.current === nextPersistKey) {
			return;
		}

		if (!hasSupabaseBrowserClientConfig()) {
			persistedPresenceKeyRef.current = nextPersistKey;
			return;
		}

		await upsertCollaborationPresenceRecord(persisted);

		persistedPresenceKeyRef.current = nextPersistKey;
	}, []);

	useEffect(() => {
		if (phase !== 'ready') return;
		if (!collaborationProjectId) return;
		if (!isBridgeReady) return;
		if (!hasSupabaseBrowserClientConfig()) return;

		let cancelled = false;
		const service = new CollaborationPresenceService();
		presenceServiceRef.current = service;
		latestPresenceStateRef.current = 'offline';
		persistedPresenceKeyRef.current = '';
		latestFocusKeyRef.current = '';

		const bootstrapPresence = async () => {
			const userId = await getSupabaseUserId();
			if (!userId || cancelled) return;

			setPresenceCurrentUserId(userId);

			await service.connect({
				projectId: collaborationProjectId,
				userId,
				...(presenceDisplayName ? { displayName: presenceDisplayName } : {}),
			}, (members) => {
				if (cancelled) return;
				setPresenceMembers(members.filter((member) => member.state !== 'offline'));
			});

			const initialPresenceState: 'online' | 'idle' = typeof document !== 'undefined' && document.visibilityState === 'hidden'
				? 'idle'
				: 'online';
			if (initialPresenceState === 'idle') {
				await service.update({ state: 'idle' });
			}
			await persistPresencePatch({ state: initialPresenceState });
			latestPresenceStateRef.current = initialPresenceState;
		};

		void bootstrapPresence().catch((error) => {
			console.warn('[CloudSync] failed to connect presence:', error);
		});

		return () => {
			cancelled = true;
			setPresenceMembers([]);
			setPresenceCurrentUserId('');
			persistedPresenceKeyRef.current = '';
			latestPresenceStateRef.current = 'offline';
			latestFocusKeyRef.current = '';

			const current = presenceServiceRef.current;
			if (!current) return;

			void (async () => {
				try {
					await current.update({ state: 'offline' });
					await persistPresencePatch({ state: 'offline' });
					latestPresenceStateRef.current = 'offline';
				} catch (error) {
					console.warn('[CloudSync] failed to mark presence offline:', error);
				} finally {
					await current.disconnect();
					if (presenceServiceRef.current === current) {
						presenceServiceRef.current = null;
					}
				}
			})();
		};
	}, [
		collaborationProjectId,
		isBridgeReady,
		persistPresencePatch,
		phase,
		presenceDisplayName,
	]);

	useEffect(() => {
		if (phase !== 'ready') return;
		if (!isBridgeReady) return;
		const service = presenceServiceRef.current;
		if (!service) return;

		const entityType = presenceFocus?.entityType;
		const entityId = presenceFocus?.entityId;
		const focusKey = `${entityType ?? ''}:${entityId ?? ''}`;
		if (latestFocusKeyRef.current === focusKey) {
			return;
		}
		latestFocusKeyRef.current = focusKey;

		const focusState: 'online' | 'idle' = latestPresenceStateRef.current === 'idle' ? 'idle' : 'online';
		const patch: PresenceStatePatch = {
			state: focusState,
			...(entityType ? { focusedEntityType: entityType } : {}),
			...(entityId ? { focusedEntityId: entityId } : {}),
		};

		void service.update(patch)
			.then(() => persistPresencePatch(patch))
			.then(() => {
				latestPresenceStateRef.current = focusState;
			})
			.catch((error) => {
				console.warn('[CloudSync] failed to update presence focus:', error);
			});
	}, [
		isBridgeReady,
		persistPresencePatch,
		phase,
		presenceFocus?.entityId,
		presenceFocus?.entityType,
	]);

	useEffect(() => {
		if (phase !== 'ready') return;
		if (!isBridgeReady) return;
		if (typeof document === 'undefined') return;
		if (!presenceServiceRef.current) return;

		let cancelled = false;
		const handleVisibilityChange = () => {
			const service = presenceServiceRef.current;
			if (!service || cancelled) return;

			const nextState: 'online' | 'idle' = document.visibilityState === 'hidden' ? 'idle' : 'online';
			if (latestPresenceStateRef.current === nextState) {
				return;
			}

			const patch: PresenceStatePatch = {
				state: nextState,
				...(presenceFocus?.entityType ? { focusedEntityType: presenceFocus.entityType } : {}),
				...(presenceFocus?.entityId ? { focusedEntityId: presenceFocus.entityId } : {}),
			};

			void service.update(patch)
				.then(() => persistPresencePatch(patch))
				.then(() => {
					latestPresenceStateRef.current = nextState;
				})
				.catch((error) => {
					console.warn('[CloudSync] failed to sync visibility presence state:', error);
				});
		};

		handleVisibilityChange();
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [
		isBridgeReady,
		persistPresencePatch,
		phase,
		presenceFocus?.entityId,
		presenceFocus?.entityType,
	]);

	const autoHydrationDoneProjectIdsRef = useRef<Set<string>>(new Set());
	const autoHydrationRunningProjectIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (phase !== 'ready') return;
		if (!collaborationProjectId) return;
		if (!isBridgeReady) return;
		if (autoHydrationDoneProjectIdsRef.current.has(collaborationProjectId)) return;
		if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) return;

		const hasProjectLocalData = (
			units.some((unit) => unit.textId === collaborationProjectId)
			|| layers.some((layer) => layer.textId === collaborationProjectId)
		);

		let cancelled = false;
		autoHydrationRunningProjectIdRef.current = collaborationProjectId;

		const hydrateFromCloud = async () => {
			let latestRevision = getLatestKnownRevision();

			if (hasProjectLocalData && latestRevision <= 0) {
				const headSnapshots = await listProjectSnapshots({ limit: 1, offset: 0 });
				const probe = await queryProjectChangeTimeline({
					sinceRevision: 1,
					limit: 1,
					offset: 0,
				});
				const cloudHasData = headSnapshots.length > 0 || probe.changes.length > 0;
				if (!cloudHasData) {
					autoHydrationDoneProjectIdsRef.current.add(collaborationProjectId);
					return;
				}
			}

			try {
				if (!hasProjectLocalData) {
					const latestSnapshots = await listProjectSnapshots({ limit: 1, offset: 0 });
					const latestSnapshot = latestSnapshots[0];

					if (latestSnapshot) {
						try {
							const restored = await restoreProjectSnapshotById(latestSnapshot.id);
							const parsedPayload = JSON.parse(restored.payloadJson) as unknown;
							if (isImportableDatabaseSnapshot(parsedPayload)) {
								await runWithDbMutex(() => LinguisticService.importFromJSON(restored.payloadJson, 'replace-all').then(() => undefined));
								if (cancelled) return;
								await loadSnapshot();
								latestRevision = Math.max(latestRevision, latestSnapshot.changeCursor);
							}
						} catch (error) {
							console.warn('[CloudSync] snapshot hydration skipped:', error);
						}
					}
				}

				const sinceRevision = Math.max(1, latestRevision + 1);
				const replayChanges: CollaborationProjectChangeRecord[] = [];
				let offset = 0;

				for (let page = 0; page < MAX_RECOVERY_TIMELINE_PAGES; page += 1) {
					const pageResult = await queryProjectChangeTimeline({
						sinceRevision,
						limit: RECOVERY_TIMELINE_PAGE_SIZE,
						offset,
					});
					const pageChanges = pageResult.changes;
					if (pageChanges.length === 0) break;
					replayChanges.push(...pageChanges);
					if (pageChanges.length < RECOVERY_TIMELINE_PAGE_SIZE) break;
					offset += RECOVERY_TIMELINE_PAGE_SIZE;
				}

				const orderedReplayChanges = replayChanges
					.slice()
					.sort((a, b) => a.projectRevision - b.projectRevision);

				if (orderedReplayChanges.length > 0) {
					for (const change of orderedReplayChanges) {
						if (cancelled) return;
						await applyRemoteChangeToLocal(change, {
							skipLoadSnapshot: true,
							skipConflictGovernance: true,
						});
						latestRevision = Math.max(latestRevision, change.projectRevision);
					}
					if (cancelled) return;
					await loadSnapshot();
				}

				markProjectRevisionSeen(latestRevision);
				if (!cancelled) {
					autoHydrationDoneProjectIdsRef.current.add(collaborationProjectId);
				}
			} finally {
				if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) {
					autoHydrationRunningProjectIdRef.current = null;
				}
			}
		};

		void hydrateFromCloud().catch((error) => {
			if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) {
				autoHydrationRunningProjectIdRef.current = null;
			}
			console.warn('[CloudSync] failed to hydrate from cloud snapshot/timeline:', error);
		});

		return () => {
			cancelled = true;
			if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) {
				autoHydrationRunningProjectIdRef.current = null;
			}
		};
	}, [
		applyRemoteChangeToLocal,
		collaborationProjectId,
		getLatestKnownRevision,
		isBridgeReady,
		layers,
		listProjectSnapshots,
		loadSnapshot,
		markProjectRevisionSeen,
		phase,
		queryProjectChangeTimeline,
		restoreProjectSnapshotById,
		runWithDbMutex,
		units,
	]);

	const cloudSyncedWriteActions = useMemo(() => ({
		saveUnitText: async (unitId: string, value: string, layerId?: string) => {
			await wrappedActionsRef.current.saveUnitText(unitId, value, layerId);
			const entityId = layerId ? `${unitId}:${layerId}` : unitId;
			const payload: Record<string, unknown> = {
				unitId,
				...(layerId ? { layerId } : {}),
				value,
			};
			enqueueMutation({
				entityType: 'layer_unit_content',
				entityId,
				opType: 'upsert_unit_content',
				payload,
			});
			rememberLocalShadowMutation('layer_unit_content', entityId, 'upsert_unit_content', payload);
		},
		saveUnitSelfCertainty: async (
			unitIds: Iterable<string>,
			value: UnitSelfCertainty | undefined,
		) => {
			await wrappedActionsRef.current.saveUnitSelfCertainty(unitIds, value);
			const unitIdList = Array.from(unitIds);
			const entityId = unitIdList.length === 1 ? (unitIdList[0] ?? 'batch:self-certainty') : 'batch:self-certainty';
			const payload: Record<string, unknown> = {
				action: 'self-certainty',
				unitIds: unitIdList,
				value,
			};
			enqueueMutation({
				entityType: 'layer_unit',
				entityId,
				opType: 'batch_patch',
				payload,
			});
			rememberLocalShadowMutation('layer_unit', entityId, 'batch_patch', payload);
		},
		saveUnitLayerFields: async (
			unitIds: Iterable<string>,
			patch: PerLayerRowFieldPatch,
		) => {
			await wrappedActionsRef.current.saveUnitLayerFields(unitIds, patch);
			const unitIdList = Array.from(unitIds);
			const entityId = unitIdList.length === 1 ? (unitIdList[0] ?? 'batch:layer-fields') : 'batch:layer-fields';
			const payload: Record<string, unknown> = {
				action: 'layer-fields',
				unitIds: unitIdList,
				patch,
			};
			enqueueMutation({
				entityType: 'layer_unit',
				entityId,
				opType: 'batch_patch',
				payload,
			});
			rememberLocalShadowMutation('layer_unit', entityId, 'batch_patch', payload);
		},
		saveUnitTiming: async (unitId: string, startTime: number, endTime: number) => {
			await wrappedActionsRef.current.saveUnitTiming(unitId, startTime, endTime);
			const payload: Record<string, unknown> = {
				unitId,
				startTime,
				endTime,
			};
			enqueueMutation({
				entityType: 'layer_unit',
				entityId: unitId,
				opType: 'upsert_unit',
				payload,
			});
			rememberLocalShadowMutation('layer_unit', unitId, 'upsert_unit', payload);
		},
		saveUnitLayerText: async (unitId: string, value: string, layerId: string) => {
			await wrappedActionsRef.current.saveUnitLayerText(unitId, value, layerId);
			const entityId = `${unitId}:${layerId}`;
			const payload: Record<string, unknown> = {
				unitId,
				layerId,
				value,
			};
			enqueueMutation({
				entityType: 'layer_unit_content',
				entityId,
				opType: 'upsert_unit_content',
				payload,
			});
			rememberLocalShadowMutation('layer_unit_content', entityId, 'upsert_unit_content', payload);
		},
		createUnitFromSelection: async (
			start: number,
			end: number,
			options?: { speakerId?: string; focusedLayerId?: string },
		) => {
			const beforeUnitIds = new Set(unitsRef.current.map((row) => row.id));
			await wrappedActionsRef.current.createUnitFromSelection(start, end, options);
			const createdUnit = unitsRef.current.find((row) => !beforeUnitIds.has(row.id));
			const payload: Record<string, unknown> = {
				...(createdUnit ? { unit: createdUnit as unknown as Record<string, unknown> } : {}),
				...(createdUnit?.id ? { unitId: createdUnit.id } : {}),
				start,
				end,
				...(options?.speakerId ? { speakerId: options.speakerId } : {}),
				...(options?.focusedLayerId ? { focusedLayerId: options.focusedLayerId } : {}),
			};
			const entityId = createdUnit?.id ?? 'selection';
			enqueueMutation({
				entityType: 'layer_unit',
				entityId,
				opType: 'upsert_unit',
				payload,
			});
			rememberLocalShadowMutation('layer_unit', entityId, 'upsert_unit', payload);
		},
		deleteUnit: async (unitId: string) => {
			await wrappedActionsRef.current.deleteUnit(unitId);
			const payload: Record<string, unknown> = {
				deleted: true,
				reason: 'delete-unit',
			};
			enqueueMutation({
				entityType: 'layer_unit',
				entityId: unitId,
				opType: 'delete_entity',
				payload,
			});
			rememberLocalShadowMutation('layer_unit', unitId, 'delete_entity', payload);
		},
		deleteSelectedUnits: async (ids: Set<string>) => {
			await wrappedActionsRef.current.deleteSelectedUnits(ids);
			const entityId = `batch:${ids.size}`;
			const payload: Record<string, unknown> = {
				unitIds: Array.from(ids),
				action: 'delete-selected',
			};
			enqueueMutation({
				entityType: 'layer_unit',
				entityId,
				opType: 'batch_patch',
				payload,
			});
			rememberLocalShadowMutation('layer_unit', entityId, 'batch_patch', payload);
		},
		createLayer: async (
			layerType: 'transcription' | 'translation',
			input: LayerCreateInput,
			modality?: 'text' | 'audio' | 'mixed',
		) => {
			const beforeLayerIds = new Set(layersRef.current.map((row) => row.id));
			const created = await wrappedActionsRef.current.createLayer(layerType, input, modality);
			if (created) {
				const createdLayer = layersRef.current.find((row) => !beforeLayerIds.has(row.id));
				const entityId = createdLayer?.id ?? 'layer';
				const payload: Record<string, unknown> = {
					...(createdLayer ? { layer: createdLayer as unknown as Record<string, unknown> } : {}),
					...(createdLayer?.id ? { layerId: createdLayer.id } : {}),
					layerType,
					...(modality ? { modality } : {}),
					input: input as unknown as Record<string, unknown>,
				};
				enqueueMutation({
					entityType: 'layer',
					entityId,
					opType: 'upsert_layer',
					payload,
				});
				rememberLocalShadowMutation('layer', entityId, 'upsert_layer', payload);
			}
			return created;
		},
		deleteLayer: async (targetLayerId?: string, options?: { keepUnits?: boolean }) => {
			await wrappedActionsRef.current.deleteLayer(targetLayerId, options);
			const entityId = targetLayerId ?? 'layer';
			const payload: Record<string, unknown> = {
				...(targetLayerId ? { layerId: targetLayerId } : {}),
				deleted: true,
				...(options?.keepUnits !== undefined ? { keepUnits: options.keepUnits } : {}),
			};
			enqueueMutation({
				entityType: 'layer',
				entityId,
				opType: 'delete_entity',
				payload,
			});
			rememberLocalShadowMutation('layer', entityId, 'delete_entity', payload);
		},
		toggleLayerLink: async (transcriptionLayerKey: string, layerId: string) => {
			const linkExisted = layerLinksRef.current.some((link) => (
				link.transcriptionLayerKey === transcriptionLayerKey && link.layerId === layerId
			));
			const hostLayer = layersRef.current.find((layer) => layer.key === transcriptionLayerKey);
			const hostTranscriptionLayerId = hostLayer?.id;
			await wrappedActionsRef.current.toggleLayerLink(transcriptionLayerKey, layerId);
			const entityId = `${hostTranscriptionLayerId ?? transcriptionLayerKey}:${layerId}`;
			const payload: Record<string, unknown> = {
				transcriptionLayerKey,
				...(hostTranscriptionLayerId ? { hostTranscriptionLayerId } : {}),
				layerId,
				enabled: !linkExisted,
			};
			enqueueMutation({
				entityType: 'unit_relation',
				entityId,
				opType: 'upsert_relation',
				payload,
			});
			rememberLocalShadowMutation('unit_relation', entityId, 'upsert_relation', payload);
		},
	}), [enqueueMutation, rememberLocalShadowMutation, unitsRef, layersRef, layerLinksRef]);

	return {
		collaborationProtocolGuard,
		collaborationSyncBadge,
		listAccessibleCloudProjects,
		listCloudProjectMembers,
		saveUnitText: cloudSyncedWriteActions.saveUnitText,
		saveUnitSelfCertainty: cloudSyncedWriteActions.saveUnitSelfCertainty,
		saveUnitLayerFields: cloudSyncedWriteActions.saveUnitLayerFields,
		saveUnitTiming: cloudSyncedWriteActions.saveUnitTiming,
		saveUnitLayerText: cloudSyncedWriteActions.saveUnitLayerText,
		createUnitFromSelection: cloudSyncedWriteActions.createUnitFromSelection,
		deleteUnit: cloudSyncedWriteActions.deleteUnit,
		deleteSelectedUnits: cloudSyncedWriteActions.deleteSelectedUnits,
		createLayer: cloudSyncedWriteActions.createLayer,
		deleteLayer: cloudSyncedWriteActions.deleteLayer,
		toggleLayerLink: cloudSyncedWriteActions.toggleLayerLink,
		registerProjectAsset,
		listProjectAssets,
		removeProjectAsset,
		getProjectAssetSignedUrl,
		createProjectSnapshot,
		listProjectSnapshots,
		restoreProjectSnapshotById,
		restoreProjectSnapshotToLocalById,
		queryProjectChangeTimeline,
		queryProjectEntityHistory,
		presenceMembers,
		presenceCurrentUserId,
		conflictReviewTickets,
		conflictOperationLogs,
		applyRemoteConflictTicket,
		keepLocalConflictTicket,
		postponeConflictTicket,
	};
}
