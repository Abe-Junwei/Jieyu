import { useCallback, useMemo, useRef, useState } from 'react';
import { detectLocale } from '../../i18n';
import { useEmbeddingContext } from '../../contexts/EmbeddingContext';
import type { EmbeddingProviderKind } from '../../ai/embeddings/EmbeddingProvider';
import { Check } from 'lucide-react';

const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProviderKind, string> = {
  local: '本地 (Xenova E5 Small)',
  'openai-compatible': 'OpenAI 兼容',
  minimax: 'MiniMax',
};

function formatEmbeddingScore(score: number): string {
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(1)}%`;
}

export function AiEmbeddingCard() {
  const locale = detectLocale();
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

  return (
    <div className="transcription-ai-card">
      <div className="transcription-ai-card-head">
        <span>{isZh ? '向量索引' : 'Embedding Index'}</span>
        <span className="transcription-ai-tag">F28</span>
      </div>
      <div className="ai-card-row ai-card-row-gap-sm ai-card-margin-bottom-sm">
        <label className="ai-card-label">{isZh ? '引擎' : 'Engine'}</label>
        <select
          value={embeddingProviderKind ?? 'local'}
          onChange={(e) => onSetEmbeddingProviderKind?.(e.currentTarget.value as EmbeddingProviderKind)}
          className="ai-card-select"
          title={isZh ? '选择 Embedding 提供商' : 'Select Embedding provider'}
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
          title={isZh ? '测试连接' : 'Test connection'}
        >
          {embeddingAvailability === 'testing' ? '…' : isZh ? '测试' : 'Test'}
        </button>
        {embeddingAvailability === 'available' && (
          <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Check size={12} /> {isZh ? '可用' : 'OK'}
          </span>
        )}
        {embeddingAvailability === 'unavailable' && (
          <span style={{ fontSize: 11, color: '#ef4444' }} title={embeddingError ?? undefined}>
            {embeddingError ? `: ${embeddingError}` : (isZh ? '不可用' : 'Unavailable')}
          </span>
        )}
      </div>
      <div className="ai-embed-actions-grid">
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onBuildUtteranceEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildUtteranceEmbeddings?.()}>{isZh ? '构建当前媒体' : 'Build Current Media'}</button>
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onBuildNotesEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildNotesEmbeddings?.()}>{isZh ? '向量化笔记' : 'Embed Notes'}</button>
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onBuildPdfEmbeddings || !!aiEmbeddingBusy} onClick={() => void onBuildPdfEmbeddings?.()}>{isZh ? '向量化 PDF' : 'Embed PDF'}</button>
        <button type="button" className="icon-btn ai-btn-sm" disabled={!onFindSimilarUtterances || !selectedUtterance || !!aiEmbeddingBusy} onClick={() => void onFindSimilarUtterances?.()}>{isZh ? '检索相似句' : 'Find Similar'}</button>
        <button type="button" className="icon-btn ai-btn-sm ai-btn-min-refresh" disabled={!onRefreshEmbeddingTasks || !!aiEmbeddingBusy} onClick={() => void onRefreshEmbeddingTasks?.()}>{isZh ? '刷新' : 'Refresh'}</button>
      </div>

      {aiEmbeddingProgressLabel && <p className="small-text" style={{ marginBottom: 6 }}>{aiEmbeddingProgressLabel}</p>}
      {aiEmbeddingLastResult && (
        <p className="small-text" style={{ marginBottom: 6 }}>
          {isZh
            ? `最近完成: ${aiEmbeddingLastResult.generated}/${aiEmbeddingLastResult.total}（跳过 ${aiEmbeddingLastResult.skipped}）`
            : `Last run: ${aiEmbeddingLastResult.generated}/${aiEmbeddingLastResult.total} generated (${aiEmbeddingLastResult.skipped} skipped)`}
        </p>
      )}
      {aiEmbeddingLastError && <p className="inspector-warning" style={{ marginBottom: 6 }}>{aiEmbeddingLastError}</p>}
      {aiEmbeddingWarning && <p style={{ marginBottom: 6, fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 6px' }}>{aiEmbeddingWarning}</p>}

      <div className="ai-card-grid-gap">
        <div className="ai-card-row ai-card-row-space">
          <span className="transcription-ai-caption ai-caption-inline">{isZh ? '最近 AI 任务' : 'Recent AI Tasks'}</span>
          <select value={taskTypeFilter} onChange={(e) => setTaskTypeFilter(e.target.value as 'all' | 'embed' | 'gloss')} className="ai-card-filter-select">
            <option value="all">{isZh ? '全部' : 'All'}</option>
            <option value="embed">embed</option>
            <option value="gloss">gloss</option>
          </select>
        </div>
        {visibleAiTasks.length === 0 ? (
          <p className="small-text">{isZh ? '暂无 AI 任务' : 'No AI tasks yet.'}</p>
        ) : (
          visibleAiTasks.slice(0, 6).map((task) => (
            <div key={task.id} className="transcription-match-row ai-match-row-grid">
              <div className="ai-card-row ai-card-row-space">
                <span className="ai-text-11">{`${task.taskType.toUpperCase()} · ${task.status.toUpperCase()}`}</span>
                <em>{new Date(task.updatedAt).toLocaleTimeString()}</em>
              </div>
              <div className="ai-card-row ai-card-row-gap-sm">
                {(task.status === 'pending' || task.status === 'running') && <button type="button" className="icon-btn ai-btn-xs ai-btn-min-refresh" disabled={!onCancelAiTask} onClick={() => void onCancelAiTask?.(task.id)}>{isZh ? '取消' : 'Cancel'}</button>}
                {task.status === 'failed' && <button type="button" className="icon-btn ai-btn-xs ai-btn-min-refresh" disabled={!onRetryAiTask} onClick={() => void onRetryAiTask?.(task.id)}>{isZh ? '重试' : 'Retry'}</button>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ai-card-grid-gap ai-card-margin-top-sm">
        <span className="transcription-ai-caption ai-caption-inline">{isZh ? '相似结果' : 'Similarity Results'}</span>
        {(aiEmbeddingMatches ?? []).length === 0 ? (
          <p className="small-text">{isZh ? '选择一句后可检索相似句。' : 'Select one utterance to search similar results.'}</p>
        ) : (
          (aiEmbeddingMatches ?? []).slice(0, 5).map((item) => {
            const isActive = selectedUtterance?.id === item.utteranceId;
            return (
              <button key={item.utteranceId} type="button" className={`transcription-match-row ai-embed-match-btn ${isActive ? 'ai-embed-match-btn-active' : ''}`} onClick={() => onJumpToEmbeddingMatch?.(item.utteranceId)}>
                <div className="ai-card-row ai-card-row-space">
                  <span className="ai-text-12">{item.label}</span>
                  <em>{formatEmbeddingScore(item.score)}</em>
                </div>
                <div className="ai-text-muted-11">{item.text || (isZh ? '（空文本）' : '(empty text)')}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
