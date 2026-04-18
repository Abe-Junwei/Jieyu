import { useEffect, useRef } from 'react';
import { exportDatabaseAsJson } from '../db';
import { getSupabaseUserId, hasSupabaseBrowserClientConfig } from '../collaboration/cloud/collaborationSupabaseFacade';
import type { CollaborationProjectSnapshotRecord } from '../collaboration/cloud/syncTypes';

const AUTO_CLOUD_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

export interface UseCloudSyncAutoSnapshotParams {
	phase: string;
	collaborationProjectId: string;
	isBridgeReady: boolean;
	cloudWritesDisabled: boolean;
	runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
	listProjectSnapshots: (input: { limit: number; offset: number }) => Promise<CollaborationProjectSnapshotRecord[]>;
	createProjectSnapshot: (input: {
		version: number;
		payloadJson: string;
		schemaVersion: number;
		createdBy: string;
		changeCursor: number;
		note: string;
	}) => Promise<unknown>;
	getLatestKnownRevision: () => number;
}

/**
 * Periodic full-database snapshot upload to collaboration cloud.
 */
export function useCloudSyncAutoSnapshot({
	phase,
	collaborationProjectId,
	isBridgeReady,
	cloudWritesDisabled,
	runWithDbMutex,
	listProjectSnapshots,
	createProjectSnapshot,
	getLatestKnownRevision,
}: UseCloudSyncAutoSnapshotParams): void {
	const autoSnapshotBusyRef = useRef(false);

	useEffect(() => {
		if (phase !== 'ready') return;
		if (!collaborationProjectId) return;
		if (!isBridgeReady) return;
		if (!hasSupabaseBrowserClientConfig()) return;
		if (cloudWritesDisabled) return;

		const schedule = () => {
			void (async () => {
				if (autoSnapshotBusyRef.current) return;
				autoSnapshotBusyRef.current = true;
				try {
					const userId = await getSupabaseUserId();
					if (!userId) return;
					const snapshots = await listProjectSnapshots({ limit: 1, offset: 0 });
					const head = snapshots[0];
					const nextVersion = head !== undefined ? head.version + 1 : 1;
					const payloadSnapshot = await runWithDbMutex(() => exportDatabaseAsJson());
					const payloadJson = JSON.stringify(payloadSnapshot);
					await createProjectSnapshot({
						version: nextVersion,
						payloadJson,
						schemaVersion: payloadSnapshot.schemaVersion,
						createdBy: userId,
						changeCursor: getLatestKnownRevision(),
						note: 'auto-interval',
					});
				} catch (error) {
					console.warn('[CloudSync] auto snapshot skipped:', error);
				} finally {
					autoSnapshotBusyRef.current = false;
				}
			})();
		};

		const intervalId = window.setInterval(schedule, AUTO_CLOUD_SNAPSHOT_INTERVAL_MS);
		return () => window.clearInterval(intervalId);
	}, [
		phase,
		collaborationProjectId,
		isBridgeReady,
		cloudWritesDisabled,
		runWithDbMutex,
		listProjectSnapshots,
		createProjectSnapshot,
		getLatestKnownRevision,
	]);
}
