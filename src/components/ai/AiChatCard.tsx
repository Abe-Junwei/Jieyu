import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Check, Copy, Settings } from 'lucide-react';
import {
  diffAiToolSnapshot,
  type AiToolGoldenSnapshot,
  type AiToolReplayBundle,
  type AiToolSnapshotDiff,
} from '../../ai/auditReplay';
import { splitCitationMarkers } from '../../utils/citationFootnoteUtils';
import { detectLocale, t } from '../../i18n';
import {
  aiChatProviderDefinitions,
  getAiChatProviderDefinition,
} from '../../ai/providers/providerCatalog';
import type { AiChatProviderKind, AiChatSettings } from '../../ai/providers/providerCatalog';
import { useAiAssistantHubContext } from '../../contexts/AiAssistantHubContext';
import {
  formatCitationLabel,
  formatToolDecision,
} from './aiChatCardUtils';
import {
  exportReplayBundleSnapshot,
  openReplayBundleByRequestId,
  parseImportedGoldenSnapshot,
} from './aiChatReplayUtils';
import { AiChatAlertsPanel } from './AiChatAlertsPanel';
import { AiChatCandidateChips } from './AiChatCandidateChips';
import { AiChatMetricsBar } from './AiChatMetricsBar';
import { AiChatPromptLabModal } from './AiChatPromptLabModal';
import { AiChatReplayDetailPanel } from './AiChatReplayDetailPanel';
import { useAiPromptTemplates } from './useAiPromptTemplates';

type AiChatCardProps = {
  embedded?: boolean;
  voiceDrawer?: ReactNode | undefined;
  voiceEntry?: {
    enabled: boolean;
    expanded: boolean;
    listening: boolean;
    statusText?: string;
    onTogglePanel: () => void;
  } | undefined;
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
    aiTaskSession,
    aiInteractionMetrics,
    aiSessionMemory,
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
  const [debugUiShowAll, setDebugUiShowAll] = useState(false);
  const [selectedReplayBundle, setSelectedReplayBundle] = useState<AiToolReplayBundle | null>(null);
  const [replayLoadingRequestId, setReplayLoadingRequestId] = useState<string | null>(null);
  const [replayErrorMessage, setReplayErrorMessage] = useState<string | null>(null);
  const [exportedSnapshotRequestId, setExportedSnapshotRequestId] = useState<string | null>(null);
  const [compareSnapshot, setCompareSnapshot] = useState<AiToolGoldenSnapshot | null>(null);
  const [snapshotDiff, setSnapshotDiff] = useState<AiToolSnapshotDiff | null>(null);
  // 展开的推理内容消息 ID 集合 | Set of message IDs with expanded reasoning content
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const isZh = locale === 'zh-CN';
  const canShowUiDemoToggle = import.meta.env.DEV;
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

  const {
    quickPromptTemplates,
    promptTemplates,
    editingTemplateId,
    templateTitleInput,
    templateContentInput,
    setTemplateTitleInput,
    setTemplateContentInput,
    savePromptTemplate,
    editPromptTemplate,
    removePromptTemplate,
    injectPromptTemplate,
    appendPromptVariable,
  } = useAiPromptTemplates({
    promptVars,
    onInjectRenderedPrompt: setChatInput,
    onEditTemplate: () => setShowPromptLab(true),
  });

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
  const hasToolPending = !!aiPendingToolCall;
  const hasDecisionLogs = (aiToolDecisionLogs ?? []).length > 0;
  const alertCount = hasToolPending ? 1 : 0;
  const errorWarningText = useMemo(() => {
    const raw = (aiLastError ?? '').trim();
    if (!raw) return null;
    const isLayerMismatch = /未找到匹配.?当前.?的转写层|no matching\s+"?current"?\s+transcription\s+layer/i.test(raw);
    return isLayerMismatch
      ? (isZh ? '⚠ 未找到匹配“当前”的转写层' : '⚠ No matching "current" transcription layer found')
      : (isZh ? `⚠ ${raw}` : `⚠ ${raw}`);
  }, [aiLastError, isZh]);
  const inputBlockedReason = useMemo(() => {
    if (hasToolPending) {
      return isZh ? '存在待确认的高风险操作，请先确认或取消。' : 'A high-risk action is pending. Confirm or cancel it first.';
    }
    return null;
  }, [hasToolPending, isZh]);
  const [showAlertBar, setShowAlertBar] = useState(() => alertCount > 0);
  const [showDecisionPanel, setShowDecisionPanel] = useState(true);
  const [showReplayDetailPanel, setShowReplayDetailPanel] = useState(false);
  const [dismissedErrorWarning, setDismissedErrorWarning] = useState(false);
  const [voiceDrawerMaxHeight, setVoiceDrawerMaxHeight] = useState<number | null>(null);
  const [decisionPanelMaxHeight, setDecisionPanelMaxHeight] = useState<number | null>(null);
  const [isVoiceDrawerResizing, setIsVoiceDrawerResizing] = useState(false);
  const [isDecisionPanelResizing, setIsDecisionPanelResizing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedMessageTimerRef = useRef<number | null>(null);
  const blockedHintTimerRef = useRef<number | null>(null);
  const exportedSnapshotTimerRef = useRef<number | null>(null);
  const [transientBlockedReason, setTransientBlockedReason] = useState<string | null>(null);
  const prevAlertCountRef = useRef(alertCount);
  const prevHasDecisionLogsRef = useRef(hasDecisionLogs);
  const canUseVoiceEntry = Boolean(voiceEntry?.enabled);
  const voiceResizeStartYRef = useRef(0);
  const voiceResizeStartHeightRef = useRef(0);
  const decisionResizeStartYRef = useRef(0);
  const decisionResizeStartHeightRef = useRef(0);

  const resolveVoiceDrawerHeightBounds = (): { min: number; max: number; preferred: number } => {
    if (typeof window === 'undefined') {
      return { min: 140, max: 380, preferred: 260 };
    }
    const min = Math.max(120, Math.floor(window.innerHeight * 0.2));
    const max = Math.max(min + 80, Math.floor(window.innerHeight * 0.62));
    const preferred = Math.min(Math.max(Math.floor(window.innerHeight * 0.36), min), max);
    return { min, max, preferred };
  };

  const clampVoiceDrawerHeight = (value: number): number => {
    const { min, max } = resolveVoiceDrawerHeightBounds();
    return Math.min(Math.max(value, min), max);
  };

  const startVoiceDrawerResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!voiceEntry?.expanded || typeof window === 'undefined') return;
    event.preventDefault();
    const { preferred } = resolveVoiceDrawerHeightBounds();
    const initial = clampVoiceDrawerHeight(voiceDrawerMaxHeight ?? preferred);
    voiceResizeStartYRef.current = event.clientY;
    voiceResizeStartHeightRef.current = initial;
    setVoiceDrawerMaxHeight(initial);
    setIsVoiceDrawerResizing(true);
  };

  const resolveDecisionPanelHeightBounds = (): { min: number; max: number; preferred: number } => {
    if (typeof window === 'undefined') {
      return { min: 160, max: 380, preferred: 260 };
    }
    const min = Math.max(132, Math.floor(window.innerHeight * 0.22));
    const max = Math.max(min + 80, Math.floor(window.innerHeight * 0.62));
    const preferred = Math.min(Math.max(Math.floor(window.innerHeight * 0.36), min), max);
    return { min, max, preferred };
  };

  const clampDecisionPanelHeight = (value: number): number => {
    const { min, max } = resolveDecisionPanelHeightBounds();
    return Math.min(Math.max(value, min), max);
  };

  const startDecisionPanelResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!showDecisionPanel || typeof window === 'undefined') return;
    event.preventDefault();
    const { preferred } = resolveDecisionPanelHeightBounds();
    const initial = clampDecisionPanelHeight(decisionPanelMaxHeight ?? preferred);
    decisionResizeStartYRef.current = event.clientY;
    decisionResizeStartHeightRef.current = initial;
    setDecisionPanelMaxHeight(initial);
    setIsDecisionPanelResizing(true);
  };

  const voiceDrawerInlineStyle: CSSProperties | undefined = voiceDrawerMaxHeight !== null
    ? ({ ['--ai-voice-drawer-max-height' as string]: `${voiceDrawerMaxHeight}px` } as CSSProperties)
    : undefined;

  const decisionPanelInlineStyle: CSSProperties | undefined = decisionPanelMaxHeight !== null
    ? ({ ['--ai-decision-panel-max-height' as string]: `${decisionPanelMaxHeight}px` } as CSSProperties)
    : undefined;

  useEffect(() => {
    const prev = prevAlertCountRef.current;
    if (prev === 0 && alertCount > 0) {
      setShowAlertBar(true);
    }
    if (alertCount === 0) {
      setShowAlertBar(false);
    }
    prevAlertCountRef.current = alertCount;
  }, [alertCount]);

  useEffect(() => {
    setDismissedErrorWarning(false);
  }, [errorWarningText]);

  useEffect(() => {
    const prev = prevHasDecisionLogsRef.current;
    if (!prev && hasDecisionLogs) {
      setShowDecisionPanel(true);
    }
    prevHasDecisionLogsRef.current = hasDecisionLogs;
  }, [hasDecisionLogs]);

  useEffect(() => {
    setShowReplayDetailPanel(false);
  }, [selectedReplayBundle?.requestId]);

  useEffect(() => {
    return () => {
      if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copiedMessageTimerRef.current);
      }
      if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(blockedHintTimerRef.current);
      }
      if (exportedSnapshotTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(exportedSnapshotTimerRef.current);
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

  useEffect(() => {
    if (!isVoiceDrawerResizing || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = voiceResizeStartYRef.current - event.clientY;
      setVoiceDrawerMaxHeight(clampVoiceDrawerHeight(voiceResizeStartHeightRef.current + delta));
    };

    const stopResize = (): void => {
      setIsVoiceDrawerResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isVoiceDrawerResizing]);

  useEffect(() => {
    if (!isDecisionPanelResizing || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = decisionResizeStartYRef.current - event.clientY;
      setDecisionPanelMaxHeight(clampDecisionPanelHeight(decisionResizeStartHeightRef.current + delta));
    };

    const stopResize = (): void => {
      setIsDecisionPanelResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDecisionPanelResizing]);

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

  const openReplayBundle = async (requestId: string): Promise<void> => {
    setReplayLoadingRequestId(requestId);
    setReplayErrorMessage(null);
    const result = await openReplayBundleByRequestId(requestId, compareSnapshot, isZh);
    setSelectedReplayBundle(result.bundle);
    setReplayErrorMessage(result.errorMessage);
    setSnapshotDiff(result.snapshotDiff);
    setReplayLoadingRequestId(null);
  };

  const exportGoldenSnapshot = async (requestId: string): Promise<void> => {
    setReplayErrorMessage(null);
    const result = await exportReplayBundleSnapshot(requestId, selectedReplayBundle, isZh);
    if (result.errorMessage) {
      setReplayErrorMessage(result.errorMessage);
      return;
    }

    if (result.bundle) {
      setSelectedReplayBundle(result.bundle);
      setExportedSnapshotRequestId(requestId);
      if (typeof window !== 'undefined' && exportedSnapshotTimerRef.current !== null) {
        window.clearTimeout(exportedSnapshotTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        exportedSnapshotTimerRef.current = window.setTimeout(() => {
          setExportedSnapshotRequestId((current) => (current === requestId ? null : current));
          exportedSnapshotTimerRef.current = null;
        }, 1200);
      }
    }
  };

  // 从本地文件导入 golden snapshot 并与当前 replay bundle 对比 | Import a local golden snapshot and diff it against the current bundle
  const importSnapshotForCompare = (file: File): void => {
    setReplayErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseImportedGoldenSnapshot((e.target?.result as string) ?? '', isZh);
      if (result.errorMessage) {
        setReplayErrorMessage(result.errorMessage);
        return;
      }

      if (result.snapshot) {
        setCompareSnapshot(result.snapshot);
        setSnapshotDiff(
          selectedReplayBundle
            ? diffAiToolSnapshot(result.snapshot, selectedReplayBundle)
            : null,
        );
      }
    };
    reader.readAsText(file);
  };

  const submitChatInput = (): void => {
    const text = chatInput.trim();
    if (!text) return;
    if (!onSendAiMessage) {
      showTransientBlockedReason(isZh ? 'AI 对话尚未就绪，请稍后重试。' : 'AI chat is not ready yet. Please try again shortly.');
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(isZh ? '上一条回复仍在生成中，停止后可继续发送。' : 'Previous reply is still streaming. Stop it before sending.');
      return;
    }
    if (hasToolPending) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? (isZh ? '存在待确认操作，请先处理后再发送。' : 'A pending action must be handled before sending.'));
      return;
    }
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
          {canShowUiDemoToggle && (
            <button
              type="button"
              className={`icon-btn ai-chat-head-demo-btn${debugUiShowAll ? ' ai-chat-head-demo-btn-active' : ''}`}
              aria-pressed={debugUiShowAll}
              onClick={() => setDebugUiShowAll((prev) => !prev)}
              title={isZh ? '演示模式：显示条件区' : 'Demo mode: show conditional sections'}
            >
              {isZh ? '演示' : 'Demo'}
            </button>
          )}
        </div>
      </div>

      {/* P0: Provider config panel (collapsible below header) */}
      {aiChatSettings && showProviderConfig && (
        <div style={{ borderBottom: '1px dashed #cbd5e1', padding: '6px 10px 8px', display: 'grid', gap: 6 }}>
          {activeProviderDefinition.fields.map((field) => (
            <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 6, alignItems: 'center' }}>
              <span className="ai-cfg-label">{field.label}</span>
              {field.type === 'select' ? (
                <select
                  className="ai-cfg-input"
                  value={String(aiChatSettings[field.key] ?? '')}
                  onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="ai-cfg-input"
                  type={field.type}
                  value={String(aiChatSettings[field.key] ?? '')}
                  placeholder={field.placeholder}
                  onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={`icon-btn${aiConnectionTestStatus === 'success' ? ' ai-conn-ok' : ''}`}
              disabled={!onTestAiConnection || aiConnectionTestStatus === 'testing'}
              style={{ height: 26, minWidth: 80, fontSize: 12 }}
              onClick={() => { if (!onTestAiConnection) return; void onTestAiConnection(); }}
            >
              {aiConnectionTestStatus === 'testing'
                ? t(locale, 'ai.chat.testing')
                : aiConnectionTestStatus === 'success'
                  ? <><Check size={12} strokeWidth={2.5} style={{ marginRight: 2, verticalAlign: -1 }} />{isZh ? '已连接' : 'Connected'}</>
                  : t(locale, 'ai.chat.testConnection')}
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
          </div>
          {aiConnectionTestStatus === 'error' && aiConnectionTestMessage && (
            <p className="ai-conn-error-msg">{aiConnectionTestMessage}</p>
          )}
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
                      : (assistantMsg.content || (assistantMsg.status === 'streaming'
                        ? (assistantMsg.thinking ? (isZh ? '正在思考...' : 'Thinking...') : '...')
                        : (assistantMsg.status === 'aborted' ? '⏹ 已中断' : ''))))
                    : '';
                  const reasoningContent = assistantMsg?.reasoningContent;
                  const hasReasoning = typeof reasoningContent === 'string' && reasoningContent.length > 0;
                  const isReasoningExpanded = hasReasoning && expandedReasoningIds.has(assistantMsg?.id ?? '');
                  // 原始引用保持注入顺序，用于 [N] 标记解析 | Raw citations keep injection order for [N] marker resolution
                  const rawCitations = assistantMsg?.citations ?? [];
                  const hasInlineMarkers = rawCitations.length > 0 && /\[\d+\]/.test(assistantContent);
                  // 有行内标记时保持注入顺序；否则按类型排序兼容旧消息 | Injection order when markers exist; type-sorted for legacy
                  const orderedCitations = hasInlineMarkers
                    ? rawCitations
                    : [...rawCitations].sort((a, b) => {
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
                  const showAiGeneratedText = assistantMsg?.generationSource === 'llm' && assistantMsg?.status === 'done';
                  const generatedModelName = (assistantMsg?.generationModel ?? '').trim();
                  const generatedLabel = generatedModelName.length > 0
                    ? (isZh ? `${generatedModelName} 生成` : `${generatedModelName} Generated`)
                    : (isZh ? 'AI 生成' : 'AI Generated');
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
                          <span className="ai-chat-message-content">
                            {hasInlineMarkers
                              ? splitCitationMarkers(assistantContent, rawCitations.length).map((seg, i) =>
                                  seg.type === 'text'
                                    ? <Fragment key={i}>{seg.value}</Fragment>
                                    : (
                                      <sup
                                        key={i}
                                        className="ai-citation-marker"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                          const c = rawCitations[seg.index! - 1];
                                          if (c && onJumpToCitation) void onJumpToCitation(c.type, c.refId, c);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            const c = rawCitations[seg.index! - 1];
                                            if (c && onJumpToCitation) void onJumpToCitation(c.type, c.refId, c);
                                          }
                                        }}
                                      >
                                        {seg.value}
                                      </sup>
                                    ),
                                )
                              : assistantContent}
                          </span>
                          {(hasCopyableAssistantContent || orderedCitations.length > 0 || hasReasoning || showAiGeneratedText) && (
                            <div className="ai-chat-message-actions">
                              {hasCopyableAssistantContent && (
                                <button
                                  type="button"
                                  className="icon-btn ai-chat-message-copy-btn"
                                  title={copiedMessageId === assistantMsg.id
                                    ? (isZh ? '已复制' : 'Copied')
                                    : (isZh ? '复制' : 'Copy')}
                                  aria-label={copiedMessageId === assistantMsg.id
                                    ? (isZh ? '已复制' : 'Copied')
                                    : (isZh ? '复制' : 'Copy')}
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
                                  {copiedMessageId === assistantMsg.id ? <Check size={13} /> : <Copy size={13} />}
                                </button>
                              )}
                              {hasReasoning && (
                                <button
                                  type="button"
                                  className="ai-chat-message-action-btn"
                                  style={{ fontStyle: 'italic' }}
                                  onClick={() => {
                                    setExpandedReasoningIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(assistantMsg.id)) {
                                        next.delete(assistantMsg.id);
                                      } else {
                                        next.add(assistantMsg.id);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  {isReasoningExpanded
                                    ? (isZh ? '▲ 隐藏推理' : '▲ Hide reasoning')
                                    : (isZh ? '▼ 查看推理' : '▼ Show reasoning')}
                                </button>
                              )}
                              {orderedCitations.map((citation, ci) => (
                                <button
                                  key={`${assistantMsg.id}-${citation.type}-${citation.refId}`}
                                  className="ai-chat-message-action-btn"
                                  title={`${citation.type}:${citation.refId}`}
                                  type="button"
                                  onClick={() => { if (!onJumpToCitation) return; void onJumpToCitation(citation.type, citation.refId, citation); }}
                                  disabled={!onJumpToCitation}
                                >
                                  {hasInlineMarkers ? `[${ci + 1}] ` : ''}{formatCitationLabel(isZh, citation)}
                                </button>
                              ))}
                              {showAiGeneratedText && (
                                <span className="ai-chat-message-source-text">
                                  {generatedLabel}
                                </span>
                              )}
                            </div>
                          )}
                          {/* 可折叠的推理过程 | Collapsible reasoning content */}
                          {hasReasoning && isReasoningExpanded && (
                            <div
                              className="ai-chat-reasoning-block"
                              style={{
                                marginTop: 6,
                                padding: '4px 8px',
                                background: 'rgba(148,163,184,0.08)',
                                borderRadius: 4,
                                fontSize: 11,
                                color: '#64748b',
                                lineHeight: 1.5,
                                fontStyle: 'italic',
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: 2, fontStyle: 'normal' }}>
                                {isZh ? '💭 推理过程' : '💭 Reasoning'}
                              </div>
                              <div>{reasoningContent}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length > 0 && onClearAiMessages && (
              <div className="ai-chat-message-toolbar">
                <button
                  type="button"
                  className="ai-chat-clear-inline-text"
                  onClick={() => onClearAiMessages?.()}
                >
                  {t(locale, 'ai.chat.clear')}
                </button>
              </div>
            )}
          </div>

          <AiChatAlertsPanel
            isZh={isZh}
            errorWarningText={errorWarningText ?? ''}
            dismissedErrorWarning={dismissedErrorWarning}
            alertCount={alertCount}
            debugUiShowAll={debugUiShowAll}
            showAlertBar={showAlertBar}
            aiPendingToolCall={aiPendingToolCall}
            onDismissErrorWarning={() => setDismissedErrorWarning(true)}
            onToggleAlertBar={() => setShowAlertBar((prev) => !prev)}
            onConfirmPendingToolCall={onConfirmPendingToolCall}
            onCancelPendingToolCall={onCancelPendingToolCall}
          />

          {/* 候选快捷回复条 | Candidate quick-reply chips */}
          {((aiTaskSession?.status === 'waiting_clarify' && (aiTaskSession.candidates ?? []).length > 0) || debugUiShowAll) && (
            <AiChatCandidateChips
              isZh={isZh}
              aiIsStreaming={Boolean(aiIsStreaming)}
              debugUiShowAll={debugUiShowAll}
              candidates={aiTaskSession?.candidates ?? []}
              onSendAiMessage={onSendAiMessage}
            />
          )}

          <AiChatMetricsBar
            isZh={isZh}
            aiInteractionMetrics={aiInteractionMetrics}
            aiSessionMemory={aiSessionMemory}
          />

          {/* Input row */}
          <div style={{ display: 'grid', gap: 6, flexShrink: 0 }}>
            <input
              className="ai-chat-input"
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
            />
            <div className="ai-chat-action-row">
              <div className="ai-chat-action-group-primary">
                <button
                  type="button"
                  className={`icon-btn ai-chat-action-btn ai-chat-action-btn-primary${aiIsStreaming ? ' ai-chat-action-btn-primary-stop' : ''}`}
                  aria-label={aiIsStreaming ? (isZh ? '停止生成' : 'Stop generating') : t(locale, 'ai.chat.send')}
                  disabled={aiIsStreaming ? !onStopAiMessage : (!onSendAiMessage || hasToolPending)}
                  onClick={() => {
                    if (aiIsStreaming) {
                      onStopAiMessage?.();
                      return;
                    }
                    submitChatInput();
                  }}
                >
                  {aiIsStreaming ? (isZh ? '停止生成' : 'Stop generating') : t(locale, 'ai.chat.send')}
                </button>
              </div>
              <div className="ai-chat-action-group-secondary">
                <button type="button" className="icon-btn ai-chat-action-btn ai-chat-action-btn-quiet ai-chat-action-btn-wide" onClick={() => setShowPromptLab(true)}>
                  {isZh ? 'Prompt 实验室' : 'Prompt Lab'}
                </button>
              </div>
            </div>
            {quickPromptTemplates.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span className="small-text" style={{ color: '#475569' }}>
                  {isZh ? 'RAG 快捷场景' : 'RAG Quick Scenarios'}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {quickPromptTemplates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="icon-btn ai-chat-action-btn ai-chat-action-btn-quiet"
                      style={{ minWidth: 0, paddingInline: 10, height: 26, fontSize: 11 }}
                      onClick={() => injectPromptTemplate(item.content)}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(transientBlockedReason || inputBlockedReason) && (
              <p className="small-text" style={{ margin: 0, color: '#92400e' }}>{transientBlockedReason ?? inputBlockedReason}</p>
            )}
            {canUseVoiceEntry && voiceEntry && (
              <div
                className={`ai-chat-voice-drawer ${voiceEntry.expanded ? 'is-open' : 'is-closed'}${isVoiceDrawerResizing ? ' is-resizing' : ''}`}
                style={voiceDrawerInlineStyle}
              >
                <div className="ai-chat-voice-drawer-shell">
                  <button
                    type="button"
                    className="ai-chat-voice-drawer-head"
                    onClick={voiceEntry.onTogglePanel}
                    aria-expanded={voiceEntry.expanded}
                  >
                    <span className="ai-chat-voice-drawer-title">{isZh ? '语音输入' : 'Voice Input'}</span>
                    <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                  </button>
                  <div className="ai-chat-voice-drawer-body" aria-hidden={!voiceEntry.expanded}>
                    {voiceEntry.expanded && (
                      <div
                        className="ai-chat-voice-drawer-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={isZh ? '拖动调整语音面板高度' : 'Drag to resize voice panel height'}
                        onPointerDown={startVoiceDrawerResize}
                      />
                    )}
                    {voiceDrawer ?? <p className="ai-chat-fold-empty">{isZh ? '语音面板暂不可用' : 'Voice panel is temporarily unavailable'}</p>}
                  </div>
                </div>
              </div>
            )}

            <div
              className={`ai-chat-decision-panel ${showDecisionPanel ? 'is-open' : 'is-closed'}${hasDecisionLogs ? '' : ' is-empty'}${isDecisionPanelResizing ? ' is-resizing' : ''}`}
              style={decisionPanelInlineStyle}
            >
                <button
                  type="button"
                  className="ai-chat-decision-panel-head"
                  onClick={() => setShowDecisionPanel((prev) => !prev)}
                  aria-expanded={showDecisionPanel}
                >
                  <span className="ai-chat-decision-panel-title">
                    {isZh ? 'AI 决策' : 'AI Decisions'}
                    <span className="ai-chat-decision-panel-bracket">{isZh ? ' · ' : ' · '}</span>
                    <span className="ai-chat-decision-panel-count">{aiToolDecisionLogs?.length ?? 0}{isZh ? ' 条' : ''}</span>
                  </span>
                  <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                </button>
                  <div className="ai-chat-decision-panel-body" aria-hidden={!showDecisionPanel}>
                    {showDecisionPanel && (
                      <div
                        className="ai-chat-decision-panel-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={isZh ? '拖动调整 AI 决策区高度' : 'Drag to resize AI decision panel height'}
                        onPointerDown={startDecisionPanelResize}
                      />
                    )}
                    {!hasDecisionLogs && (
                      <p className="ai-chat-fold-empty">{isZh ? '暂无决策记录' : 'No decisions yet'}</p>
                    )}
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(aiToolDecisionLogs ?? []).map((item) => {
                        const canReplay = typeof item.requestId === 'string' && item.requestId.trim().length > 0;
                        const isLoading = replayLoadingRequestId === item.requestId;
                        const isSelected = selectedReplayBundle?.requestId === item.requestId;
                        return (
                          <div key={item.id} className="ai-chat-decision-item" style={{ display: 'grid', gap: 4, fontSize: 10 }}>
                            <div className="ai-chat-decision-item-meta">
                              <span className="ai-chat-decision-item-main">{item.toolName || (isZh ? '未知工具' : 'unknown')} · {formatToolDecision(isZh, item.decision)}</span>
                              <em className="ai-chat-decision-item-time">{new Date(item.timestamp).toLocaleTimeString()}</em>
                            </div>
                            {canReplay && (
                              <div className="ai-chat-decision-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ height: 22, minWidth: 96, fontSize: 10 }}
                                  disabled={isLoading}
                                  onClick={() => void openReplayBundle(item.requestId!)}
                                >
                                  {isLoading ? (isZh ? '读取中...' : 'Loading...') : (isSelected ? (isZh ? '已打开回放' : 'Replay Opened') : (isZh ? '查看回放/对比' : 'Replay / Compare'))}
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ height: 22, minWidth: 92, fontSize: 10 }}
                                  onClick={() => void exportGoldenSnapshot(item.requestId!)}
                                >
                                  {exportedSnapshotRequestId === item.requestId
                                    ? (isZh ? '已导出快照' : 'Snapshot Exported')
                                    : (isZh ? '导出快照' : 'Export Snapshot')}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {replayErrorMessage && (
                        <div style={{ fontSize: 10, color: '#b91c1c' }}>{replayErrorMessage}</div>
                      )}
                      {selectedReplayBundle && (
                        <AiChatReplayDetailPanel
                          isZh={isZh}
                          selectedReplayBundle={selectedReplayBundle}
                          showReplayDetailPanel={showReplayDetailPanel}
                          compareSnapshot={compareSnapshot}
                          snapshotDiff={snapshotDiff}
                          importFileInputRef={importFileInputRef}
                          onToggleDetail={() => setShowReplayDetailPanel((prev) => !prev)}
                          onClose={() => {
                            setSelectedReplayBundle(null);
                            setCompareSnapshot(null);
                            setSnapshotDiff(null);
                          }}
                          onImportSnapshotFile={importSnapshotForCompare}
                          onClearCompare={() => {
                            setCompareSnapshot(null);
                            setSnapshotDiff(null);
                          }}
                        />
                      )}
                    </div>
                  </div>
              </div>
          </div>

          <AiChatPromptLabModal
            isZh={isZh}
            showPromptLab={showPromptLab}
            quickPromptTemplates={quickPromptTemplates}
            promptTemplates={promptTemplates}
            editingTemplateId={editingTemplateId}
            templateTitleInput={templateTitleInput}
            templateContentInput={templateContentInput}
            onClose={() => setShowPromptLab(false)}
            onInjectTemplate={injectPromptTemplate}
            onEditTemplate={editPromptTemplate}
            onRemoveTemplate={removePromptTemplate}
            onTemplateTitleInputChange={setTemplateTitleInput}
            onTemplateContentInputChange={setTemplateContentInput}
            onAppendPromptVariable={appendPromptVariable}
            onSaveTemplate={savePromptTemplate}
            onInjectAndClose={() => {
              injectPromptTemplate(templateContentInput);
              setShowPromptLab(false);
            }}
          />
        </>
      )}
    </div>
  );
}
