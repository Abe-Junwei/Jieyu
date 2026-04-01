import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb } from '../db';
import { buildEmbeddingFallbackWarning, readFallbackReason } from '../ai/embeddings/fallbackWarning';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';

type TaskRunnerLike = {
  cancel: (taskId: string) => boolean;
  retry: (taskId: string) => Promise<string | null>;
};

type EmbeddingServiceLike = {
  terminate: () => void;
  buildEmbeddings: (
    sources: Array<{ sourceType: 'utterance'; sourceId: string; text: string }>,
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
  'terminate' | 'searchSimilarUtterances' | 'searchMultiSource' | 'searchMultiSourceHybrid'
>;

type UtteranceLike = {
  id: string;
  startTime: number;
  endTime: number;
};

type UseAiEmbeddingStateParams = {
  locale: string;
  enabled?: boolean;
  taskRunner: TaskRunnerLike;
  embeddingService: EmbeddingServiceLike;
  embeddingSearchService: EmbeddingSearchServiceLike;
  selectedUtterance: UtteranceLike | null | undefined;
  utterancesOnCurrentMedia: UtteranceLike[];
  getUtteranceTextForLayer: (utterance: UtteranceLike, layerId?: string) => string;
  formatTime: (seconds: number) => string;
};

export function useAiEmbeddingState<TUtterance extends UtteranceLike>({
  locale,
  enabled = true,
  taskRunner,
  embeddingService,
  embeddingSearchService,
  selectedUtterance,
  utterancesOnCurrentMedia,
  getUtteranceTextForLayer,
  formatTime,
}: Omit<UseAiEmbeddingStateParams, 'selectedUtterance' | 'utterancesOnCurrentMedia' | 'getUtteranceTextForLayer'> & {
  selectedUtterance: TUtterance | null | undefined;
  utterancesOnCurrentMedia: TUtterance[];
  getUtteranceTextForLayer: (utterance: TUtterance, layerId?: string) => string;
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
  const [aiEmbeddingTasks, setAiEmbeddingTasks] = useState<Array<{
    id: string;
    taskType: 'transcribe' | 'gloss' | 'translate' | 'embed' | 'detect_language';
    status: 'pending' | 'running' | 'done' | 'failed';
    updatedAt: string;
    modelId?: string;
    errorMessage?: string;
  }>>([]);
  const [aiEmbeddingMatches, setAiEmbeddingMatches] = useState<Array<{
    utteranceId: string;
    score: number;
    label: string;
    text: string;
  }>>([]);
  const [aiEmbeddingLastError, setAiEmbeddingLastError] = useState<string | null>(null);
  const [aiEmbeddingWarning, setAiEmbeddingWarning] = useState<string | null>(null);
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
    const ok = taskRunner.cancel(taskId);
    if (!ok) {
      setAiEmbeddingLastError(locale === 'zh-CN' ? '\u4efb\u52a1\u4e0d\u53ef\u53d6\u6d88（\u53ef\u80fd\u5df2\u5b8c\u6210）。' : 'Task cannot be cancelled (may have finished).');
    }
    await refreshEmbeddingTasks();
  }, [locale, refreshEmbeddingTasks, taskRunner]);

  const handleRetryAiTask = useCallback(async (taskId: string) => {
    const nextTaskId = await taskRunner.retry(taskId);
    if (!nextTaskId) {
      setAiEmbeddingLastError(locale === 'zh-CN' ? '\u8be5\u4efb\u52a1\u6682\u4e0d\u652f\u6301\u91cd\u8bd5。' : 'Retry is not available for this task.');
      return;
    }
    setAiEmbeddingProgressLabel(locale === 'zh-CN' ? `\u5df2\u91cd\u65b0\u6392\u961f: ${nextTaskId}` : `Re-queued: ${nextTaskId}`);
    await refreshEmbeddingTasks();
  }, [locale, refreshEmbeddingTasks, taskRunner]);

  const handleBuildUtteranceEmbeddings = useCallback(async () => {
    const requestId = beginRequest();
    const sources = utterancesOnCurrentMedia
      .map((utterance) => ({
        sourceType: 'utterance' as const,
        sourceId: utterance.id,
        text: getUtteranceTextForLayer(utterance).trim(),
      }))
      .filter((item) => item.text.length > 0);

    if (sources.length === 0) {
      if (isRequestActive(requestId)) {
        setAiEmbeddingLastError(locale === 'zh-CN' ? '\u5f53\u524d\u5a92\u4f53\u6ca1\u6709\u53ef\u5411\u91cf\u5316\u6587\u672c。' : 'No text to embed for current media.');
      }
      return;
    }

    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u51c6\u5907 embedding \u4efb\u52a1...' : 'Preparing embedding task...');
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
            setAiEmbeddingProgressLabel(locale === 'zh-CN' ? 'embedding \u6784\u5efa\u5b8c\u6210。' : 'Embedding build completed.');
            return;
          }
          const prefix = locale === 'zh-CN' ? '\u6784\u5efa\u4e2d' : 'Running';
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
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? 'embedding \u6784\u5efa\u5931\u8d25。' : 'Embedding build failed.');
      await refreshEmbeddingTasks();
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingService, getUtteranceTextForLayer, locale, refreshEmbeddingTasks, utterancesOnCurrentMedia]);

  const handleBuildNotesEmbeddings = useCallback(async () => {
    const requestId = beginRequest();
    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u51c6\u5907\u7b14\u8bb0 embedding \u4efb\u52a1...' : 'Preparing notes embedding task...');
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
            setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u7b14\u8bb0 embedding \u5b8c\u6210。' : 'Notes embedding completed.');
            return;
          }
          const prefix = locale === 'zh-CN' ? '\u5411\u91cf\u5316\u7b14\u8bb0' : 'Embedding notes';
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
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u7b14\u8bb0 embedding \u5931\u8d25。' : 'Notes embedding failed.');
      await refreshEmbeddingTasks();
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingService, locale, refreshEmbeddingTasks]);

  const handleBuildPdfEmbeddings = useCallback(async () => {
    const requestId = beginRequest();
    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u51c6\u5907 PDF embedding \u4efb\u52a1...' : 'Preparing PDF embedding task...');
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
            setAiEmbeddingProgressLabel(locale === 'zh-CN' ? 'PDF embedding \u5b8c\u6210。' : 'PDF embedding completed.');
            return;
          }
          const prefix = locale === 'zh-CN' ? '\u5411\u91cf\u5316 PDF' : 'Embedding PDF';
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
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? 'PDF embedding \u5931\u8d25。' : 'PDF embedding failed.');
      await refreshEmbeddingTasks();
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingService, locale, refreshEmbeddingTasks]);

  const handleFindSimilarUtterances = useCallback(async () => {
    const requestId = beginRequest();
    if (!selectedUtterance) {
      if (isRequestActive(requestId)) {
        setAiEmbeddingLastError(locale === 'zh-CN' ? '\u8bf7\u5148\u9009\u62e9\u4e00\u6761\u8bed\u53e5。' : 'Select an utterance first.');
      }
      return;
    }

    const queryText = getUtteranceTextForLayer(selectedUtterance).trim();
    if (!queryText) {
      if (isRequestActive(requestId)) {
        setAiEmbeddingLastError(locale === 'zh-CN' ? '\u5f53\u524d\u8bed\u53e5\u4e3a\u7a7a，\u65e0\u6cd5\u68c0\u7d22。' : 'Current utterance is empty.');
      }
      return;
    }

    if (isRequestActive(requestId)) {
      setAiEmbeddingBusy(true);
      setAiEmbeddingLastError(null);
      setAiEmbeddingWarning(null);
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u68c0\u7d22\u76f8\u4f3c\u8bed\u53e5\u4e2d...' : 'Searching similar utterances...');
    }
    try {
      const rowLabelById = new Map<string, string>(
        utterancesOnCurrentMedia.map((item, index) => [
          item.id,
          `${index + 1} · ${formatTime(item.startTime)}-${formatTime(item.endTime)}`,
        ]),
      );
      const textById = new Map<string, string>(
        utterancesOnCurrentMedia.map((item) => [item.id, getUtteranceTextForLayer(item)]),
      );

      const result = await embeddingSearchService.searchSimilarUtterances(queryText, {
        topK: 5,
        candidateSourceIds: utterancesOnCurrentMedia.map((item) => item.id),
      });
      if (!isRequestActive(requestId)) return;

      if (result.warningCode === 'query-embedding-unavailable') {
        setAiEmbeddingWarning(locale === 'zh-CN'
          ? '\u5f53\u524d\u68c0\u7d22\u672a\u751f\u6210\u53ef\u7528 embedding，\u5df2\u8df3\u8fc7\u76f8\u4f3c\u8bed\u53e5\u53ec\u56de。'
          : 'No usable embedding was generated for this query, so similar-utterance retrieval was skipped.');
      }

      const mapped = result.matches
        .filter((item) => item.sourceId !== selectedUtterance.id)
        .map((item) => ({
          utteranceId: item.sourceId,
          score: item.score,
          label: rowLabelById.get(item.sourceId) ?? item.sourceId,
          text: textById.get(item.sourceId) ?? '',
        }));
      setAiEmbeddingMatches(mapped);
      if (result.warningCode === 'query-embedding-unavailable' && mapped.length === 0) {
        setAiEmbeddingProgressLabel(locale === 'zh-CN'
          ? '\u672a\u751f\u6210\u53ef\u7528 embedding，\u65e0\u6cd5\u5b8c\u6210\u76f8\u4f3c\u8bed\u53e5\u68c0\u7d22。'
          : 'No usable embedding was generated, so similar-utterance retrieval could not run.');
      } else {
        setAiEmbeddingProgressLabel(locale === 'zh-CN' ? `\u68c0\u7d22\u5b8c\u6210：${mapped.length} \u6761` : `Search done: ${mapped.length} items`);
      }
    } catch (error) {
      if (!isRequestActive(requestId)) return;
      const message = error instanceof Error ? error.message : 'Similarity search failed';
      setAiEmbeddingLastError(message);
      setAiEmbeddingProgressLabel(locale === 'zh-CN' ? '\u68c0\u7d22\u5931\u8d25。' : 'Search failed.');
    } finally {
      if (isRequestActive(requestId)) {
        setAiEmbeddingBusy(false);
      }
    }
  }, [embeddingSearchService, formatTime, getUtteranceTextForLayer, locale, selectedUtterance, utterancesOnCurrentMedia]);

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
    handleBuildUtteranceEmbeddings,
    handleBuildNotesEmbeddings,
    handleBuildPdfEmbeddings,
    handleFindSimilarUtterances,
    setAiEmbeddingMatches,
  };
}
