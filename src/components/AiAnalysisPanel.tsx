import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, WandSparkles } from 'lucide-react';
import { formatTime } from '../utils/transcriptionFormatters';
import { detectLocale, t, tf } from '../i18n';
import {
  aiChatProviderDefinitions,
  getAiChatProviderDefinition,
} from '../ai/providers/providerCatalog';
import type { AiChatProviderKind, AiChatSettings } from '../ai/providers/providerCatalog';
import type { ProjectStage } from '../ai/ProjectObserver';
import { useAiPanelContext } from '../contexts/AiPanelContext';

export type AiPanelMode = 'auto' | 'all';

export type AiPanelTask =
  | 'segmentation'
  | 'transcription'
  | 'translation'
  | 'pos_tagging'
  | 'glossing'
  | 'risk_review'
  | 'ai_chat_setup';

export type AiPanelCardKey =
  | 'ai_chat'
  | 'embedding_ops'
  | 'task_observer'
  | 'translation_focus'
  | 'generation_status'
  | 'context_analysis'
  | 'dictionary_matches'
  | 'token_notes'
  | 'pos_tagging'
  | 'phoneme_consistency';

interface AiAnalysisPanelProps {
  isCollapsed: boolean;
}

interface PromptTemplateItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const PROMPT_TEMPLATES_STORAGE_KEY = 'jieyu.ai.promptTemplates.v1';

function newTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function interpolatePromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return vars[key] ?? '';
  });
}

export const AiAnalysisPanel = memo(function AiAnalysisPanel({
  isCollapsed,
}: AiAnalysisPanelProps) {
  const locale = detectLocale();
  const {
    dbName,
    utteranceCount,
    translationLayerCount,
    aiConfidenceAvg,
    selectedUtterance,
    selectedRowMeta,
    selectedAiWarning,
    lexemeMatches,
    onOpenWordNote,
    onOpenMorphemeNote,
    onUpdateTokenPos,
    onBatchUpdateTokenPosByForm,
    aiChatEnabled,
    aiProviderLabel,
    aiChatSettings,
    aiMessages,
    aiIsStreaming,
    aiLastError,
    aiConnectionTestStatus,
    aiConnectionTestMessage,
    aiContextDebugSnapshot,
    aiPendingToolCall,
    aiToolDecisionLogs,
    onUpdateAiChatSettings,
    onTestAiConnection,
    onSendAiMessage,
    onStopAiMessage,
    onClearAiMessages,
    onConfirmPendingToolCall,
    onCancelPendingToolCall,
    aiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    selectedTranslationGapCount,
    onJumpToTranslationGap,
    onChangeAiPanelMode,
    observerStage,
    observerRecommendations,
    onExecuteRecommendation,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    onBuildUtteranceEmbeddings,
    onBuildNotesEmbeddings,
    onBuildPdfEmbeddings,
    onFindSimilarUtterances,
    onRefreshEmbeddingTasks,
    onJumpToEmbeddingMatch,
    onJumpToCitation,
    onCancelAiTask,
    onRetryAiTask,
  } = useAiPanelContext();

  const [batchForm, setBatchForm] = useState('');
  const [batchPos, setBatchPos] = useState('');
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [showPromptLab, setShowPromptLab] = useState(false);
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitleInput, setTemplateTitleInput] = useState('');
  const [templateContentInput, setTemplateContentInput] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'embed' | 'gloss'>('all');
  const posInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const words = selectedUtterance?.words ?? [];
  const visibleAiTasks = useMemo(() => {
    const list = aiEmbeddingTasks ?? [];
    if (taskTypeFilter === 'all') return list;
    return list.filter((task) => task.taskType === taskTypeFilter);
  }, [aiEmbeddingTasks, taskTypeFilter]);
  const taggedCount = useMemo(
    () => words.filter((word) => (word.pos ?? '').trim().length > 0).length,
    [words],
  );
  const displayedWords = useMemo(
    () => (showOnlyUntagged
      ? words.filter((word) => (word.pos ?? '').trim().length === 0)
      : words),
    [showOnlyUntagged, words],
  );
  const hasAiModelName = (selectedUtterance?.ai_metadata?.model ?? '').trim().length > 0;
  const hasAiConfidence = typeof selectedUtterance?.ai_metadata?.confidence === 'number';
  const hasModelInsightData = hasAiModelName || hasAiConfidence;
  const hasAnyAiSignal = aiConfidenceAvg !== null;
  const isZh = locale === 'zh-CN';
  const isDevContextPreviewVisible = import.meta.env.DEV && !!aiContextDebugSnapshot;
  const promptVars = useMemo<Record<string, string>>(() => {
    const selectedText = selectedUtterance?.transcription?.default
      ?? Object.values(selectedUtterance?.transcription ?? {})[0]
      ?? '';
    const currentUtterance = selectedUtterance
      ? `id=${selectedUtterance.id}; text=${selectedText}; time=${formatTime(selectedUtterance.startTime)}-${formatTime(selectedUtterance.endTime)}`
      : '';
    const lexiconSummary = lexemeMatches.length === 0
      ? ''
      : lexemeMatches
        .slice(0, 5)
        .map((item) => Object.values(item.lemma)[0] ?? item.id)
        .join(', ');

    return {
      selected_text: String(selectedText ?? ''),
      current_utterance: currentUtterance,
      lexicon_summary: lexiconSummary,
      project_stage: observerStage ?? '',
      current_row: selectedRowMeta ? String(selectedRowMeta.rowNumber) : '',
    };
  }, [lexemeMatches, observerStage, selectedRowMeta, selectedUtterance]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PromptTemplateItem[];
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .filter((item) => typeof item?.id === 'string' && typeof item?.title === 'string' && typeof item?.content === 'string')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setPromptTemplates(normalized);
    } catch {
      setPromptTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(promptTemplates));
  }, [promptTemplates]);

  const savePromptTemplate = (): void => {
    const title = templateTitleInput.trim();
    const content = templateContentInput.trim();
    if (!title || !content) return;

    const now = new Date().toISOString();
    if (editingTemplateId) {
      setPromptTemplates((prev) => prev
        .map((item) => (item.id === editingTemplateId
          ? { ...item, title, content, updatedAt: now }
          : item
        ))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } else {
      const next: PromptTemplateItem = {
        id: newTemplateId(),
        title,
        content,
        createdAt: now,
        updatedAt: now,
      };
      setPromptTemplates((prev) => [next, ...prev]);
    }

    setEditingTemplateId(null);
    setTemplateTitleInput('');
    setTemplateContentInput('');
  };

  const editPromptTemplate = (item: PromptTemplateItem): void => {
    setEditingTemplateId(item.id);
    setTemplateTitleInput(item.title);
    setTemplateContentInput(item.content);
    setShowPromptLab(true);
  };

  const removePromptTemplate = (id: string): void => {
    setPromptTemplates((prev) => prev.filter((item) => item.id !== id));
    if (editingTemplateId === id) {
      setEditingTemplateId(null);
      setTemplateTitleInput('');
      setTemplateContentInput('');
    }
  };

  const injectPromptTemplate = (content: string): void => {
    const rendered = interpolatePromptTemplate(content, promptVars).trim();
    if (!rendered) return;
    setChatInput(rendered);
  };

  const appendPromptVariable = (name: string): void => {
    const token = `{{${name}}}`;
    setTemplateContentInput((prev) => `${prev}${prev.endsWith(' ') || prev.length === 0 ? '' : ' '}${token}`);
  };
  const providerGroups = useMemo(() => {
    const directKinds: AiChatProviderKind[] = ['deepseek', 'qwen', 'anthropic', 'gemini', 'ollama'];
    const compatibleKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((provider) => [provider.kind, provider]));

    const pick = (kinds: AiChatProviderKind[]) => kinds
      .map((kind) => byKind.get(kind))
      .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

    return [
      { label: '官方直连', items: pick(directKinds) },
      { label: '兼容模式', items: pick(compatibleKinds) },
      { label: '本地/自定义', items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, []);

  const shouldShow = (card: AiPanelCardKey): boolean => {
    if (!aiVisibleCards) return true;
    return aiVisibleCards[card];
  };

  const taskLabel: Record<AiPanelTask, string> = {
    segmentation: t(locale, 'ai.task.segmentation'),
    transcription: t(locale, 'ai.task.transcription'),
    translation: t(locale, 'ai.task.translation'),
    pos_tagging: t(locale, 'ai.task.posTagging'),
    glossing: t(locale, 'ai.task.glossing'),
    risk_review: t(locale, 'ai.task.riskReview'),
    ai_chat_setup: t(locale, 'ai.task.aiChatSetup'),
  };
  const stageLabel: Partial<Record<ProjectStage, string>> = {
    collecting: t(locale, 'ai.stages.collecting'),
    transcribing: t(locale, 'ai.stages.transcribing'),
    glossing: t(locale, 'ai.stages.glossing'),
    reviewing: t(locale, 'ai.stages.reviewing'),
  };
  const formatEmbeddingScore = (score: number): string => `${(Math.max(0, Math.min(1, score)) * 100).toFixed(1)}%`;
  const formatToolDecision = (decision: string): string => {
    if (decision === 'confirmed') return isZh ? '已确认执行' : 'Confirmed';
    if (decision === 'cancelled') return isZh ? '已取消执行' : 'Cancelled';
    if (decision === 'confirm_failed') return isZh ? '确认后执行失败' : 'Confirm failed';
    return decision || (isZh ? '未知' : 'Unknown');
  };

  const focusNextUntaggedToken = (sourceIndex: number): void => {
    for (let i = sourceIndex + 1; i < words.length; i += 1) {
      const nextWord = words[i];
      if (!nextWord || (nextWord.pos ?? '').trim().length > 0 || !nextWord.id) continue;
      const nextInput = posInputRefs.current[nextWord.id];
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        break;
      }
    }
  };

  const commitTokenPos = (
    tokenId: string | undefined,
    nextValueRaw: string,
    prevValueRaw: string | undefined,
    sourceIndex: number,
    focusNext: boolean,
  ): void => {
    if (!tokenId || !onUpdateTokenPos) return;
    const nextPos = nextValueRaw.trim();
    const prevPos = (prevValueRaw ?? '').trim();
    if (nextPos === prevPos) {
      if (focusNext) focusNextUntaggedToken(sourceIndex);
      return;
    }

    const saveTask = onUpdateTokenPos(tokenId, nextPos.length > 0 ? nextPos : null);
    if (focusNext) {
      void Promise.resolve(saveTask).finally(() => {
        focusNextUntaggedToken(sourceIndex);
      });
    }
  };

  return (
    <aside className={`transcription-ai-panel ${isCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}>
      <div className="transcription-ai-header">
        <div className="transcription-ai-header-title">
          <Bot size={16} />
          <h3>{t(locale, 'ai.header.title')}</h3>
        </div>
        <div className="transcription-ai-mode-switch" role="group" aria-label={t(locale, 'ai.header.modeSwitch')}>
          <button
            type="button"
            className={`transcription-ai-mode-btn ${aiPanelMode === 'auto' ? 'is-active' : ''}`}
            disabled={aiPanelMode === 'auto'}
            aria-pressed={aiPanelMode === 'auto'}
            aria-label={t(locale, 'ai.header.focusModeDesc')}
            title={t(locale, 'ai.header.focusModeDesc')}
            onClick={() => onChangeAiPanelMode?.('auto')}
          >
            {t(locale, 'ai.header.focusMode')}
          </button>
          <button
            type="button"
            className={`transcription-ai-mode-btn ${aiPanelMode === 'all' ? 'is-active' : ''}`}
            disabled={aiPanelMode === 'all'}
            aria-pressed={aiPanelMode === 'all'}
            aria-label={t(locale, 'ai.header.allModeDesc')}
            title={t(locale, 'ai.header.allModeDesc')}
            onClick={() => onChangeAiPanelMode?.('all')}
          >
            {t(locale, 'ai.header.allMode')}
          </button>
        </div>
      </div>

      {shouldShow('ai_chat') && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.chat.title')}</span>
              <span className="transcription-ai-tag">{aiProviderLabel ?? t(locale, 'ai.chat.provider')}</span>
            </div>
            {!aiChatEnabled ? (
              <p className="small-text">{t(locale, 'ai.chat.disabled')}</p>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, alignItems: 'flex-start' }}>
                    <span className="small-text" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', transform: 'translateY(-2px)', display: 'block', marginBottom: 4 }}>{t(locale, 'ai.chat.provider')}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                      <select
                        value={aiChatSettings?.providerKind ?? 'mock'}
                        onChange={(e) => onUpdateAiChatSettings?.({
                          providerKind: e.currentTarget.value as AiChatSettings['providerKind'],
                        })}
                        style={{ height: 28, fontSize: 12 }}
                      >
                        {providerGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((provider) => (
                              <option key={provider.kind} value={provider.kind}>{provider.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {activeProviderDefinition.fields.length > 0 && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ height: 24, minWidth: 56, fontSize: 12 }}
                          onClick={() => setShowProviderConfig((prev) => !prev)}
                        >
                          {showProviderConfig ? t(locale, 'ai.chat.back') : '配置'}
                        </button>
                      )}
                    </div>
                  </div>
                  {activeProviderDefinition.fields.length > 0 && aiChatSettings && showProviderConfig && (
                    <>
                      {activeProviderDefinition.fields.map((field) => (
                        <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 6, alignItems: 'center' }}>
                          <span className="small-text">{field.label}</span>
                          {field.type === 'select' ? (
                            <select
                              value={String(aiChatSettings[field.key] ?? '')}
                              onChange={(e) => onUpdateAiChatSettings?.({
                                [field.key]: e.currentTarget.value,
                              } as Partial<AiChatSettings>)}
                              style={{ height: 28, fontSize: 12 }}
                            >
                              {(field.options ?? []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type}
                              value={String(aiChatSettings[field.key] ?? '')}
                              placeholder={field.placeholder}
                              onChange={(e) => onUpdateAiChatSettings?.({
                                [field.key]: e.currentTarget.value,
                              } as Partial<AiChatSettings>)}
                              style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                            />
                          )}
                        </div>
                      ))}
                      <p className="small-text" style={{ margin: 0 }}>
                        {tf(locale, 'ai.chat.configNote', { provider: activeProviderDefinition.description })}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={!onTestAiConnection || aiConnectionTestStatus === 'testing'}
                          style={{ height: 28, minWidth: 84, fontSize: 12 }}
                          onClick={() => {
                            if (!onTestAiConnection) return;
                            void onTestAiConnection();
                          }}
                        >
                          {aiConnectionTestStatus === 'testing' ? t(locale, 'ai.chat.testing') : t(locale, 'ai.chat.testConnection')}
                        </button>
                        {aiConnectionTestMessage && (
                          <span
                            className="small-text"
                            style={{
                              color: aiConnectionTestStatus === 'error' ? '#b91c1c' : '#166534',
                            }}
                          >
                            {aiConnectionTestMessage}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 12 }}>{isZh ? 'Prompt 实验室' : 'Prompt Lab'}</strong>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ height: 24, minWidth: 84, fontSize: 12 }}
                      onClick={() => setShowPromptLab((prev) => !prev)}
                    >
                      {showPromptLab ? (isZh ? '收起' : 'Hide') : (isZh ? '展开' : 'Open')}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                    {promptTemplates.length === 0 ? (
                      <p className="small-text" style={{ margin: 0 }}>
                        {isZh ? '暂无模板。可创建并在对话前一键注入。' : 'No template yet. Create one and inject before chatting.'}
                      </p>
                    ) : (
                      promptTemplates.slice(0, 4).map((item) => (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 6, alignItems: 'center' }}>
                          <span className="small-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.content}>
                            {item.title}
                          </span>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ height: 24, minWidth: 56, fontSize: 12 }}
                            onClick={() => injectPromptTemplate(item.content)}
                          >
                            {isZh ? '注入' : 'Inject'}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ height: 24, minWidth: 48, fontSize: 12 }}
                            onClick={() => editPromptTemplate(item)}
                          >
                            {isZh ? '编辑' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ height: 24, minWidth: 48, fontSize: 12 }}
                            onClick={() => removePromptTemplate(item.id)}
                          >
                            {isZh ? '删除' : 'Delete'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {showPromptLab && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input
                        type="text"
                        value={templateTitleInput}
                        placeholder={isZh ? '模板名称（如：语法速写）' : 'Template title'}
                        onChange={(e) => setTemplateTitleInput(e.currentTarget.value)}
                        style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                      />
                      <textarea
                        value={templateContentInput}
                        placeholder={isZh ? '模板内容，可含 {{selected_text}} {{current_utterance}} {{lexicon_summary}}' : 'Template body with {{selected_text}} {{current_utterance}} {{lexicon_summary}}'}
                        onChange={(e) => setTemplateContentInput(e.currentTarget.value)}
                        style={{ minHeight: 80, fontSize: 12, padding: 8, resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {['selected_text', 'current_utterance', 'lexicon_summary', 'project_stage', 'current_row'].map((token) => (
                          <button
                            key={token}
                            type="button"
                            className="icon-btn"
                            style={{ height: 22, minWidth: 80, fontSize: 11 }}
                            onClick={() => appendPromptVariable(token)}
                          >
                            {`{{${token}}}`}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ height: 26, minWidth: 80, fontSize: 12 }}
                          disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0}
                          onClick={savePromptTemplate}
                        >
                          {editingTemplateId ? (isZh ? '更新' : 'Update') : (isZh ? '保存模板' : 'Save')}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ height: 26, minWidth: 80, fontSize: 12 }}
                          disabled={templateContentInput.trim().length === 0}
                          onClick={() => injectPromptTemplate(templateContentInput)}
                        >
                          {isZh ? '注入到输入框' : 'Inject to input'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {isDevContextPreviewVisible && (
                  <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: 12 }}>{isZh ? '上下文预览（开发）' : 'Context Preview (Dev)'}</strong>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ height: 24, minWidth: 84, fontSize: 12 }}
                        onClick={() => setShowContextPreview((prev) => !prev)}
                      >
                        {showContextPreview ? (isZh ? '收起' : 'Hide') : (isZh ? '展开' : 'Open')}
                      </button>
                    </div>
                    {showContextPreview && aiContextDebugSnapshot && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <p className="small-text" style={{ margin: 0 }}>
                          {`persona=${aiContextDebugSnapshot.persona} | history=${aiContextDebugSnapshot.historyChars}/${aiContextDebugSnapshot.historyCharBudget} chars (${aiContextDebugSnapshot.historyCount} msgs) | context=${aiContextDebugSnapshot.contextChars}/${aiContextDebugSnapshot.maxContextChars}`}
                        </p>
                        {!aiContextDebugSnapshot.enabled && (
                          <p className="small-text" style={{ margin: 0 }}>
                            {isZh
                              ? '当前仅展示最近一次上下文快照。启用调试：localStorage.setItem("jieyu.aiChat.debugContext", "1")'
                              : 'Showing latest snapshot only. Enable debug: localStorage.setItem("jieyu.aiChat.debugContext", "1")'}
                          </p>
                        )}
                        <pre
                          style={{
                            margin: 0,
                            maxHeight: 180,
                            overflow: 'auto',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            padding: 8,
                            fontSize: 11,
                            lineHeight: 1.35,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {aiContextDebugSnapshot.contextPreview || (isZh ? '（无上下文）' : '(no context)')}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ height: 180, minHeight: 180, maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6, marginBottom: 8 }}>
                  {(aiMessages ?? []).length === 0 ? (
                    <p className="small-text">{t(locale, 'ai.chat.noMessages')}</p>
                  ) : (
                    (aiMessages ?? []).map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          fontSize: 12,
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: msg.role === 'user' ? '#eef2ff' : '#f3f4f6',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <strong style={{ marginRight: 6 }}>{msg.role === 'user' ? t(locale, 'ai.chat.roleUser') : t(locale, 'ai.chat.roleAi')}</strong>
                        <span>{msg.content || (msg.status === 'streaming' ? '...' : (msg.status === 'aborted' ? '⏹ 已中断' : ''))}</span>
                        {msg.role === 'assistant' && (msg.citations ?? []).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {(msg.citations ?? []).map((citation) => (
                              <button
                                key={`${msg.id}-${citation.type}-${citation.refId}`}
                                style={{
                                  fontSize: 10,
                                  lineHeight: '14px',
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#334155',
                                  cursor: onJumpToCitation ? 'pointer' : 'default',
                                }}
                                title={`${citation.type}:${citation.refId}`}
                                type="button"
                                onClick={() => {
                                  if (!onJumpToCitation) return;
                                  void onJumpToCitation(citation.type, citation.refId, citation);
                                }}
                                disabled={!onJumpToCitation}
                              >
                                {citation.label ?? `${citation.type}:${citation.refId}`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {aiLastError && <p className="inspector-warning">{tf(locale, 'ai.chat.error', { error: aiLastError })}</p>}
                {aiPendingToolCall && (
                  <div
                    style={{
                      border: '1px solid #f59e0b',
                      background: '#fffbeb',
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginBottom: 8,
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                      {isZh ? '高风险工具调用待确认' : 'High-risk tool call pending confirmation'}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      {isZh ? '操作' : 'Action'}: {aiPendingToolCall.call.name}
                    </div>
                    {aiPendingToolCall.riskSummary && (
                      <div style={{ fontSize: 12, color: '#92400e' }}>
                        {isZh ? '风险摘要' : 'Risk summary'}: {aiPendingToolCall.riskSummary}
                      </div>
                    )}
                    {(aiPendingToolCall.impactPreview ?? []).length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#7c2d12' }}>
                        {(aiPendingToolCall.impactPreview ?? []).slice(0, 4).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ height: 26, minWidth: 72, fontSize: 12 }}
                        disabled={!onConfirmPendingToolCall}
                        onClick={() => {
                          if (!onConfirmPendingToolCall) return;
                          void onConfirmPendingToolCall();
                        }}
                      >
                        {isZh ? '确认执行' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ height: 26, minWidth: 72, fontSize: 12 }}
                        disabled={!onCancelPendingToolCall}
                        onClick={() => {
                          if (!onCancelPendingToolCall) return;
                          void onCancelPendingToolCall();
                        }}
                      >
                        {isZh ? '取消' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
                {(aiToolDecisionLogs ?? []).length > 0 && (
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginBottom: 8,
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {isZh ? '最近 AI 决策日志' : 'Recent AI Decisions'}
                    </div>
                    {(aiToolDecisionLogs ?? []).slice(0, 4).map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                        <span>{item.toolName || (isZh ? '未知工具' : 'unknown tool')} · {formatToolDecision(item.decision)}</span>
                        <em>{new Date(item.timestamp).toLocaleTimeString()}</em>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 6 }}>
                  <input
                    type="text"
                    value={chatInput}
                    placeholder={t(locale, 'ai.chat.inputPlaceholder')}
                    onChange={(e) => setChatInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.shiftKey) return;
                      e.preventDefault();
                      const text = chatInput.trim();
                      if (!text || !onSendAiMessage) return;
                      void onSendAiMessage(text);
                      setChatInput('');
                    }}
                    style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={!onSendAiMessage || aiIsStreaming}
                    style={{ height: 30, minWidth: 52, fontSize: 12 }}
                    onClick={() => {
                      const text = chatInput.trim();
                      if (!text || !onSendAiMessage) return;
                      void onSendAiMessage(text);
                      setChatInput('');
                    }}
                  >
                    {t(locale, 'ai.chat.send')}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={!onStopAiMessage || !aiIsStreaming}
                    style={{ height: 30, minWidth: 52, fontSize: 12 }}
                    onClick={() => onStopAiMessage?.()}
                  >
                    {t(locale, 'ai.chat.stop')}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={!onClearAiMessages}
                    style={{ height: 30, minWidth: 52, fontSize: 12 }}
                    onClick={() => onClearAiMessages?.()}
                  >
                    {t(locale, 'ai.chat.clear')}
                  </button>
                </div>
              </>
            )}
          </div>
      )}

      {shouldShow('embedding_ops') && (
        <div className="transcription-ai-card">
          <div className="transcription-ai-card-head">
            <span>{isZh ? '向量索引' : 'Embedding Index'}</span>
            <span className="transcription-ai-tag">F28</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              className="icon-btn"
              style={{ height: 28, fontSize: 12 }}
              disabled={!onBuildUtteranceEmbeddings || !!aiEmbeddingBusy}
              onClick={() => {
                if (!onBuildUtteranceEmbeddings) return;
                void onBuildUtteranceEmbeddings();
              }}
            >
              {isZh ? '构建当前媒体' : 'Build Current Media'}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ height: 28, fontSize: 12 }}
              disabled={!onBuildNotesEmbeddings || !!aiEmbeddingBusy}
              onClick={() => {
                if (!onBuildNotesEmbeddings) return;
                void onBuildNotesEmbeddings();
              }}
            >
              {isZh ? '向量化笔记' : 'Embed Notes'}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ height: 28, fontSize: 12 }}
              disabled={!onBuildPdfEmbeddings || !!aiEmbeddingBusy}
              onClick={() => {
                if (!onBuildPdfEmbeddings) return;
                void onBuildPdfEmbeddings();
              }}
            >
              {isZh ? '向量化 PDF' : 'Embed PDF'}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ height: 28, fontSize: 12 }}
              disabled={!onFindSimilarUtterances || !selectedUtterance || !!aiEmbeddingBusy}
              onClick={() => {
                if (!onFindSimilarUtterances) return;
                void onFindSimilarUtterances();
              }}
            >
              {isZh ? '检索相似句' : 'Find Similar'}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ height: 28, minWidth: 64, fontSize: 12 }}
              disabled={!onRefreshEmbeddingTasks || !!aiEmbeddingBusy}
              onClick={() => {
                if (!onRefreshEmbeddingTasks) return;
                void onRefreshEmbeddingTasks();
              }}
            >
              {isZh ? '刷新' : 'Refresh'}
            </button>
          </div>

          {aiEmbeddingProgressLabel && (
            <p className="small-text" style={{ marginBottom: 6 }}>{aiEmbeddingProgressLabel}</p>
          )}
          {aiEmbeddingLastResult && (
            <p className="small-text" style={{ marginBottom: 6 }}>
              {isZh
                ? `最近完成: ${aiEmbeddingLastResult.generated}/${aiEmbeddingLastResult.total}（跳过 ${aiEmbeddingLastResult.skipped}）`
                : `Last run: ${aiEmbeddingLastResult.generated}/${aiEmbeddingLastResult.total} generated (${aiEmbeddingLastResult.skipped} skipped)`}
              {typeof aiEmbeddingLastResult.elapsedMs === 'number' && (
                isZh
                  ? ` · 用时 ${(aiEmbeddingLastResult.elapsedMs / 1000).toFixed(2)}s`
                  : ` · ${(aiEmbeddingLastResult.elapsedMs / 1000).toFixed(2)}s`
              )}
              {typeof aiEmbeddingLastResult.averageBatchMs === 'number' && aiEmbeddingLastResult.averageBatchMs > 0 && (
                isZh
                  ? ` · 批均 ${aiEmbeddingLastResult.averageBatchMs}ms`
                  : ` · avg batch ${aiEmbeddingLastResult.averageBatchMs}ms`
              )}
            </p>
          )}
          {aiEmbeddingLastError && (
            <p className="inspector-warning" style={{ marginBottom: 6 }}>{aiEmbeddingLastError}</p>
          )}
          {aiEmbeddingWarning && (
            <p
              style={{
                marginBottom: 6,
                fontSize: 11,
                color: '#92400e',
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 6,
                padding: '4px 6px',
              }}
            >
              {aiEmbeddingWarning}
            </p>
          )}

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="transcription-ai-caption" style={{ marginBottom: 0 }}>
                {isZh ? '最近 AI 任务' : 'Recent AI Tasks'}
              </span>
              <select
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value as 'all' | 'embed' | 'gloss')}
                style={{ height: 24, fontSize: 11, borderRadius: 6, border: '1px solid #d1d5db' }}
              >
                <option value="all">{isZh ? '全部' : 'All'}</option>
                <option value="embed">embed</option>
                <option value="gloss">gloss</option>
              </select>
            </div>
            {visibleAiTasks.length === 0 ? (
              <p className="small-text">{isZh ? '暂无 AI 任务' : 'No AI tasks yet.'}</p>
            ) : (
              visibleAiTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="transcription-match-row" style={{ marginTop: 0, display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11 }}>{`${task.taskType.toUpperCase()} · ${task.status.toUpperCase()}`}</span>
                    <em>{new Date(task.updatedAt).toLocaleTimeString()}</em>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(task.status === 'pending' || task.status === 'running') && (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ height: 24, minWidth: 64, fontSize: 11 }}
                        disabled={!onCancelAiTask}
                        onClick={() => void onCancelAiTask?.(task.id)}
                      >
                        {isZh ? '取消' : 'Cancel'}
                      </button>
                    )}
                    {task.status === 'failed' && (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ height: 24, minWidth: 64, fontSize: 11 }}
                        disabled={!onRetryAiTask}
                        onClick={() => void onRetryAiTask?.(task.id)}
                      >
                        {isZh ? '重试' : 'Retry'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <span className="transcription-ai-caption" style={{ marginBottom: 0 }}>
              {isZh ? '相似结果' : 'Similarity Results'}
            </span>
            {(aiEmbeddingMatches ?? []).length === 0 ? (
              <p className="small-text">{isZh ? '选择一句后可检索相似句。' : 'Select one utterance to search similar results.'}</p>
            ) : (
              (aiEmbeddingMatches ?? []).slice(0, 5).map((item) => {
                const isActive = selectedUtterance?.id === item.utteranceId;
                return (
                  <button
                    key={item.utteranceId}
                    type="button"
                    className="transcription-match-row"
                    style={{
                      marginTop: 0,
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      borderColor: isActive ? '#2563eb' : undefined,
                      background: isActive ? '#eff6ff' : undefined,
                    }}
                    onClick={() => onJumpToEmbeddingMatch?.(item.utteranceId)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>{item.label}</span>
                      <em>{formatEmbeddingScore(item.score)}</em>
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, color: '#64748b' }}>
                      {item.text || (isZh ? '（空文本）' : '(empty text)')}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {shouldShow('task_observer') && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.observer.title')}</span>
              <span className="transcription-ai-tag">{t(locale, 'ai.observer.realtime')}</span>
            </div>
            <p className="small-text">{t(locale, 'ai.observer.currentStage')}{(observerStage && stageLabel[observerStage]) ?? t(locale, 'ai.stages.collecting')}</p>
            {(!observerRecommendations || observerRecommendations.length === 0) ? (
              <p className="small-text">{t(locale, 'ai.observer.noRecommendations')}</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {observerRecommendations.map((item) => (
                  <div key={item.id} style={{ background: '#f8fafc', borderRadius: 8, padding: '6px 8px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>{item.detail}</div>
                    {item.actionLabel && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ height: 26, minWidth: 72, fontSize: 12 }}
                          onClick={() => onExecuteRecommendation?.(item)}
                        >
                          {item.actionLabel}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
      )}

      {selectedUtterance ? (
        <>

          {shouldShow('translation_focus') && (
            <div className="transcription-ai-card">
              <div className="transcription-ai-card-head">
                <span>{t(locale, 'ai.translation.title')}</span>
                <span className="transcription-ai-tag">{t(locale, 'ai.translation.tag')}</span>
              </div>
              <p className="small-text">{t(locale, 'ai.translation.gapCount')}{selectedTranslationGapCount ?? 0}</p>
              <button
                type="button"
                className="icon-btn"
                style={{ height: 26, minWidth: 96, fontSize: 12 }}
                disabled={!onJumpToTranslationGap || (selectedTranslationGapCount ?? 0) <= 0}
                onClick={() => onJumpToTranslationGap?.()}
              >
                {t(locale, 'ai.translation.jump')}
              </button>
            </div>
          )}

          {shouldShow('generation_status') && hasModelInsightData && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.source.title')}</span>
              <span className="transcription-ai-tag">{t(locale, 'ai.source.tag')}</span>
            </div>
            <div
              className={`transcription-ai-status ${selectedUtterance.annotationStatus === 'verified' ? 'transcription-ai-status-verified' : 'transcription-ai-status-generated'}`}
              title={selectedUtterance.annotationStatus === 'verified' ? t(locale, 'ai.source.verified') : t(locale, 'ai.source.generated')}
            >
              {selectedUtterance.annotationStatus === 'verified' ? <CheckCircle2 size={16} /> : <Bot size={16} />}
              <strong>{selectedUtterance.annotationStatus === 'verified' ? t(locale, 'ai.source.verified') : t(locale, 'ai.source.generated')}</strong>
              <span>
                {tf(locale, 'ai.source.line', {
                  rowNumber: selectedRowMeta?.rowNumber ?? '--',
                  startTime: formatTime(selectedUtterance.startTime),
                  endTime: formatTime(selectedUtterance.endTime),
                })}
              </span>
            </div>
          </div>
          )}

          {shouldShow('context_analysis') && hasModelInsightData && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.insight.title')}</span>
              <span className="transcription-ai-tag">{t(locale, 'ai.insight.tag')}</span>
            </div>
            <p>
              {tf(locale, 'ai.insight.range', {
                startTime: formatTime(selectedUtterance.startTime),
                endTime: formatTime(selectedUtterance.endTime),
              })}
              {selectedUtterance.ai_metadata?.model
                ? tf(locale, 'ai.insight.model', { model: selectedUtterance.ai_metadata.model })
                : t(locale, 'ai.insight.noModel')}
              {typeof selectedUtterance.ai_metadata?.confidence === 'number'
                ? tf(locale, 'ai.insight.confidence', { confidence: (selectedUtterance.ai_metadata.confidence * 100).toFixed(1) })
                : ''}
            </p>
            {selectedAiWarning && <p className="inspector-warning">{t(locale, 'ai.insight.warning')}</p>}
          </div>
          )}

          {shouldShow('dictionary_matches') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.dict.title')}</span>
            {lexemeMatches.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.dict.noMatches')}</p>
            ) : (
              lexemeMatches.map((item) => (
                <div key={item.id} className="transcription-match-row">
                  <span>{Object.values(item.lemma)[0] ?? item.id}</span>
                  <em>{item.id}</em>
                </div>
              ))
            )}
          </div>
          )}

          {shouldShow('token_notes') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.notes.title')}</span>
            {!selectedUtterance.words || selectedUtterance.words.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.notes.noWords')}</p>
            ) : (
              selectedUtterance.words.map((word, wordIndex) => {
                const wordLabel = word.form.default ?? Object.values(word.form)[0] ?? `word_${wordIndex + 1}`;
                return (
                  <div key={word.id ?? `${selectedUtterance.id}-word-${wordIndex}`} className="transcription-match-row" style={{ display: 'block' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{wordLabel}</span>
                      {word.id && onOpenWordNote && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ height: 24, minWidth: 44, fontSize: 12 }}
                          onClick={(event) => onOpenWordNote(selectedUtterance.id, word.id!, event)}
                        >
                          {t(locale, 'ai.notes.button')}
                        </button>
                      )}
                    </div>
                    {Array.isArray(word.morphemes) && word.morphemes.length > 0 && (
                      <div style={{ marginTop: 6, paddingLeft: 10, display: 'grid', gap: 4 }}>
                        {word.morphemes.map((morpheme, morphIndex) => {
                          const morphLabel = morpheme.form.default ?? Object.values(morpheme.form)[0] ?? `morph_${morphIndex + 1}`;
                          return (
                            <div
                              key={morpheme.id ?? `${selectedUtterance.id}-${word.id ?? wordIndex}-morph-${morphIndex}`}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                            >
                              <span style={{ fontSize: 12, opacity: 0.9 }}>- {morphLabel}</span>
                              {word.id && morpheme.id && onOpenMorphemeNote && (
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ height: 22, minWidth: 44, fontSize: 12 }}
                                  onClick={(event) => onOpenMorphemeNote(selectedUtterance.id, word.id!, morpheme.id!, event)}
                                >
                                  {t(locale, 'ai.notes.button')}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          )}

          {shouldShow('pos_tagging') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.pos.title')}</span>
            {!selectedUtterance?.words || selectedUtterance.words.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.pos.noWords')}</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="small-text">
                    {tf(locale, 'ai.pos.coverage', { tagged: taggedCount, total: words.length, percent: (words.length === 0 ? '0.0' : ((taggedCount / words.length) * 100).toFixed(1)) })}
                  </span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={showOnlyUntagged}
                      onChange={(e) => setShowOnlyUntagged(e.currentTarget.checked)}
                    />
                    {t(locale, 'ai.pos.showUntagged')}
                  </label>
                </div>

                {displayedWords.map((word, wordIndex) => {
                  const sourceIndex = words.findIndex((item) => item.id === word.id);
                  const wordLabel = word.form.default ?? Object.values(word.form)[0] ?? `word_${wordIndex + 1}`;
                  return (
                    <label
                      key={`pos-${word.id ?? `${selectedUtterance.id}-word-${wordIndex}`}-${word.pos ?? ''}`}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 84px', gap: 8, alignItems: 'center' }}
                    >
                      <span style={{ fontSize: 12, opacity: 0.92 }}>{wordLabel}</span>
                      <input
                        type="text"
                        defaultValue={word.pos ?? ''}
                        placeholder={t(locale, 'ai.pos.posPlaceholder')}
                        style={{ height: 26, fontSize: 12, padding: '0 6px' }}
                        ref={(el) => {
                          if (word.id) {
                            posInputRefs.current[word.id] = el;
                          }
                        }}
                        onBlur={(event) => {
                          commitTokenPos(
                            word.id,
                            event.currentTarget.value,
                            word.pos,
                            sourceIndex,
                            false,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          commitTokenPos(
                            word.id,
                            (event.currentTarget as HTMLInputElement).value,
                            word.pos,
                            sourceIndex,
                            true,
                          );
                        }}
                      />
                    </label>
                  );
                })}
                {displayedWords.length === 0 && (
                  <p className="small-text">{t(locale, 'ai.pos.noDisplayed')}</p>
                )}
              </div>
            )}

            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <span className="small-text">{t(locale, 'ai.pos.batchLabel')}</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px auto', gap: 6 }}>
                <input
                  type="text"
                  placeholder={t(locale, 'ai.pos.formPlaceholder')}
                  value={batchForm}
                  onChange={(e) => setBatchForm(e.currentTarget.value)}
                  style={{ height: 26, fontSize: 12, padding: '0 6px' }}
                />
                <input
                  type="text"
                  placeholder={t(locale, 'ai.pos.posPlaceholder')}
                  value={batchPos}
                  onChange={(e) => setBatchPos(e.currentTarget.value)}
                  style={{ height: 26, fontSize: 12, padding: '0 6px' }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ height: 26, minWidth: 60, fontSize: 12 }}
                  disabled={!onBatchUpdateTokenPosByForm || !selectedUtterance || batchForm.trim().length === 0}
                  onClick={() => {
                    if (!selectedUtterance || !onBatchUpdateTokenPosByForm) return;
                    void onBatchUpdateTokenPosByForm(
                      selectedUtterance.id,
                      batchForm.trim(),
                      batchPos.trim().length > 0 ? batchPos.trim() : null,
                    );
                  }}
                >
                  {t(locale, 'ai.pos.apply')}
                </button>
              </div>
            </div>
          </div>
          )}

          {shouldShow('phoneme_consistency') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.phoneme.title')}</span>
            <div className="transcription-meter-row">
              <span>/p/</span>
              <div><i style={{ width: '75%' }} /></div>
              <strong>75%</strong>
            </div>
            <div className="transcription-meter-row">
              <span>/t/</span>
              <div><i style={{ width: '100%' }} /></div>
              <strong>100%</strong>
            </div>
            <div className="transcription-meter-row">
              <span>/k/</span>
              <div><i style={{ width: '22%' }} /></div>
              <strong>22%</strong>
            </div>
          </div>
          )}
        </>
      ) : (
        <>
          {shouldShow('translation_focus') && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <div className="transcription-ai-card-head">
                <span>{t(locale, 'ai.translation.title')}</span>
                <span className="transcription-ai-tag">{t(locale, 'ai.translation.tag')}</span>
              </div>
              <p className="small-text">{t(locale, 'ai.translation.selectFirst')}</p>
            </div>
          )}

          {shouldShow('generation_status') && hasAnyAiSignal && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <div className="transcription-ai-card-head">
                <span>{t(locale, 'ai.source.title')}</span>
                <span className="transcription-ai-tag">{t(locale, 'ai.source.tag')}</span>
              </div>
              <p className="small-text">{t(locale, 'ai.source.selectFirst')}</p>
            </div>
          )}

          {shouldShow('context_analysis') && hasAnyAiSignal && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <div className="transcription-ai-card-head">
                <span>{t(locale, 'ai.insight.title')}</span>
                <span className="transcription-ai-tag">{t(locale, 'ai.insight.tag')}</span>
              </div>
              <p className="small-text">{t(locale, 'ai.insight.selectFirst')}</p>
            </div>
          )}

          {shouldShow('dictionary_matches') && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <span className="transcription-ai-caption">{t(locale, 'ai.dict.title')}</span>
              <p className="small-text">{t(locale, 'ai.dict.selectFirst')}</p>
            </div>
          )}

          {shouldShow('token_notes') && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <span className="transcription-ai-caption">{t(locale, 'ai.notes.title')}</span>
              <p className="small-text">{t(locale, 'ai.notes.selectFirst')}</p>
            </div>
          )}

          {shouldShow('pos_tagging') && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <span className="transcription-ai-caption">{t(locale, 'ai.pos.title')}</span>
              <p className="small-text">{t(locale, 'ai.pos.selectFirst')}</p>
            </div>
          )}

          {shouldShow('phoneme_consistency') && (
            <div className="transcription-ai-card transcription-ai-card-muted">
              <span className="transcription-ai-caption">{t(locale, 'ai.phoneme.title')}</span>
              <p className="small-text">{t(locale, 'ai.phoneme.selectFirst')}</p>
            </div>
          )}
        </>
      )}

      <div className="transcription-ai-task-hint" aria-live="polite">
        {t(locale, 'ai.header.currentTask')}{aiCurrentTask ? taskLabel[aiCurrentTask] : t(locale, 'ai.header.taskUnknown')}
      </div>

      <div className="transcription-ai-stats-panel transcription-ai-stats-panel-footer">
        <span className="toolbar-chip small-chip">{tf(locale, 'ai.stats.database', { dbName })}</span>
        <span className="toolbar-chip small-chip">{tf(locale, 'ai.stats.utterance', { utteranceCount })}</span>
        <span className="toolbar-chip small-chip">{tf(locale, 'ai.stats.translationLayer', { translationLayerCount })}</span>
        <span className="toolbar-chip small-chip">
          <WandSparkles size={12} />
          {aiConfidenceAvg === null ? t(locale, 'ai.stats.aiConfidenceNone') : tf(locale, 'ai.stats.aiConfidence', { confidence: (aiConfidenceAvg * 100).toFixed(1) })}
        </span>
      </div>
    </aside>
  );
});
