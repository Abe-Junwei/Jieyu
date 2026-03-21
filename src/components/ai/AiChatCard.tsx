import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { detectLocale, t, tf } from '../../i18n';
import {
  aiChatProviderDefinitions,
  getAiChatProviderDefinition,
} from '../../ai/providers/providerCatalog';
import type { AiChatProviderKind, AiChatSettings } from '../../ai/providers/providerCatalog';
import { useAiAssistantHubContext } from '../../contexts/AiAssistantHubContext';

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

function formatToolName(isZh: boolean, toolName: string): string {
  const zhMap: Record<string, string> = {
    delete_transcription_segment: '删除句段',
    delete_layer: '删除层',
    set_transcription_text: '写入转写',
    set_translation_text: '写入翻译',
    clear_translation_segment: '清空翻译',
    create_transcription_segment: '创建句段',
  };
  const enMap: Record<string, string> = {
    delete_transcription_segment: 'Delete Segment',
    delete_layer: 'Delete Layer',
    set_transcription_text: 'Set Transcription',
    set_translation_text: 'Set Translation',
    clear_translation_segment: 'Clear Translation',
    create_transcription_segment: 'Create Segment',
  };
  const map = isZh ? zhMap : enMap;
  return map[toolName] ?? toolName;
}

function compactInternalId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function formatPendingTarget(
  isZh: boolean,
  call: { name: string; arguments: Record<string, unknown> },
): string | null {
  if (call.name === 'delete_transcription_segment') {
    const utteranceId = typeof call.arguments.utteranceId === 'string' ? call.arguments.utteranceId.trim() : '';
    if (!utteranceId) return isZh ? '当前选中句段' : 'Current selected segment';
    return isZh ? `句段（${compactInternalId(utteranceId)}）` : `Segment (${compactInternalId(utteranceId)})`;
  }

  if (call.name === 'delete_layer') {
    const layerId = typeof call.arguments.layerId === 'string' ? call.arguments.layerId.trim() : '';
    if (layerId) {
      return isZh ? `层（${compactInternalId(layerId)}）` : `Layer (${compactInternalId(layerId)})`;
    }

    const layerType = typeof call.arguments.layerType === 'string' ? call.arguments.layerType.trim() : '';
    const languageQuery = typeof call.arguments.languageQuery === 'string' ? call.arguments.languageQuery.trim() : '';
    if (!layerType && !languageQuery) return null;

    const layerTypeLabel = layerType === 'translation'
      ? (isZh ? '翻译层' : 'Translation layer')
      : layerType === 'transcription'
        ? (isZh ? '转写层' : 'Transcription layer')
        : (isZh ? '目标层' : 'Target layer');

    if (!languageQuery) return layerTypeLabel;
    return isZh ? `${layerTypeLabel}（语言：${languageQuery}）` : `${layerTypeLabel} (language: ${languageQuery})`;
  }

  return null;
}

function formatCitationLabel(
  isZh: boolean,
  citation: { type: 'utterance' | 'note' | 'pdf' | 'schema'; label?: string; refId: string },
): string {
  const fallback = citation.type === 'utterance'
    ? (isZh ? '句段参考' : 'Utterance Ref')
    : citation.type === 'note'
      ? (isZh ? '笔记参考' : 'Note Ref')
      : citation.type === 'pdf'
        ? (isZh ? '文档参考' : 'Document Ref')
        : (isZh ? '参考' : 'Reference');

  const raw = (citation.label ?? '').trim();
  if (!raw) return fallback;

  // 兼容旧数据：隐藏内部 ID 前缀（如 utt:xxx / note:xxx / pdf:xxx / utt_xxx）
  const legacyIdLike = /^(utt:|note:|pdf:|utt_|note_|pdf_)/i;
  if (legacyIdLike.test(raw)) return fallback;

  return raw;
}

type AiChatCardProps = {
  embedded?: boolean;
  voiceDrawer?: ReactNode;
  voiceEntry?: {
    enabled: boolean;
    expanded: boolean;
    listening: boolean;
    statusText?: string;
    onTogglePanel: () => void;
  };
};

export function AiChatCard({ embedded = false, voiceDrawer, voiceEntry }: AiChatCardProps = {}) {
  const locale = detectLocale();
  const {
    selectedUtterance,
    selectedRowMeta,
    lexemeMatches,
    aiChatEnabled,
    aiChatSettings,
    aiMessages,
    aiIsStreaming,
    aiLastError,
    aiConnectionTestStatus,
    aiConnectionTestMessage,
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
  } = useAiAssistantHubContext();

  const [chatInput, setChatInput] = useState('');
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [showPromptLab, setShowPromptLab] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>(() => loadPromptTemplatesFromStorage());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitleInput, setTemplateTitleInput] = useState('');
  const [templateContentInput, setTemplateContentInput] = useState('');

  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const isZh = locale === 'zh-CN';
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const hasApiKeyField = useMemo(() => activeProviderDefinition.fields.some((field) => field.key === 'apiKey'), [activeProviderDefinition.fields]);

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
    const directKinds: AiChatProviderKind[] = ['deepseek', 'qwen', 'anthropic', 'gemini', 'ollama', 'minimax'];
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

  const providerStatusLabel = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    if (kind === 'mock') return isZh ? '模拟' : 'Mock';
    if (kind === 'ollama') return isZh ? '本地' : 'Local';
    if (aiConnectionTestStatus === 'success') return isZh ? '已连接' : 'Connected';
    if (aiConnectionTestStatus === 'error') return isZh ? '异常' : 'Error';
    return isZh ? '未验证' : 'Unverified';
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus, isZh]);

  const providerStatusTone = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    if (aiConnectionTestStatus === 'error') return 'error';
    if (aiConnectionTestStatus === 'success') return 'ok';
    if (kind === 'mock' || kind === 'ollama') return 'local';
    return 'idle';
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus]);

  const chatTitle = useMemo(() => t(locale, 'ai.chat.title').replace(/\s*[（(]MVP[）)]\s*/gi, ''), [locale]);

  const messages = aiMessages ?? [];
  const turns = useMemo(() => {
    const newestTurns: Array<{ assistant?: typeof messages[number]; user?: typeof messages[number] }> = [];
    let index = 0;
    while (index < messages.length) {
      const current = messages[index];
      const next = messages[index + 1];
      if (!current) break;

      if (next && current.role !== next.role) {
        newestTurns.push({
          user: current.role === 'user' ? current : next,
          assistant: current.role === 'assistant' ? current : next,
        });
        index += 2;
        continue;
      }

      newestTurns.push(current.role === 'assistant' ? { assistant: current } : { user: current });
      index += 1;
    }

    return [...newestTurns].reverse();
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    // 消息按时间正序展示，保持视口锚定在底部 | Messages are shown in chronological order, keep viewport anchored at the bottom.
    if (typeof window === 'undefined') {
      viewport.scrollTop = viewport.scrollHeight;
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [aiIsStreaming, messages.length]);

  // P0: count active alerts for the alert bar
  const hasError = !!aiLastError;
  const hasToolPending = !!aiPendingToolCall;
  const hasDecisionLogs = (aiToolDecisionLogs ?? []).length > 0;
  const alertCount = (hasError ? 1 : 0) + (hasToolPending ? 1 : 0) + (hasDecisionLogs ? (aiToolDecisionLogs ?? []).length : 0);
  const inputBlockedReason = useMemo(() => {
    if (hasToolPending) {
      return isZh ? '存在待确认的高风险操作，请先确认或取消。' : 'A high-risk action is pending. Confirm or cancel it first.';
    }
    return null;
  }, [hasToolPending, isZh]);
  const [showAlertBar, setShowAlertBar] = useState(alertCount > 0);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedMessageTimerRef = useRef<number | null>(null);
  const blockedHintTimerRef = useRef<number | null>(null);
  const [transientBlockedReason, setTransientBlockedReason] = useState<string | null>(null);
  const canUseVoiceEntry = Boolean(voiceEntry?.enabled);

  useEffect(() => {
    setShowAlertBar(alertCount > 0);
  }, [alertCount]);

  useEffect(() => {
    return () => {
      if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copiedMessageTimerRef.current);
      }
      if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(blockedHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (aiIsStreaming) return;
    setTransientBlockedReason(null);
    if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(blockedHintTimerRef.current);
      blockedHintTimerRef.current = null;
    }
  }, [aiIsStreaming]);

  const showTransientBlockedReason = (reason: string): void => {
    setTransientBlockedReason(reason);
    if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(blockedHintTimerRef.current);
    }
    if (typeof window !== 'undefined') {
      blockedHintTimerRef.current = window.setTimeout(() => {
        setTransientBlockedReason(null);
        blockedHintTimerRef.current = null;
      }, 1800);
    }
  };

  const submitChatInput = (): void => {
    const text = chatInput.trim();
    if (!text || !onSendAiMessage) return;
    if (aiIsStreaming) {
      showTransientBlockedReason(isZh ? '上一条回复仍在生成中，停止后可继续发送。' : 'Previous reply is still streaming. Stop it before sending.');
      return;
    }
    if (hasToolPending) return;
    void onSendAiMessage(text);
    setChatInput('');
  };

  return (
    <div className={`transcription-ai-card ${embedded ? 'transcription-ai-card-embedded' : ''}`}>
      {/* P0: Header with embedded provider controls */}
      <div className="transcription-ai-card-head ai-chat-head-row">
        <div className="ai-chat-head-title-group">
          <span>{chatTitle}</span>
          <div className="transcription-ai-mode-switch" role="group" aria-label={isZh ? '工具反馈风格' : 'Tool feedback style'}>
            <button
              type="button"
              className={`transcription-ai-mode-btn ${(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed' ? 'is-active' : ''}`}
              disabled={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed'}
              aria-pressed={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed'}
              onClick={() => onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' })}
            >
              {isZh ? '详细' : 'Detailed'}
            </button>
            <button
              type="button"
              className={`transcription-ai-mode-btn ${(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise' ? 'is-active' : ''}`}
              disabled={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise'}
              aria-pressed={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise'}
              onClick={() => onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' })}
            >
              {isZh ? '简洁' : 'Concise'}
            </button>
          </div>
        </div>
        <div className="ai-chat-head-controls">
          <span
            className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone}`}
            role="status"
            aria-label={providerStatusLabel}
            title={`${activeProviderDefinition.label} · ${providerStatusLabel}`}
          />
          <select
            className="ai-chat-provider-select"
            value={aiChatSettings?.providerKind ?? 'mock'}
            onChange={(e) => onUpdateAiChatSettings?.({
              providerKind: e.currentTarget.value as AiChatSettings['providerKind'],
            })}
          >
            {providerGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((provider) => (
                  <option key={provider.kind} value={provider.kind}>{provider.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn ai-chat-head-config-btn"
            aria-label={showProviderConfig ? (isZh ? '收起配置' : 'Hide provider config') : (isZh ? '打开配置' : 'Open provider config')}
            title={showProviderConfig ? (isZh ? '收起配置' : 'Hide provider config') : (isZh ? '打开配置' : 'Open provider config')}
            onClick={() => setShowProviderConfig((prev) => !prev)}
          >
            <Settings size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* P0: Provider config panel (collapsible below header) */}
      {aiChatSettings && showProviderConfig && (
        <div style={{ borderBottom: '1px dashed #cbd5e1', padding: '6px 10px 8px', display: 'grid', gap: 6 }}>
          {activeProviderDefinition.fields.map((field) => (
            <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 6, alignItems: 'center' }}>
              <span className="small-text">{field.label}</span>
              {field.type === 'select' ? (
                <select
                  value={String(aiChatSettings[field.key] ?? '')}
                  onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                  style={{ height: 26, fontSize: 12 }}
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
                  onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                  style={{ height: 26, fontSize: 12, padding: '0 6px' }}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="icon-btn"
              disabled={!onTestAiConnection || aiConnectionTestStatus === 'testing'}
              style={{ height: 26, minWidth: 80, fontSize: 12 }}
              onClick={() => { if (!onTestAiConnection) return; void onTestAiConnection(); }}
            >
              {aiConnectionTestStatus === 'testing' ? t(locale, 'ai.chat.testing') : t(locale, 'ai.chat.testConnection')}
            </button>
            {hasApiKeyField && (
              <button
                type="button"
                className="icon-btn"
                style={{ height: 26, minWidth: 96, fontSize: 12 }}
                onClick={() => onUpdateAiChatSettings?.({ apiKey: '' })}
              >
                {isZh ? '清空当前 Key' : 'Clear Current Key'}
              </button>
            )}
            {aiConnectionTestMessage && (
              <span className="small-text" style={{ color: aiConnectionTestStatus === 'error' ? '#b91c1c' : '#166534' }}>
                {aiConnectionTestMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {!aiChatEnabled ? (
        <p className="small-text">{t(locale, 'ai.chat.disabled')}</p>
      ) : (
        <>
          {/* Message viewport */}
          <div ref={messageViewportRef} className="ai-chat-message-viewport" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {messages.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.chat.noMessages')}</p>
            ) : (
              <div className="ai-chat-message-canvas">
                {turns.map((turn, index) => {
                  const assistantMsg = turn.assistant;
                  const userMsg = turn.user;
                  if (!assistantMsg && !userMsg) return null;

                  const assistantContent = assistantMsg
                    ? ((assistantMsg.status === 'streaming' && /\{[\s\S]*"tool_call"\s*:\s*\{/.test(assistantMsg.content || ''))
                      ? (isZh ? '正在解析工具调用…' : 'Parsing tool call...')
                      : (assistantMsg.content || (assistantMsg.status === 'streaming' ? '...' : (assistantMsg.status === 'aborted' ? '⏹ 已中断' : ''))))
                    : '';
                  const orderedCitations = [...(assistantMsg?.citations ?? [])].sort((a, b) => {
                    const rank = (type: string): number => {
                      if (type === 'utterance') return 1;
                      if (type === 'note') return 2;
                      if (type === 'pdf') return 3;
                      return 99;
                    };
                    return rank(a.type) - rank(b.type);
                  });
                  const copyableAssistantContent = (assistantMsg?.content ?? '').trim();
                  const hasCopyableAssistantContent = copyableAssistantContent.length > 0;
                  const userContent = userMsg
                    ? (userMsg.content || (userMsg.status === 'streaming' ? '...' : (userMsg.status === 'aborted' ? '⏹ 已中断' : '')))
                    : '';

                  return (
                    <div
                      key={`${assistantMsg?.id ?? 'na'}-${userMsg?.id ?? 'nu'}`}
                      className="ai-chat-turn"
                      data-index={index}
                    >
                      {userMsg && (
                        <div className="ai-chat-message-bubble ai-chat-message-user">
                          <span className="ai-chat-message-content">{userContent}</span>
                        </div>
                      )}

                      {assistantMsg && (
                        <div className="ai-chat-message-bubble ai-chat-message-assistant">
                          <span className="ai-chat-message-content">{assistantContent}</span>
                          {(hasCopyableAssistantContent || orderedCitations.length > 0) && (
                            <div className="ai-chat-message-actions">
                              {hasCopyableAssistantContent && (
                                <button
                                  type="button"
                                  className="ai-chat-message-action-btn"
                                  onClick={() => {
                                    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
                                    void navigator.clipboard.writeText(copyableAssistantContent);
                                    if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
                                      window.clearTimeout(copiedMessageTimerRef.current);
                                    }
                                    setCopiedMessageId(assistantMsg.id);
                                    if (typeof window !== 'undefined') {
                                      copiedMessageTimerRef.current = window.setTimeout(() => {
                                        setCopiedMessageId((current) => (current === assistantMsg.id ? null : current));
                                      }, 1200);
                                    }
                                  }}
                                >
                                  {copiedMessageId === assistantMsg.id
                                    ? (isZh ? '已复制' : 'Copied')
                                    : (isZh ? '复制' : 'Copy')}
                                </button>
                              )}
                              {orderedCitations.map((citation) => (
                                <button
                                  key={`${assistantMsg.id}-${citation.type}-${citation.refId}`}
                                  className="ai-chat-message-action-btn"
                                  title={`${citation.type}:${citation.refId}`}
                                  type="button"
                                  onClick={() => { if (!onJumpToCitation) return; void onJumpToCitation(citation.type, citation.refId, citation); }}
                                  disabled={!onJumpToCitation}
                                >
                                  {formatCitationLabel(isZh, citation)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* P1: Unified AlertBar — collapsed single row, expands on click */}
          {alertCount > 0 && (
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', flexShrink: 0 }}>
              {/* Alert summary row */}
              <button
                type="button"
                onClick={() => setShowAlertBar((p) => !p)}
                style={{
                  width: '100%', background: 'none', border: 'none', padding: '5px 10px',
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  fontSize: 11, color: '#92400e',
                }}
              >
                <span style={{ fontSize: 14 }}>{hasError ? '⚠' : hasToolPending ? '⚡' : '📋'}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {hasError && ` ${isZh ? '错误' : 'Error'}`}
                  {hasToolPending && ` ${isZh ? '待确认工具调用' : 'Tool call pending'}`}
                  {hasDecisionLogs && ` ${isZh ? `${(aiToolDecisionLogs ?? []).length} 条 AI 决策` : `${(aiToolDecisionLogs ?? []).length} AI decisions`}`}
                </span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{showAlertBar ? (isZh ? '▲ 收起' : '▲ Hide') : (isZh ? '▼ 展开' : '▼ Expand')}</span>
              </button>

              {/* Expanded alert detail */}
              {showAlertBar && (
                <div style={{ padding: '0 10px 8px', display: 'grid', gap: 6 }}>
                  {aiLastError && (
                    <p className="inspector-warning" style={{ margin: 0 }}>{tf(locale, 'ai.chat.error', { error: aiLastError })}</p>
                  )}
                  {aiPendingToolCall && (
                    <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 6, padding: '6px 8px', display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>{isZh ? '⚡ 高风险操作确认' : '⚡ Confirm High-risk Action'}</div>
                      <div style={{ fontSize: 11 }}>{isZh ? '操作' : 'Action'}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                      {formatPendingTarget(isZh, aiPendingToolCall.call) && (
                        <div style={{ fontSize: 11 }}>{isZh ? '目标' : 'Target'}: {formatPendingTarget(isZh, aiPendingToolCall.call)}</div>
                      )}
                      {aiPendingToolCall.riskSummary && <div style={{ fontSize: 11, color: '#92400e' }}>{aiPendingToolCall.riskSummary}</div>}
                      {(aiPendingToolCall.impactPreview ?? []).length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: '#7c2d12' }}>
                          {(aiPendingToolCall.impactPreview ?? []).slice(0, 3).map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 64, fontSize: 11 }} disabled={!onConfirmPendingToolCall} onClick={() => void onConfirmPendingToolCall?.()}>{isZh ? '确认' : 'Confirm'}</button>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 64, fontSize: 11 }} disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{isZh ? '取消' : 'Cancel'}</button>
                      </div>
                    </div>
                  )}
                  {(aiToolDecisionLogs ?? []).length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6, padding: '6px 8px', display: 'grid', gap: 3 }}>
                      {(aiToolDecisionLogs ?? []).slice(0, 4).map((item) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
                          <span>{item.toolName || (isZh ? '未知工具' : 'unknown')} · {formatToolDecision(isZh, item.decision)}</span>
                          <em>{new Date(item.timestamp).toLocaleTimeString()}</em>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'grid', gap: 6, flexShrink: 0 }}>
            <input
              type="text"
              value={chatInput}
              placeholder={t(locale, 'ai.chat.inputPlaceholder')}
              onChange={(e) => setChatInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                const native = e.nativeEvent as KeyboardEvent;
                // 输入法组合期间回车用于选词，不应触发发送 | Enter should not submit while IME composition is active.
                if (native.isComposing || native.keyCode === 229) return;
                if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                e.preventDefault();
                submitChatInput();
              }}
              style={{ height: 30, fontSize: 12, padding: '0 8px' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="icon-btn" disabled={!onSendAiMessage || aiIsStreaming || hasToolPending} style={{ height: 28, minWidth: 52, fontSize: 12 }} onClick={submitChatInput}>{t(locale, 'ai.chat.send')}</button>
              <button type="button" className="icon-btn" disabled={!onStopAiMessage || !aiIsStreaming} style={{ height: 28, minWidth: 52, fontSize: 12 }} onClick={() => onStopAiMessage?.()}>{t(locale, 'ai.chat.stop')}</button>
              <button type="button" className="icon-btn" disabled={!onClearAiMessages} style={{ height: 28, minWidth: 52, fontSize: 12 }} onClick={() => onClearAiMessages?.()}>{t(locale, 'ai.chat.clear')}</button>
              <button type="button" className="icon-btn" style={{ height: 28, minWidth: 80, fontSize: 12 }} onClick={() => setShowPromptLab(true)}>
                {isZh ? 'Prompt 实验室' : 'Prompt Lab'}
              </button>
            </div>
            {(transientBlockedReason || inputBlockedReason) && (
              <p className="small-text" style={{ margin: 0, color: '#92400e' }}>{transientBlockedReason ?? inputBlockedReason}</p>
            )}
            {canUseVoiceEntry && voiceEntry && voiceDrawer && (
              <div className={`ai-chat-voice-drawer ${voiceEntry.expanded ? 'is-open' : 'is-closed'}`}>
                <div className="ai-chat-voice-drawer-shell">
                  <button
                    type="button"
                    className="ai-chat-voice-drawer-head"
                    onClick={voiceEntry.onTogglePanel}
                    aria-expanded={voiceEntry.expanded}
                  >
                    <span className="ai-chat-voice-drawer-title">{isZh ? '语音输入' : 'Voice Input'}</span>
                    <div className="ai-chat-voice-drawer-toggle" aria-hidden="true">
                      <span className={`transcription-panel-toggle-triangle ${voiceEntry.expanded ? 'transcription-panel-toggle-triangle-left ai-chat-voice-drawer-triangle-open' : 'transcription-panel-toggle-triangle-right ai-chat-voice-drawer-triangle-closed'}`} />
                    </div>
                  </button>
                  <div className="ai-chat-voice-drawer-body" aria-hidden={!voiceEntry.expanded}>{voiceDrawer}</div>
                </div>
              </div>
            )}
          </div>

          {/* P2: PromptLab modal overlay */}
          {showPromptLab && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 50,
                background: 'rgba(15,23,42,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
              }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowPromptLab(false); }}
            >
              <div
                style={{
                  background: 'var(--color-bg-primary, #fff)', borderRadius: 12,
                  padding: 16, width: '100%', maxWidth: 480,
                  display: 'grid', gap: 10, maxHeight: '80vh', overflowY: 'auto',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
              >
                {/* Modal header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{isZh ? 'Prompt 实验室' : 'Prompt Lab'}</strong>
                  <button type="button" className="icon-btn" style={{ height: 26, minWidth: 48, fontSize: 12 }} onClick={() => setShowPromptLab(false)}>{isZh ? '关闭' : 'Close'}</button>
                </div>

                {/* Template list */}
                <div style={{ display: 'grid', gap: 6 }}>
                  {promptTemplates.length === 0 ? (
                    <p className="small-text" style={{ margin: 0 }}>{isZh ? '暂无模板。可创建并在对话前一键注入。' : 'No template yet.'}</p>
                  ) : (
                    promptTemplates.slice(0, 6).map((item) => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 4, alignItems: 'center' }}>
                        <span className="small-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.content}>{item.title}</span>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 52, fontSize: 11 }} onClick={() => injectPromptTemplate(item.content)}>{isZh ? '注入' : 'Inject'}</button>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 44, fontSize: 11 }} onClick={() => editPromptTemplate(item)}>{isZh ? '编辑' : 'Edit'}</button>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 44, fontSize: 11 }} onClick={() => removePromptTemplate(item.id)}>{isZh ? '删除' : 'Del'}</button>
                      </div>
                    ))
                  )}
                </div>

                {/* Template editor */}
                <div style={{ display: 'grid', gap: 6, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
                  <input
                    type="text"
                    value={templateTitleInput}
                    placeholder={isZh ? '模板名称' : 'Template title'}
                    onChange={(e) => setTemplateTitleInput(e.currentTarget.value)}
                    style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                  />
                  <textarea
                    value={templateContentInput}
                    placeholder={isZh ? '模板内容，支持 {{selected_text}} 等变量' : 'Template body with {{selected_text}} {{current_utterance}}...'}
                    onChange={(e) => setTemplateContentInput(e.currentTarget.value)}
                    style={{ minHeight: 80, fontSize: 12, padding: 8, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {['selected_text', 'current_utterance', 'lexicon_summary', 'project_stage', 'current_row'].map((token) => (
                      <button key={token} type="button" className="icon-btn" style={{ height: 22, minWidth: 72, fontSize: 10 }} onClick={() => appendPromptVariable(token)}>{`{{${token}}}`}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="icon-btn" style={{ height: 26, minWidth: 80, fontSize: 12 }} disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0} onClick={savePromptTemplate}>{editingTemplateId ? (isZh ? '更新' : 'Update') : (isZh ? '保存' : 'Save')}</button>
                    <button type="button" className="icon-btn" style={{ height: 26, minWidth: 100, fontSize: 12 }} disabled={templateContentInput.trim().length === 0} onClick={() => { injectPromptTemplate(templateContentInput); setShowPromptLab(false); }}>{isZh ? '注入并关闭' : 'Inject & close'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
