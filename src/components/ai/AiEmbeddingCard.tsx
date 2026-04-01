import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocale } from '../../i18n';
import { useEmbeddingContext } from '../../contexts/EmbeddingContext';
import type { EmbeddingProviderKind } from '../../ai/embeddings/EmbeddingProvider';
import { Check } from 'lucide-react';
import { decodeEscapedUnicode } from '../../utils/decodeEscapedUnicode';

const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProviderKind, string> = {
  local: decodeEscapedUnicode('\\u672c\\u5730 (Xenova E5 Small)'),
  'openai-compatible': decodeEscapedUnicode('OpenAI \\u517c\\u5bb9'),
  minimax: 'MiniMax',
};

function formatEmbeddingScore(score: number): string {
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(1)}%`;
}

export function AiEmbeddingCard() {
  const locale = useLocale();
  const {
    selectedUtterance,
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
    onBuildUtteranceEmbeddings,
    onBuildNotesEmbeddings,
    onBuildPdfEmbeddings,
    onFindSimilarUtterances,
    onRefreshEmbeddingTasks,
    onJumpToEmbeddingMatch,
    onCancelAiTask,
    onRetryAiTask,
  } = useEmbeddingContext();

  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'embed' | 'gloss'>('all');
  const [embeddingAvailability, setEmbeddingAvailability] = useState<'idle' | 'testing' | 'available' | 'unavailable'>('idle');
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const lastEmbeddingTestRef = useRef<{ ts: number } | null>(null);
  const CACHE_TTL_MS = 30_000;
  const isZh = locale === 'zh-CN';

  const handleTestEmbedding = useCallback(async () => {
    if (!onTestEmbeddingProvider) return;
    if (lastEmbeddingTestRef.current && Date.now() - lastEmbeddingTestRef.current.ts < CACHE_TTL_MS) return;
    setEmbeddingAvailability('testing');
    setEmbeddingError(null);
    const result = await onTestEmbeddingProvider();
    lastEmbeddingTestRef.current = { ts: Date.now() };
    setEmbeddingAvailability(result.available ? 'available' : 'unavailable');
    setEmbeddingError(result.available ? null : (result.error ?? 'Provider unavailable'));
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
        <span>{isZh ? decodeEscapedUnicode('\\u5411\\u91cf\\u7d22\\u5f15') : 'Embedding Index'}</span>
        <span className="transcription-ai-tag">F28</span>
      </div>
      <div className="ai-card-row ai-card-row-gap-sm ai-card-margin-bottom-sm">
        <label className="ai-card-label">{isZh ? decodeEscapedUnicode('\\u5f15\\u64ce') : 'Engine'}</label>
        <select
          value={embeddingProviderKind ?? 'local'}
          onChange={(e) => onSetEmbeddingProviderKind?.(e.currentTarget.value as EmbeddingProviderKind)}
          className="ai-card-select"
          title={isZh ? decodeEscapedUnicode('\\u9009\\u62e9 Embedding \\u63d0\\u4f9b\\u5546') : 'Select Embedding provider'}
        >
          {(Object.keys(EMBEDDING_PROVIDER_LABELS) as EmbeddingProviderKind[]).map((k) => (
            <option key={k} value={k}>{EMBEDDING_PROVIDER_LABELS[k]}</option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn ai-btn-xs"
          disabled={!onTestEmbeddingProvider || embeddingAvailability === 'testing'}
          onClick={() => void handleTestEmbedding()}
          title={isZh ? decodeEscapedUnicode('\\u6d4b\\u8bd5\\u8fde\\u63a5') : 'Test connection'}
        >
          {embeddingAvailability === 'testing' ? '…' : isZh ? decodeEscapedUnicode('\\u6d4b\\u8bd5') : 'Test'}
        </button>
        {embeddingAvailability === 'available' && (
          <span style={{ fontSize: 11, color: 'var(--state-success-solid)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Check size={12} /> {isZh ? decodeEscapedUnicode('\\u53ef\\u7528') : 'OK'}
          </span>
        )}
        {embeddingAvailability === 'unavailable' && (
          <span style={{ fontSize: 11, color: 'var(--state-danger-solid)' }} title={embeddingError ?? undefined}>
            {embeddingError ? `: ${embeddingError}` : (isZh ? decodeEscapedUnicode('\\u4e0d\\u53ef\\u7528') : 'Unavailable')}
          </span>
        )}
      </div>
      <div className="ai-embed-actions-grid">
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onBuildUtteranceEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildUtteranceEmbeddings?.()}>{isZh ? decodeEscapedUnicode('\\u6784\\u5efa\\u5f53\\u524d\\u5a92\\u4f53') : 'Build Current Media'}</button>
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onBuildNotesEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildNotesEmbeddings?.()}>{isZh ? decodeEscapedUnicode('\\u5411\\u91cf\\u5316\\u7b14\\u8bb0') : 'Embed Notes'}</button>
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onBuildPdfEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildPdfEmbeddings?.()}>{isZh ? decodeEscapedUnicode('\\u5411\\u91cf\\u5316 PDF') : 'Embed PDF'}</button>
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onFindSimilarUtterances || !selectedUtterance || !!aiEmbeddingBusy} onClick={() => void onFindSimilarUtterances?.()}>{isZh ? decodeEscapedUnicode('\\u68c0\\u7d22\\u76f8\\u4f3c\\u53e5') : 'Find Similar'}</button>
        <button type="button" className="icon-btn ai-btn-sm ai-btn-min-refresh" disabled={!onRefreshEmbeddingTasks || !!aiEmbeddingBusy} onClick={() => void onRefreshEmbeddingTasks?.()}>{isZh ? decodeEscapedUnicode('\\u5237\\u65b0') : 'Refresh'}</button>
      </div>

      {aiEmbeddingProgressLabel && <p className="small-text" style={{ marginBottom: 6 }}>{aiEmbeddingProgressLabel}</p>}
      {aiEmbeddingLastResult && (
        <p className="small-text" style={{ marginBottom: 6 }}>
          {isZh
            ? `${decodeEscapedUnicode('\\u6700\\u8fd1\\u5b8c\\u6210')}: ${aiEmbeddingLastResult.generated}/${aiEmbeddingLastResult.total}（${decodeEscapedUnicode('\\u8df3\\u8fc7')} ${aiEmbeddingLastResult.skipped}）`
            : `Last run: ${aiEmbeddingLastResult.generated}/${aiEmbeddingLastResult.total} generated (${aiEmbeddingLastResult.skipped} skipped)`}
        </p>
      )}
      {aiEmbeddingLastError && <p className="inspector-warning" style={{ marginBottom: 6 }}>{aiEmbeddingLastError}</p>}
      {aiEmbeddingWarning && <p style={{ marginBottom: 6, fontSize: 11, color: 'var(--state-warning-text)', background: 'var(--state-warning-bg)', border: '1px solid var(--state-warning-border)', borderRadius: 6, padding: '4px 6px' }}>{aiEmbeddingWarning}</p>}
      {(taskSummary.pending > 0 || taskSummary.running > 0 || taskSummary.failed > 0 || taskSummary.done > 0) && (
        <div className="ai-card-row ai-card-row-gap-sm ai-card-margin-bottom-sm">
          {taskSummary.pending > 0 && <span className="transcription-ai-tag">{isZh ? `${decodeEscapedUnicode('\\u6392\\u961f')} ${taskSummary.pending}` : `Queued ${taskSummary.pending}`}</span>}
          {taskSummary.running > 0 && <span className="transcription-ai-tag">{isZh ? `${decodeEscapedUnicode('\\u8fd0\\u884c')} ${taskSummary.running}` : `Running ${taskSummary.running}`}</span>}
          {taskSummary.failed > 0 && <span className="transcription-ai-tag" style={{ color: 'var(--state-danger-text)', borderColor: 'color-mix(in srgb, var(--state-danger-text) 24%, transparent)', background: 'var(--state-danger-bg)' }}>{isZh ? `${decodeEscapedUnicode('\\u5931\\u8d25')} ${taskSummary.failed}` : `Failed ${taskSummary.failed}`}</span>}
          {taskSummary.done > 0 && <span className="transcription-ai-tag">{isZh ? `${decodeEscapedUnicode('\\u5b8c\\u6210')} ${taskSummary.done}` : `Done ${taskSummary.done}`}</span>}
        </div>
      )}

      <div className="ai-card-grid-gap">
        <div className="ai-card-row ai-card-row-space">
          <span className="transcription-ai-caption ai-caption-inline">{isZh ? decodeEscapedUnicode('\\u6700\\u8fd1 AI \\u4efb\\u52a1') : 'Recent AI Tasks'}</span>
          <select value={taskTypeFilter} onChange={(e) => setTaskTypeFilter(e.target.value as 'all' | 'embed' | 'gloss')} className="ai-card-filter-select">
            <option value="all">{isZh ? decodeEscapedUnicode('\\u5168\\u90e8') : 'All'}</option>
            <option value="embed">embed</option>
            <option value="gloss">gloss</option>
          </select>
        </div>
        {visibleAiTasks.length === 0 ? (
          <p className="small-text">{isZh ? decodeEscapedUnicode('\\u6682\\u65e0 AI \\u4efb\\u52a1') : 'No AI tasks yet.'}</p>
        ) : (
          visibleAiTasks.slice(0, 6).map((task) => (
            <div key={task.id} className="transcription-match-row ai-match-row-grid">
              <div className="ai-card-row ai-card-row-space">
                <span className="ai-text-11">{`${task.taskType.toUpperCase()} · ${task.status.toUpperCase()}`}</span>
                <em>{new Date(task.updatedAt).toLocaleTimeString()}</em>
              </div>
              {(task.modelId || task.errorMessage) && (
                <div className="ai-text-muted-11">
                  {task.modelId ? `${isZh ? decodeEscapedUnicode('\\u6a21\\u578b') : 'Model'}: ${task.modelId}` : ''}
                  {task.modelId && task.errorMessage ? ' · ' : ''}
                  {task.errorMessage ? `${isZh ? decodeEscapedUnicode('\\u9519\\u8bef') : 'Error'}: ${task.errorMessage}` : ''}
                </div>
              )}
              <div className="ai-card-row ai-card-row-gap-sm">
                {(task.status === 'pending' || task.status === 'running') && <button type="button" className="icon-btn ai-btn-xs ai-btn-min-refresh" disabled={!onCancelAiTask} onClick={() => void onCancelAiTask?.(task.id)}>{isZh ? decodeEscapedUnicode('\\u53d6\\u6d88') : 'Cancel'}</button>}
                {task.status === 'failed' && <button type="button" className="icon-btn ai-btn-xs ai-btn-min-refresh" disabled={!onRetryAiTask} onClick={() => void onRetryAiTask?.(task.id)}>{isZh ? decodeEscapedUnicode('\\u91cd\\u8bd5') : 'Retry'}</button>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ai-card-grid-gap ai-card-margin-top-sm">
        <span className="transcription-ai-caption ai-caption-inline">{isZh ? decodeEscapedUnicode('\\u76f8\\u4f3c\\u7ed3\\u679c') : 'Similarity Results'}</span>
        {(aiEmbeddingMatches ?? []).length === 0 ? (
          <p className="small-text">{isZh ? decodeEscapedUnicode('\\u9009\\u62e9\\u4e00\\u53e5\\u540e\\u53ef\\u68c0\\u7d22\\u76f8\\u4f3c\\u53e5。') : 'Select one utterance to search similar results.'}</p>
        ) : (
          (aiEmbeddingMatches ?? []).slice(0, 5).map((item) => {
            const isActive = selectedUtterance?.id === item.utteranceId;
            return (
              <button key={item.utteranceId} type="button" className={`transcription-match-row ai-embed-match-btn ${isActive ? 'ai-embed-match-btn-active' : ''}`} onClick={() => onJumpToEmbeddingMatch?.(item.utteranceId)}>
                <div className="ai-card-row ai-card-row-space">
                  <span className="ai-text-12">{item.label}</span>
                  <em>{formatEmbeddingScore(item.score)}</em>
                </div>
                <div className="ai-text-muted-11">{item.text || (isZh ? decodeEscapedUnicode('（\\u7a7a\\u6587\\u672c）') : '(empty text)')}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
