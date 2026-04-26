import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb, type AiTaskDoc } from '../db';
import { buildEmbeddingFallbackWarning, readFallbackReason } from '../ai/embeddings/fallbackWarning';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { getAiEmbeddingStateMessages } from '../i18n/messages';

type TaskRunnerLike = {
  cancel: (taskId: string) => boolean;
  retry: (taskId: string) => Promise<string | null>;
};

type AiTaskRuntimeRow = Pick<AiTaskDoc, 'id' | 'taskType' | 'status' | 'resumable' | 'checkpointJson'>;

async function readAiTaskRuntimeRow(taskId: string): Promise<AiTaskRuntimeRow | null> {
  const db = await getDb();
  const doc = await db.collections.ai_tasks.findOne({ selector: { id: taskId } }).exec();
  if (!doc) return null;
  const row = doc.toJSON();
  return {
    id: row.id,
    taskType: row.taskType,
    status: row.status,
    ...(row.resumable !== undefined ? { resumable: row.resumable } : {}),
    ...(row.checkpointJson ? { checkpointJson: row.checkpointJson } : {}),
  };
}

function isDurableAgentLoopTask(row: AiTaskRuntimeRow | null): row is AiTaskRuntimeRow {
  if (!row) return false;
  if (row.taskType !== 'agent_loop') return false;
  return Boolean(row.checkpointJson && row.checkpointJson.trim().length > 0);
}

async function markDurableAgentLoopTaskCancelled(taskId: string): Promise<boolean> {
  const row = await readAiTaskRuntimeRow(taskId);
  if (!isDurableAgentLoopTask(row)) return false;
  if (row.status !== 'pending' && row.status !== 'running') return false;

  const db = await getDb();
  const timestamp = new Date().toISOString();
  await db.collections.ai_tasks.update(taskId, {
    status: 'failed',
    resumable: false,
    errorMessage: 'cancelled_by_user',
    completedAt: timestamp,
    updatedAt: timestamp,
  });
  return true;
}

async function retryDurableAgentLoopTask(taskId: string): Promise<string | null> {
  const row = await readAiTaskRuntimeRow(taskId);
  if (!isDurableAgentLoopTask(row)) return null;
  if (row.status !== 'failed') return null;

  const db = await getDb();
  const timestamp = new Date().toISOString();
  await db.collections.ai_tasks.update(taskId, {
    status: 'pending',
    resumable: true,
    lastHeartbeatAt: timestamp,
    updatedAt: timestamp,
  });
  return taskId;
}

type EmbeddingServiceLike = {
  terminate: () => void;
  buildEmbeddings: (
    sources: Array<{ sourceType: 'unit'; sourceId: string; text: string }>,
    options: { onProgress: (progress: { stage: string; processed: number; total: number; runtime?: unknown }) => void },
  ) => Promise<{
    taskId: string;
    total: number;
    generated: number;
    skipped: number;
    modelId: string;
    modelVersion: string;
    elapsedMs?: number;
    averageBatchMs?: number;
  }>;
  buildNotesEmbeddings: (
    options: { onProgress: (progress: { stage: string; processed: number; total: number; runtime?: unknown }) => void },
  ) => Promise<{
    taskId: string;
    total: number;
    generated: number;
    skipped: number;
    modelId: string;
    modelVersion: string;
    elapsedMs?: number;
    averageBatchMs?: number;
  }>;
  buildPdfEmbeddings: (
    options: { onProgress: (progress: { stage: string; processed: number; total: number; runtime?: unknown }) => void },
  ) => Promise<{
    taskId: string;
    total: number;
    generated: number;
    skipped: number;
    modelId: string;
    modelVersion: string;
    elapsedMs?: number;
    averageBatchMs?: number;
  }>;
};

type EmbeddingSearchServiceLike = Pick<
  EmbeddingSearchService,
  'terminate' | 'searchSimilarUnits' | 'searchMultiSource' | 'searchMultiSourceHybrid'
>;

type UnitLike = {
  id: string;
  startTime: number;
  endTime: number;
};

type AiEmbeddingTaskRow = Pick<AiTaskDoc, 'id' | 'taskType' | 'status' | 'updatedAt' | 'modelId' | 'errorMessage' | 'resumable' | 'handoffReason' | 'checkpointJson'>;

type UseAiEmbeddingStateParams = {
  locale: string;
  enabled?: boolean;
  taskRunner: TaskRunnerLike;
  embeddingService: EmbeddingServiceLike;
  embeddingSearchService: EmbeddingSearchServiceLike;
  selectedUnit: UnitLike | null | undefined;
  unitsOnCurrentMedia: UnitLike[];
  getUnitTextForLayer: (unit: UnitLike, layerId?: string) => string;
  formatTime: (seconds: number) => string;
};

export function useAiEmbeddingState<TUnit extends UnitLike>({
  locale,
  enabled = true,
  taskRunner,
  embeddingService,
  embeddingSearchService,
  selectedUnit,
  unitsOnCurrentMedia,
  getUnitTextForLayer,
  formatTime,
}: Omit<UseAiEmbeddingStateParams, 'selectedUnit' | 'unitsOnCurrentMedia' | 'getUnitTextForLayer'> & {
  selectedUnit: TUnit | null | undefined;
  unitsOnCurrentMedia: TUnit[];
  getUnitTextForLayer: (unit: TUnit, layerId?: string) => string;
}) {
  const [aiEmbeddingBusy, setAiEmbeddingBusy] = useState(false);
  const [aiEmbeddingProgressLabel, setAiEmbeddingProgressLabel] = useState<string | null>(null);
  const [aiEmbeddingLastResult, setAiEmbeddingLastResult] = useState<{
    taskId: string;
    total: number;
    generated: number;
    skipped: number;
    modelId: string;
    modelVersion: string;
    completedAt: string;
    elapsedMs?: number;
    averageBatchMs?: number;
  } | null>(null);
  const [aiEmbeddingTasks, setAiEmbeddingTasks] = useState<AiEmbeddingTaskRow[]>([]);
  const [aiEmbeddingMatches, setAiEmbeddingMatches] = useState<Array<{
    unitId: string;
    score: number;
    label: string;
    text: string;
  }>>([]);
  const [aiEmbeddingLastError, setAiEmbeddingLastError] = useState<string | null>(null);
  const [aiEmbeddingWarning, setAiEmbeddingWarning] = useState<string | null>(null);
  const messages = getAiEmbeddingStateMessages(locale);
  const isMountedRef = useRef(true);
  const activeRequestIdRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      activeRequestIdRef.current += 1;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      embeddingService.terminate();
      embeddingSearchService.terminate();
    };
  }, [embeddingSearchService, embeddingService]);

  const beginRequest = (): number => {
    activeRequestIdRef.current += 1;
    return activeRequestIdRef.current;
  };

  const isRequestActive = (requestId: number): boolean => (
    isMountedRef.current && activeRequestIdRef.current === requestId
  );

  const refreshEmbeddingTasksNow = useCallback(async () => {
    const db = await getDb();
    const rows = await db.collections.ai_tasks.find().exec();
    const normalized = rows
      .map((item) => item.toJSON())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        taskType: item.taskType,
        status: item.status,
        updatedAt: item.updatedAt,
        ...(item.modelId ? { modelId: item.modelId } : {}),
        ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
        ...(item.resumable !== undefined ? { resumable: item.resumable } : {}),
        ...(item.handoffReason ? { handoffReason: item.handoffReason } : {}),
        ...(item.checkpointJson ? { checkpointJson: item.checkpointJson } : {}),
      }));
    if (!isMountedRef.current) return;
    setAiEmbeddingTasks(normalized);
  }, []);

  const requestRefreshEmbeddingTasks = useCallback(async (force = false) => {
    const THROTTLE_MS = 800;
    const now = Date.now();
    const elapsed = now - lastRefreshAtRef.current;

    if (!force && elapsed < THROTTLE_MS) {
      if (refreshTimerRef.current === null) {
        const waitMs = THROTTLE_MS - elapsed;
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          void requestRefreshEmbeddingTasks(true);
        }, waitMs);
      }
      return;
    }

    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    const task = (async () => {
      try {
        await refreshEmbeddingTasksNow();
      } finally {
        lastRefreshAtRef.current = Date.now();
        refreshInFlightRef.current = null;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          void requestRefreshEmbeddingTasks(true);
        }
      }
    })();

    refreshInFlightRef.current = task;
    await task;
  }, [refreshEmbeddingTasksNow]);

  const refreshEmbeddingTasks = useCallback(async () => {
    await requestRefreshEmbeddingTasks(false);
  }, [requestRefreshEmbeddingTasks]);

  useEffect(() => {
    if (!enabled) {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    const runVisibleRefresh = () => {
      if (document.visibilityState === 'visible') {
        void requestRefreshEmbeddingTasks(false);
      }
    };

    runVisibleRefresh();
    document.addEventListener('visibilitychange', runVisibleRefresh);
    const intervalId = window.setInterval(runVisibleRefresh, 15_000);

    return () => {
      document.removeEventListener('visibilitychange', runVisibleRefresh);
      window.clearInterval(intervalId);
    };
  }, [enabled, requestRefreshEmbeddingTasks]);

  const handleCancelAiTask = useCallback(async (taskId: string) => {
    const runtimeCancelled = taskRunner.cancel(taskId);
    const durableCancelled = runtimeCancelled ? false : await markDurableAgentLoopTaskCancelled(taskId);
    if (!runtimeCancelled && !durableCancelled) {
      setAiEmbeddingLastError(messages.cancelUnavailable);
    } else {
      setAiEmbeddingLastError(null);
    }
    await refreshEmbeddingTasks();
  }, [messages.cancelUnavailable, refreshEmbeddingTasks, taskRunner]);

  const handleRetryAiTask = useCallback(async (taskId: string) => {
    let nextTaskId: string | null = null;
    try {
      nextTaskId = await taskRunner.retry(taskId);
    } catch {
      nextTaskId = null;
    }
    if (!nextTaskId) {
      nextTaskId = await retryDurableAgentLoopTask(taskId);
    }
    if (!nextTaskId) {
      setAiEmbeddingLastError(messages.retryUnavailable);
      return;
    }
    setAiEmbeddingLastError(null);
    setAiEmbeddingProgressLabel(messages.reQueued(nextTaskId));
    await refreshEmbeddingTasks();
  }, [messages, refreshEmbeddingTasks, taskRunner]);

  const handleBuildUnitEmbeddings = useCallback(async () => {
    const requestId = beginRequest();
    const sources = unitsOnCurrentMedia
      .map((unit) => ({
        sourceType: 'unit' as const,
        sourceId: unit.id,
        text: getUnitTextForLayer(unit).trim(),
      }))
      .filter((item) => item.text.length > 0);

    if (sources.length === 0) {
      if (isRequestActive(requestId)) {
        setAiEmbeddingLastError(messages.noTextForMedia);
      }
      return;
    }

    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(messages.preparingEmbeddingTask);
    }
    try {
      const result = await embeddingService.buildEmbeddings(sources, {
        onProgress: (progress) => {
          if (!isRequestActive(requestId)) return;
          const fallbackReason = readFallbackReason(progress.runtime as Parameters<typeof readFallbackReason>[0]);
          if (fallbackReason !== null) {
            setAiEmbeddingWarning(buildEmbeddingFallbackWarning(locale, fallbackReason));
          }
          if (progress.stage === 'done') {
            setAiEmbeddingProgressLabel(messages.embeddingBuildCompleted);
            return;
          }
          const prefix = messages.runningPrefix;
          setAiEmbeddingProgressLabel(`${prefix}: ${progress.processed}/${progress.total}`);
        },
      });
      if (!isRequestActive(requestId)) return;
      setAiEmbeddingLastResult({
        ...result,
        completedAt: new Date().toISOString(),
      });
      await refreshEmbeddingTasks();
    } catch (error) {
      if (!isRequestActive(requestId)) return;
      const message = error instanceof Error ? error.message : 'Embedding build failed';
      setAiEmbeddingLastError(message);
      setAiEmbeddingProgressLabel(messages.embeddingBuildFailed);
      await refreshEmbeddingTasks();
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingService, getUnitTextForLayer, locale, messages, refreshEmbeddingTasks, unitsOnCurrentMedia]);

  const handleBuildNotesEmbeddings = useCallback(async () => {
    const requestId = beginRequest();
    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(messages.preparingNotesTask);
    }
    try {
      const result = await embeddingService.buildNotesEmbeddings({
        onProgress: (progress) => {
          if (!isRequestActive(requestId)) return;
          const fallbackReason = readFallbackReason(progress.runtime as Parameters<typeof readFallbackReason>[0]);
          if (fallbackReason !== null) {
            setAiEmbeddingWarning(buildEmbeddingFallbackWarning(locale, fallbackReason));
          }
          if (progress.stage === 'done') {
            setAiEmbeddingProgressLabel(messages.notesCompleted);
            return;
          }
          const prefix = messages.notesRunningPrefix;
          setAiEmbeddingProgressLabel(`${prefix}: ${progress.processed}/${progress.total}`);
        },
      });
      if (!isRequestActive(requestId)) return;
      setAiEmbeddingLastResult({ ...result, completedAt: new Date().toISOString() });
      await refreshEmbeddingTasks();
    } catch (error) {
      if (!isRequestActive(requestId)) return;
      const message = error instanceof Error ? error.message : 'Notes embedding failed';
      setAiEmbeddingLastError(message);
      setAiEmbeddingProgressLabel(messages.notesFailed);
      await refreshEmbeddingTasks();
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingService, messages, refreshEmbeddingTasks]);

  const handleBuildPdfEmbeddings = useCallback(async () => {
    const requestId = beginRequest();
    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(messages.preparingPdfTask);
    }
    try {
      const result = await embeddingService.buildPdfEmbeddings({
        onProgress: (progress) => {
          if (!isRequestActive(requestId)) return;
          const fallbackReason = readFallbackReason(progress.runtime as Parameters<typeof readFallbackReason>[0]);
          if (fallbackReason !== null) {
            setAiEmbeddingWarning(buildEmbeddingFallbackWarning(locale, fallbackReason));
          }
          if (progress.stage === 'done') {
            setAiEmbeddingProgressLabel(messages.pdfCompleted);
            return;
          }
          const prefix = messages.pdfRunningPrefix;
          setAiEmbeddingProgressLabel(`${prefix}: ${progress.processed}/${progress.total}`);
        },
      });
      if (!isRequestActive(requestId)) return;
      setAiEmbeddingLastResult({ ...result, completedAt: new Date().toISOString() });
      await refreshEmbeddingTasks();
    } catch (error) {
      if (!isRequestActive(requestId)) return;
      const message = error instanceof Error ? error.message : 'PDF embedding failed';
      setAiEmbeddingLastError(message);
      setAiEmbeddingProgressLabel(messages.pdfFailed);
      await refreshEmbeddingTasks();
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingService, messages, refreshEmbeddingTasks]);

  const handleFindSimilarUnits = useCallback(async () => {
    const requestId = beginRequest();
    if (!selectedUnit) {
      if (isRequestActive(requestId)) {
        setAiEmbeddingLastError(messages.selectUnitFirst);
      }
      return;
    }

    const queryText = getUnitTextForLayer(selectedUnit).trim();
    if (!queryText) {
      if (isRequestActive(requestId)) {
        setAiEmbeddingLastError(messages.currentUnitEmpty);
      }
      return;
    }

    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(messages.searchingSimilar);
    }
    try {
      const rowLabelById = new Map<string, string>(
        unitsOnCurrentMedia.map((item, index) => [
          item.id,
          `${index + 1} · ${formatTime(item.startTime)}-${formatTime(item.endTime)}`,
        ]),
      );
      const textById = new Map<string, string>(
        unitsOnCurrentMedia.map((item) => [item.id, getUnitTextForLayer(item)]),
      );

      const result = await embeddingSearchService.searchSimilarUnits(queryText, {
        topK: 5,
        candidateSourceIds: unitsOnCurrentMedia.map((item) => item.id),
      });
      if (!isRequestActive(requestId)) return;

      if (result.warningCode === 'query-embedding-unavailable') {
        setAiEmbeddingWarning(messages.noEmbeddingForQueryWarning);
      }

      const mapped = result.matches
        .filter((item) => item.sourceId !== selectedUnit.id)
        .map((item) => ({
          unitId: item.sourceId,
          score: item.score,
          label: rowLabelById.get(item.sourceId) ?? item.sourceId,
          text: textById.get(item.sourceId) ?? '',
        }));
      setAiEmbeddingMatches(mapped);
      if (result.warningCode === 'query-embedding-unavailable' && mapped.length === 0) {
        setAiEmbeddingProgressLabel(messages.noEmbeddingNoResults);
      } else {
        setAiEmbeddingProgressLabel(messages.searchDone(mapped.length));
      }
    } catch (error) {
      if (!isRequestActive(requestId)) return;
      const message = error instanceof Error ? error.message : 'Similarity search failed';
      setAiEmbeddingLastError(message);
      setAiEmbeddingProgressLabel(messages.searchFailed);
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingSearchService, formatTime, getUnitTextForLayer, messages, selectedUnit, unitsOnCurrentMedia]);

  return {
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    setAiEmbeddingLastError,
    refreshEmbeddingTasks,
    handleCancelAiTask,
    handleRetryAiTask,
    handleBuildUnitEmbeddings,
    handleBuildNotesEmbeddings,
    handleBuildPdfEmbeddings,
    handleFindSimilarUnits,
    setAiEmbeddingMatches,
  };
}
