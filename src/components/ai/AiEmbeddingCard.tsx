import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale } from '../../i18n';
import { useEmbeddingContext } from '../../contexts/EmbeddingContext';
import type { EmbeddingProviderKind } from '../../ai/embeddings/EmbeddingProvider';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_MICRO } from '../../utils/jieyuMaterialIcon';
import { getAiEmbeddingCardMessages } from '../../i18n/messages';

function formatEmbeddingScore(score: number): string {
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(1)}%`;
}

export function AiEmbeddingCard() {
  const locale = useLocale();
  const {
    selectedUnit,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    embeddingProviderKind,
    onSetEmbeddingProviderKind,
    onTestEmbeddingProvider,
    onBuildUnitEmbeddings,
    onBuildNotesEmbeddings,
    onBuildPdfEmbeddings,
    onFindSimilarUnits,
    onRefreshEmbeddingTasks,
    onJumpToEmbeddingMatch,
    onCancelAiTask,
    onRetryAiTask,
  } = useEmbeddingContext();

  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'embed' | 'gloss'>('all');
  const [embeddingAvailability, setEmbeddingAvailability] = useState<'idle' | 'testing' | 'available' | 'unavailable'>('idle');
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const lastEmbeddingTestRef = useRef<{ ts: number } | null>(null);
  const embeddingTestVersionRef = useRef(0);
  const embeddingTestMountedRef = useRef(true);
  const CACHE_TTL_MS = 30_000;
  const providerSelectId = useId();
  const isZh = locale === 'zh-CN';
  const messages = getAiEmbeddingCardMessages(isZh);

  useEffect(() => () => {
    embeddingTestMountedRef.current = false;
    embeddingTestVersionRef.current += 1;
  }, []);

  useEffect(() => {
    setEmbeddingAvailability('idle');
    setEmbeddingError(null);
    lastEmbeddingTestRef.current = null;
    embeddingTestVersionRef.current += 1;
  }, [embeddingProviderKind, onTestEmbeddingProvider]);

  const handleTestEmbedding = useCallback(async () => {
    if (!onTestEmbeddingProvider) return;
    if (lastEmbeddingTestRef.current && Date.now() - lastEmbeddingTestRef.current.ts < CACHE_TTL_MS) return;
    const requestVersion = ++embeddingTestVersionRef.current;
    setEmbeddingAvailability('testing');
    setEmbeddingError(null);
    try {
      const result = await onTestEmbeddingProvider();
      if (!embeddingTestMountedRef.current || requestVersion !== embeddingTestVersionRef.current) {
        return;
      }
      lastEmbeddingTestRef.current = { ts: Date.now() };
      setEmbeddingAvailability(result.available ? 'available' : 'unavailable');
      setEmbeddingError(result.available ? null : (result.error ?? 'Provider unavailable'));
    } catch (error) {
      if (!embeddingTestMountedRef.current || requestVersion !== embeddingTestVersionRef.current) {
        return;
      }
      setEmbeddingAvailability('unavailable');
      setEmbeddingError(error instanceof Error && error.message ? error.message : 'Provider unavailable');
    }
  }, [onTestEmbeddingProvider]);

  const visibleAiTasks = useMemo(() => {
    const list = aiEmbeddingTasks ?? [];
    if (taskTypeFilter === 'all') return list;
    return list.filter((task) => task.taskType === taskTypeFilter);
  }, [aiEmbeddingTasks, taskTypeFilter]);

  const taskSummary = useMemo(() => {
    return (aiEmbeddingTasks ?? []).reduce((summary, task) => {
      summary[task.status] += 1;
      return summary;
    }, {
      pending: 0,
      running: 0,
      done: 0,
      failed: 0,
    });
  }, [aiEmbeddingTasks]);

  return (
    <div className="transcription-ai-card">
      <div className="transcription-ai-card-head">
        <span>{messages.title}</span>
        <span className="transcription-ai-tag">F28</span>
      </div>
      <div className="ai-card-row ai-card-row-gap-sm ai-card-margin-bottom-sm">
        <label className="ai-card-label" htmlFor={providerSelectId}>{messages.engineLabel}</label>
        <select
          id={providerSelectId}
          value={embeddingProviderKind ?? 'local'}
          onChange={(e) => onSetEmbeddingProviderKind?.(e.currentTarget.value as EmbeddingProviderKind)}
          className="ai-card-select select-caret"
          title={messages.selectProviderTitle}
        >
          {(['local', 'openai-compatible', 'minimax'] as EmbeddingProviderKind[]).map((k) => (
            <option key={k} value={k}>{messages.providerLabel(k)}</option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn ai-btn-xs"
          disabled={!onTestEmbeddingProvider || embeddingAvailability === 'testing'}
          onClick={() => void handleTestEmbedding()}
          title={messages.testConnectionTitle}
        >
          {embeddingAvailability === 'testing' ? '…' : messages.testButton}
        </button>
        {embeddingAvailability === 'available' && (
          <span className="ai-embed-status ai-embed-status-available">
            <MaterialSymbol name="check" className={JIEYU_MATERIAL_MICRO} /> {messages.available}
          </span>
        )}
        {embeddingAvailability === 'unavailable' && (
          <span className="ai-embed-status ai-embed-status-unavailable" title={embeddingError ?? undefined}>
            {embeddingError ? `${messages.unavailable}: ${embeddingError}` : messages.unavailable}
          </span>
        )}
      </div>
      <div className="ai-embed-actions-grid">
        <button type="button" className="icon-btn ai-btn-action" disabled={!onBuildUnitEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildUnitEmbeddings?.()}>{messages.buildCurrentMedia}</button>
        <button type="button" className="icon-btn ai-btn-action" disabled={!onBuildNotesEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildNotesEmbeddings?.()}>{messages.embedNotes}</button>
        <button type="button" className="icon-btn ai-btn-action" disabled={!onBuildPdfEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildPdfEmbeddings?.()}>{messages.embedPdf}</button>
        <button type="button" className="icon-btn ai-btn-action" disabled={!onFindSimilarUnits || !selectedUnit || !!aiEmbeddingBusy} onClick={() => void onFindSimilarUnits?.()}>{messages.findSimilar}</button>
        <button type="button" className="icon-btn ai-btn-action ai-btn-min-refresh" disabled={!onRefreshEmbeddingTasks || !!aiEmbeddingBusy} onClick={() => void onRefreshEmbeddingTasks?.()}>{messages.refresh}</button>
      </div>

      {aiEmbeddingProgressLabel && <p className="small-text ai-embed-note">{aiEmbeddingProgressLabel}</p>}
      {aiEmbeddingLastResult && (
        <p className="small-text ai-embed-note">
          {messages.lastRun(aiEmbeddingLastResult.generated, aiEmbeddingLastResult.total, aiEmbeddingLastResult.skipped)}
        </p>
      )}
      {aiEmbeddingLastError && <p className="inspector-warning ai-embed-note">{aiEmbeddingLastError}</p>}
      {aiEmbeddingWarning && <p className="ai-embed-warning">{aiEmbeddingWarning}</p>}
      {(taskSummary.pending > 0 || taskSummary.running > 0 || taskSummary.failed > 0 || taskSummary.done > 0) && (
        <div className="ai-card-row ai-card-row-gap-sm ai-card-margin-bottom-sm">
          {taskSummary.pending > 0 && <span className="transcription-ai-tag">{messages.queued(taskSummary.pending)}</span>}
          {taskSummary.running > 0 && <span className="transcription-ai-tag">{messages.running(taskSummary.running)}</span>}
          {taskSummary.failed > 0 && <span className="transcription-ai-tag transcription-ai-tag-danger">{messages.failed(taskSummary.failed)}</span>}
          {taskSummary.done > 0 && <span className="transcription-ai-tag">{messages.done(taskSummary.done)}</span>}
        </div>
      )}

      <div className="ai-card-grid-gap">
        <div className="ai-card-row ai-card-row-space">
          <span className="transcription-ai-caption ai-caption-inline">{messages.recentTasks}</span>
          <select
            value={taskTypeFilter}
            onChange={(e) => setTaskTypeFilter(e.target.value as 'all' | 'embed' | 'gloss')}
            className="ai-card-filter-select select-caret"
            aria-label={messages.recentTasks}
          >
            <option value="all">{messages.all}</option>
            <option value="embed">embed</option>
            <option value="gloss">gloss</option>
          </select>
        </div>
        {visibleAiTasks.length === 0 ? (
          <p className="small-text">{messages.noTasks}</p>
        ) : (
          visibleAiTasks.slice(0, 6).map((task) => (
            <div key={task.id} className="transcription-match-row ai-match-row-grid">
              <div className="ai-card-row ai-card-row-space">
                <span className="ai-text-11">{`${task.taskType.toUpperCase()} · ${task.status.toUpperCase()}`}</span>
                <em>{new Date(task.updatedAt).toLocaleTimeString()}</em>
              </div>
              {(task.modelId || task.errorMessage) && (
                <div className="ai-text-muted-11">
                  {task.modelId ? `${messages.modelLabel}: ${task.modelId}` : ''}
                  {task.modelId && task.errorMessage ? ' · ' : ''}
                  {task.errorMessage ? `${messages.errorLabel}: ${task.errorMessage}` : ''}
                </div>
              )}
              <div className="ai-card-row ai-card-row-gap-sm">
                {(task.status === 'pending' || task.status === 'running') && <button type="button" className="icon-btn ai-btn-xs ai-btn-min-refresh" disabled={!onCancelAiTask} onClick={() => void onCancelAiTask?.(task.id)}>{messages.cancel}</button>}
                {task.status === 'failed' && <button type="button" className="icon-btn ai-btn-xs ai-btn-min-refresh" disabled={!onRetryAiTask} onClick={() => void onRetryAiTask?.(task.id)}>{messages.retry}</button>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ai-card-grid-gap ai-card-margin-top-sm">
        <span className="transcription-ai-caption ai-caption-inline">{messages.similarityResults}</span>
        {(aiEmbeddingMatches ?? []).length === 0 ? (
          <p className="small-text">{messages.similarityHint}</p>
        ) : (
          (aiEmbeddingMatches ?? []).slice(0, 5).map((item) => {
            const isActive = selectedUnit?.id === item.unitId;
            return (
              <button key={item.unitId} type="button" className={`transcription-match-row ai-embed-match-btn ${isActive ? 'ai-embed-match-btn-active' : ''}`} onClick={() => onJumpToEmbeddingMatch?.(item.unitId)}>
                <div className="ai-card-row ai-card-row-space">
                  <span className="ai-text-12">{item.label}</span>
                  <em>{formatEmbeddingScore(item.score)}</em>
                </div>
                <div className="ai-text-muted-11">{item.text || messages.emptyText}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
