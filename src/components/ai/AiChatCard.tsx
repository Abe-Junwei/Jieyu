import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { detectLocale, t, tf } from '../../i18n';
import {
  aiChatProviderDefinitions,
  getAiChatProviderDefinition,
} from '../../ai/providers/providerCatalog';
import type { AiChatProviderKind, AiChatSettings } from '../../ai/providers/providerCatalog';
import { useAiPanelContext } from '../../contexts/AiPanelContext';
import { getConfidenceColor } from '../../hooks/useVoiceAgent';

interface PromptTemplateItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const PROMPT_TEMPLATES_STORAGE_KEY = 'jieyu.ai.promptTemplates.v1';

function loadPromptTemplatesFromStorage(): PromptTemplateItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromptTemplateItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.id === 'string' && typeof item?.title === 'string' && typeof item?.content === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function newTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function interpolatePromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return vars[key] ?? '';
  });
}

function formatToolDecision(isZh: boolean, decision: string): string {
  if (decision === 'confirmed') return isZh ? '已确认执行' : 'Confirmed';
  if (decision === 'cancelled') return isZh ? '已取消执行' : 'Cancelled';
  if (decision === 'confirm_failed') return isZh ? '确认后执行失败' : 'Confirm failed';
  return decision || (isZh ? '未知' : 'Unknown');
}

export function AiChatCard() {
  const locale = detectLocale();
  const {
    selectedUtterance,
    selectedRowMeta,
    lexemeMatches,
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
    observerStage,
    onJumpToCitation,
    voiceListening,
    voiceSpeechActive,
    voiceMode,
    voiceInterimText,
    voiceFinalText,
    voiceConfidence,
  } = useAiPanelContext();

  const [chatInput, setChatInput] = useState('');
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [showPromptLab, setShowPromptLab] = useState(false);
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>(() => loadPromptTemplatesFromStorage());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitleInput, setTemplateTitleInput] = useState('');
  const [templateContentInput, setTemplateContentInput] = useState('');

  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const isZh = locale === 'zh-CN';
  const isDevContextPreviewVisible = import.meta.env.DEV && !!aiContextDebugSnapshot;
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  const promptVars = useMemo<Record<string, string>>(() => {
    const selectedText = selectedUtterance?.transcription?.default
      ?? Object.values(selectedUtterance?.transcription ?? {})[0]
      ?? '';
    const currentUtterance = selectedUtterance
      ? `id=${selectedUtterance.id}; text=${selectedText}; time=${selectedUtterance.startTime}-${selectedUtterance.endTime}`
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

  const messages = aiMessages ?? [];
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messageViewportRef.current,
    estimateSize: () => 72,
    overscan: 6,
  });

  useEffect(() => {
    if (messages.length === 0) return;
    messageVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [aiIsStreaming, messageVirtualizer, messages.length]);

  return (
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
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 56, fontSize: 12 }} onClick={() => injectPromptTemplate(item.content)}>{isZh ? '注入' : 'Inject'}</button>
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 48, fontSize: 12 }} onClick={() => editPromptTemplate(item)}>{isZh ? '编辑' : 'Edit'}</button>
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 48, fontSize: 12 }} onClick={() => removePromptTemplate(item.id)}>{isZh ? '删除' : 'Delete'}</button>
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
                    <button key={token} type="button" className="icon-btn" style={{ height: 22, minWidth: 80, fontSize: 11 }} onClick={() => appendPromptVariable(token)}>{`{{${token}}}`}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="icon-btn" style={{ height: 26, minWidth: 80, fontSize: 12 }} disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0} onClick={savePromptTemplate}>{editingTemplateId ? (isZh ? '更新' : 'Update') : (isZh ? '保存模板' : 'Save')}</button>
                  <button type="button" className="icon-btn" style={{ height: 26, minWidth: 80, fontSize: 12 }} disabled={templateContentInput.trim().length === 0} onClick={() => injectPromptTemplate(templateContentInput)}>{isZh ? '注入到输入框' : 'Inject to input'}</button>
                </div>
              </div>
            )}
          </div>

          {isDevContextPreviewVisible && (
            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 12 }}>{isZh ? '上下文预览（开发）' : 'Context Preview (Dev)'}</strong>
                <button type="button" className="icon-btn" style={{ height: 24, minWidth: 84, fontSize: 12 }} onClick={() => setShowContextPreview((prev) => !prev)}>
                  {showContextPreview ? (isZh ? '收起' : 'Hide') : (isZh ? '展开' : 'Open')}
                </button>
              </div>
              {showContextPreview && aiContextDebugSnapshot && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <p className="small-text" style={{ margin: 0 }}>
                    {`persona=${aiContextDebugSnapshot.persona} | history=${aiContextDebugSnapshot.historyChars}/${aiContextDebugSnapshot.historyCharBudget} chars (${aiContextDebugSnapshot.historyCount} msgs) | context=${aiContextDebugSnapshot.contextChars}/${aiContextDebugSnapshot.maxContextChars}`}
                  </p>
                  <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, fontSize: 11, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
                    {aiContextDebugSnapshot.contextPreview || (isZh ? '（无上下文）' : '(no context)')}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div ref={messageViewportRef} className="ai-chat-message-viewport">
            {messages.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.chat.noMessages')}</p>
            ) : (
              <div
                className="ai-chat-message-canvas"
                style={{ height: `${messageVirtualizer.getTotalSize()}px` }}
              >
                {messageVirtualizer.getVirtualItems().map((virtualRow) => {
                  const msg = messages[virtualRow.index];
                  if (!msg) return null;
                  return (
                    <div
                      key={msg.id}
                      className="ai-chat-message-row"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                      data-index={virtualRow.index}
                      ref={messageVirtualizer.measureElement}
                    >
                      <div className={`ai-chat-message-bubble ${msg.role === 'user' ? 'ai-chat-message-user' : 'ai-chat-message-assistant'}`}>
                        <strong className="ai-chat-message-role">{msg.role === 'user' ? t(locale, 'ai.chat.roleUser') : t(locale, 'ai.chat.roleAi')}</strong>
                        <span>{msg.content || (msg.status === 'streaming' ? '...' : (msg.status === 'aborted' ? '⏹ 已中断' : ''))}</span>
                        {msg.role === 'assistant' && (msg.citations ?? []).length > 0 && (
                          <div className="ai-chat-citation-row">
                            {(msg.citations ?? []).map((citation) => (
                              <button
                                key={`${msg.id}-${citation.type}-${citation.refId}`}
                                className="ai-chat-citation-chip"
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {voiceListening && (
            <div className="ai-voice-recognition-bar">
              <span className={`ai-voice-mic-icon${voiceSpeechActive ? ' ai-voice-mic-active' : ''}`}>🎙️</span>
              {voiceInterimText ? (
                <span className="ai-voice-interim-text">{voiceInterimText}</span>
              ) : voiceFinalText ? (
                <span className="ai-voice-final-text">
                  <span
                    className="ai-voice-confidence-dot"
                    style={{ background: getConfidenceColor(voiceConfidence ?? 0) }}
                    title={`${Math.round((voiceConfidence ?? 0) * 100)}%`}
                  />
                  {voiceFinalText}
                </span>
              ) : (
                <span className="ai-voice-waiting-text">
                  {isZh ? '等待语音…' : 'Listening…'}
                </span>
              )}
              <span className="ai-voice-mode-badge">{voiceMode}</span>
            </div>
          )}

          {aiLastError && <p className="inspector-warning">{tf(locale, 'ai.chat.error', { error: aiLastError })}</p>}
          {aiPendingToolCall && (
            <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 8, padding: '8px 10px', marginBottom: 8, display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>{isZh ? '高风险工具调用待确认' : 'High-risk tool call pending confirmation'}</div>
              <div style={{ fontSize: 12 }}>{isZh ? '操作' : 'Action'}: {aiPendingToolCall.call.name}</div>
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
                <button type="button" className="icon-btn" style={{ height: 26, minWidth: 72, fontSize: 12 }} disabled={!onConfirmPendingToolCall} onClick={() => void onConfirmPendingToolCall?.()}>{isZh ? '确认执行' : 'Confirm'}</button>
                <button type="button" className="icon-btn" style={{ height: 26, minWidth: 72, fontSize: 12 }} disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{isZh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          )}

          {(aiToolDecisionLogs ?? []).length > 0 && (
            <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 8, padding: '8px 10px', marginBottom: 8, display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{isZh ? '最近 AI 决策日志' : 'Recent AI Decisions'}</div>
              {(aiToolDecisionLogs ?? []).slice(0, 4).map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                  <span>{item.toolName || (isZh ? '未知工具' : 'unknown tool')} · {formatToolDecision(isZh, item.decision)}</span>
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
            <button type="button" className="icon-btn" disabled={!onSendAiMessage || aiIsStreaming} style={{ height: 30, minWidth: 52, fontSize: 12 }} onClick={() => {
              const text = chatInput.trim();
              if (!text || !onSendAiMessage) return;
              void onSendAiMessage(text);
              setChatInput('');
            }}>{t(locale, 'ai.chat.send')}</button>
            <button type="button" className="icon-btn" disabled={!onStopAiMessage || !aiIsStreaming} style={{ height: 30, minWidth: 52, fontSize: 12 }} onClick={() => onStopAiMessage?.()}>{t(locale, 'ai.chat.stop')}</button>
            <button type="button" className="icon-btn" disabled={!onClearAiMessages} style={{ height: 30, minWidth: 52, fontSize: 12 }} onClick={() => onClearAiMessages?.()}>{t(locale, 'ai.chat.clear')}</button>
          </div>
        </>
      )}
    </div>
  );
}
