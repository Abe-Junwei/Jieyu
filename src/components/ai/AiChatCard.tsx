import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowUp, Check, Copy, Settings } from 'lucide-react';
import {
  diffAiToolSnapshot,
  type AiToolGoldenSnapshot,
  type AiToolReplayBundle,
  type AiToolSnapshotDiff,
} from '../../ai/auditReplay';
import { buildCopyableAssistantPlainText, splitCitationMarkers } from '../../utils/citationFootnoteUtils';
import { t, useLocale } from '../../i18n';
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
import { AiChatPromptLabModal } from './AiChatPromptLabModal';
import { AiChatReplayDetailPanel } from './AiChatReplayDetailPanel';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { decodeEscapedUnicode, escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';

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
  const locale = useLocale();
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
  const [showRagQuickScenarios, setShowRagQuickScenarios] = useState(false);
  const [selectedReplayBundle, setSelectedReplayBundle] = useState<AiToolReplayBundle | null>(null);
  const [replayLoadingRequestId, setReplayLoadingRequestId] = useState<string | null>(null);
  const [replayErrorMessage, setReplayErrorMessage] = useState<string | null>(null);
  const [exportedSnapshotRequestId, setExportedSnapshotRequestId] = useState<string | null>(null);
  const [compareSnapshot, setCompareSnapshot] = useState<AiToolGoldenSnapshot | null>(null);
  const [snapshotDiff, setSnapshotDiff] = useState<AiToolSnapshotDiff | null>(null);
  // \\u5c55\\u5f00\\u7684\\u63a8\\u7406\\u5185\\u5bb9\\u6d88\\u606f ID \\u96c6\\u5408 | Set of message IDs with expanded reasoning content
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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
      { label: decodeEscapedUnicode('\\u5b98\\u65b9\\u76f4\\u8fde'), items: pick(directKinds) },
      { label: decodeEscapedUnicode('\\u517c\\u5bb9\\u6a21\\u5f0f'), items: pick(compatibleKinds) },
      { label: decodeEscapedUnicode('\\u672c\\u5730/\\u81ea\\u5b9a\\u4e49'), items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, []);

  const providerStatusLabel = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    if (kind === 'mock') return isZh ? decodeEscapedUnicode('\\u6a21\\u62df') : 'Mock';
    if (kind === 'ollama') return isZh ? decodeEscapedUnicode('\\u672c\\u5730') : 'Local';
    if (aiConnectionTestStatus === 'success') return isZh ? decodeEscapedUnicode('\\u5df2\\u8fde\\u63a5') : 'Connected';
    if (aiConnectionTestStatus === 'error') return isZh ? decodeEscapedUnicode('\\u5f02\\u5e38') : 'Error';
    return isZh ? decodeEscapedUnicode('\\u672a\\u9a8c\\u8bc1') : 'Unverified';
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
    // \\u6d88\\u606f\\u6309\\u65f6\\u95f4\\u6b63\\u5e8f\\u5c55\\u793a，\\u4fdd\\u6301\\u89c6\\u53e3\\u951a\\u5b9a\\u5728\\u5e95\\u90e8 | Messages are shown in chronological order, keep viewport anchored at the bottom.
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
    const isLayerMismatch = escapedUnicodeRegExp('\\u672a\\u627e\\u5230\\u5339\\u914d.?\\u5f53\\u524d.?\\u7684\\u8f6c\\u5199\\u5c42|no matching\\s+"?current"?\\s+transcription\\s+layer', 'i').test(raw);
    return isLayerMismatch
      ? (isZh ? decodeEscapedUnicode('⚠ \\u672a\\u627e\\u5230\\u5339\\u914d“\\u5f53\\u524d”\\u7684\\u8f6c\\u5199\\u5c42') : '⚠ No matching "current" transcription layer found')
      : (isZh ? `⚠ ${raw}` : `⚠ ${raw}`);
  }, [aiLastError, isZh]);
  const inputBlockedReason = useMemo(() => {
    if (hasToolPending) {
      return isZh ? decodeEscapedUnicode('\\u5b58\\u5728\\u5f85\\u786e\\u8ba4\\u7684\\u9ad8\\u98ce\\u9669\\u64cd\\u4f5c，\\u8bf7\\u5148\\u786e\\u8ba4\\u6216\\u53d6\\u6d88。') : 'A high-risk action is pending. Confirm or cancel it first.';
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
  const ragQuickMenuRef = useRef<HTMLDivElement | null>(null);
  const decisionPanelBodyRef = useRef<HTMLDivElement | null>(null);
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
    const measuredHeight = decisionPanelBodyRef.current?.getBoundingClientRect().height ?? 0;
    const initial = clampDecisionPanelHeight(measuredHeight > 0 ? measuredHeight : (decisionPanelMaxHeight ?? preferred));
    decisionResizeStartYRef.current = event.clientY;
    decisionResizeStartHeightRef.current = initial;
    setIsDecisionPanelResizing(true);
  };

  const voiceDrawerInlineStyle: CSSProperties | undefined = voiceDrawerMaxHeight !== null
    ? ({ ['--ai-voice-drawer-max-height' as string]: `${voiceDrawerMaxHeight}px` } as CSSProperties)
    : undefined;

  const decisionPanelInlineStyle: CSSProperties | undefined = decisionPanelMaxHeight !== null
    ? ({
      ['--ai-decision-panel-max-height' as string]: `${decisionPanelMaxHeight}px`,
      ['--ai-decision-panel-body-height' as string]: `${decisionPanelMaxHeight}px`,
    } as CSSProperties)
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
    if (!showRagQuickScenarios || typeof window === 'undefined') return;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!ragQuickMenuRef.current?.contains(event.target as Node)) {
        setShowRagQuickScenarios(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setShowRagQuickScenarios(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showRagQuickScenarios]);

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

  // \\u4ece\\u672c\\u5730\\u6587\\u4ef6\\u5bfc\\u5165 golden snapshot \\u5e76\\u4e0e\\u5f53\\u524d replay bundle \\u5bf9\\u6bd4 | Import a local golden snapshot and diff it against the current bundle
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
      showTransientBlockedReason(isZh ? decodeEscapedUnicode('AI \\u5bf9\\u8bdd\\u5c1a\\u672a\\u5c31\\u7eea，\\u8bf7\\u7a0d\\u540e\\u91cd\\u8bd5。') : 'AI chat is not ready yet. Please try again shortly.');
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(isZh ? decodeEscapedUnicode('\\u4e0a\\u4e00\\u6761\\u56de\\u590d\\u4ecd\\u5728\\u751f\\u6210\\u4e2d，\\u505c\\u6b62\\u540e\\u53ef\\u7ee7\\u7eed\\u53d1\\u9001。') : 'Previous reply is still streaming. Stop it before sending.');
      return;
    }
    if (hasToolPending) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? (isZh ? decodeEscapedUnicode('\\u5b58\\u5728\\u5f85\\u786e\\u8ba4\\u64cd\\u4f5c，\\u8bf7\\u5148\\u5904\\u7406\\u540e\\u518d\\u53d1\\u9001。') : 'A pending action must be handled before sending.'));
      return;
    }
    void onSendAiMessage(text);
    setChatInput('');
  };

  return (
    <div className={`transcription-ai-card ${embedded ? 'transcription-ai-card-embedded' : ''}`}>
      {/* P0: Header — redesigned as a chat-area header */}
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <div className="ai-chat-header-info">
            <div className="ai-chat-header-title-row">
              <span className="ai-chat-header-title">{chatTitle}</span>
            </div>
          </div>
          <div className="ai-chat-header-tools">
            <div className="transcription-ai-mode-switch" role="group" aria-label={isZh ? decodeEscapedUnicode('\\u5de5\\u5177\\u53cd\\u9988\\u98ce\\u683c') : 'Tool feedback style'}>
              <button
                type="button"
                className={`transcription-ai-mode-btn ${(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed' ? 'is-active' : ''}`}
                disabled={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed'}
                aria-pressed={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed'}
                onClick={() => onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' })}
              >
                {isZh ? decodeEscapedUnicode('\\u8be6\\u7ec6') : 'Detailed'}
              </button>
              <button
                type="button"
                className={`transcription-ai-mode-btn ${(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise' ? 'is-active' : ''}`}
                disabled={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise'}
                aria-pressed={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise'}
                onClick={() => onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' })}
              >
                {isZh ? decodeEscapedUnicode('\\u7b80\\u6d01') : 'Concise'}
              </button>
            </div>
            <span
              className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone} ai-chat-provider-status-dot-inline`}
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
              className="icon-btn ai-chat-header-config-btn"
              aria-label={showProviderConfig ? (isZh ? decodeEscapedUnicode('\\u6536\\u8d77\\u914d\\u7f6e') : 'Hide provider config') : (isZh ? decodeEscapedUnicode('\\u6253\\u5f00\\u914d\\u7f6e') : 'Open provider config')}
              title={showProviderConfig ? (isZh ? decodeEscapedUnicode('\\u6536\\u8d77\\u914d\\u7f6e') : 'Hide provider config') : (isZh ? decodeEscapedUnicode('\\u6253\\u5f00\\u914d\\u7f6e') : 'Open provider config')}
              onClick={() => setShowProviderConfig((prev) => !prev)}
            >
              <Settings size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* P0: Provider config panel (collapsible below header) */}
      {aiChatSettings && showProviderConfig && (
        <div style={{ borderBottom: '1px dashed var(--border-soft)', padding: '6px 10px 8px', display: 'grid', gap: 6 }}>
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
                  ? <><Check size={12} strokeWidth={2.5} style={{ marginRight: 2, verticalAlign: -1 }} />{isZh ? decodeEscapedUnicode('\\u5df2\\u8fde\\u63a5') : 'Connected'}</>
                  : t(locale, 'ai.chat.testConnection')}
            </button>
            {hasApiKeyField && (
              <button
                type="button"
                className="icon-btn"
                style={{ height: 26, minWidth: 96, fontSize: 12 }}
                onClick={() => onUpdateAiChatSettings?.({ apiKey: '' })}
              >
                {isZh ? decodeEscapedUnicode('\\u6e05\\u7a7a\\u5f53\\u524d Key') : 'Clear Current Key'}
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
                      ? (isZh ? decodeEscapedUnicode('\\u6b63\\u5728\\u89e3\\u6790\\u5de5\\u5177\\u8c03\\u7528…') : 'Parsing tool call...')
                      : (assistantMsg.content || (assistantMsg.status === 'streaming'
                        ? (assistantMsg.thinking ? (isZh ? decodeEscapedUnicode('\\u6b63\\u5728\\u601d\\u8003...') : 'Thinking...') : '...')
                        : (assistantMsg.status === 'aborted' ? decodeEscapedUnicode('⏹ \\u5df2\\u4e2d\\u65ad') : ''))))
                    : '';
                  const reasoningContent = assistantMsg?.reasoningContent;
                  const hasReasoning = typeof reasoningContent === 'string' && reasoningContent.length > 0;
                  const isReasoningExpanded = hasReasoning && expandedReasoningIds.has(assistantMsg?.id ?? '');
                  // \\u539f\\u59cb\\u5f15\\u7528\\u4fdd\\u6301\\u6ce8\\u5165\\u987a\\u5e8f，\\u7528\\u4e8e [N] \\u6807\\u8bb0\\u89e3\\u6790 | Raw citations keep injection order for [N] marker resolution
                  const rawCitations = assistantMsg?.citations ?? [];
                  const hasInlineMarkers = rawCitations.length > 0 && /\[\d+\]/.test(assistantContent);
                  // \\u6709\\u884c\\u5185\\u6807\\u8bb0\\u65f6\\u4fdd\\u6301\\u6ce8\\u5165\\u987a\\u5e8f；\\u5426\\u5219\\u6309\\u7c7b\\u578b\\u6392\\u5e8f\\u517c\\u5bb9\\u65e7\\u6d88\\u606f | Injection order when markers exist; type-sorted for legacy
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
                  const copyableAssistantContent = buildCopyableAssistantPlainText({
                    content: assistantMsg?.content ?? '',
                    citations: orderedCitations,
                    locale,
                  });
                  const hasCopyableAssistantContent = copyableAssistantContent.length > 0;
                  const showAiGeneratedText = assistantMsg?.generationSource === 'llm' && assistantMsg?.status === 'done';
                  const generatedModelName = (assistantMsg?.generationModel ?? '').trim();
                  const generatedLabel = generatedModelName.length > 0
                    ? (isZh ? decodeEscapedUnicode(`${generatedModelName} \\u751f\\u6210`) : `${generatedModelName} Generated`)
                    : (isZh ? decodeEscapedUnicode('AI \\u751f\\u6210') : 'AI Generated');
                  const userContent = userMsg
                    ? (userMsg.content || (userMsg.status === 'streaming' ? '...' : (userMsg.status === 'aborted' ? decodeEscapedUnicode('⏹ \\u5df2\\u4e2d\\u65ad') : '')))
                    : '';

                  return (
                    <div
                      key={`${assistantMsg?.id ?? 'na'}-${userMsg?.id ?? 'nu'}`}
                      className="ai-chat-turn"
                      data-index={index}
                    >
                      {userMsg && (
                        <div className="ai-chat-message-bubble ai-chat-message-user">
                          <div className="ai-chat-message-surface">
                            <span className="ai-chat-message-content">{userContent}</span>
                          </div>
                        </div>
                      )}

                      {assistantMsg && (
                        <div className="ai-chat-message-bubble ai-chat-message-assistant">
                          <div className="ai-chat-message-surface">
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
                            {/* \\u53ef\\u6298\\u53e0\\u7684\\u63a8\\u7406\\u8fc7\\u7a0b | Collapsible reasoning content */}
                            {hasReasoning && isReasoningExpanded && (
                              <div
                                className="ai-chat-reasoning-block"
                                style={{
                                  marginTop: 6,
                                  padding: '4px 8px',
                                  background: 'color-mix(in srgb, var(--text-secondary) 8%, transparent)',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  lineHeight: 1.5,
                                  fontStyle: 'italic',
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: 2, fontStyle: 'normal' }}>
                                  {isZh ? decodeEscapedUnicode('💭 \\u63a8\\u7406\\u8fc7\\u7a0b') : '💭 Reasoning'}
                                </div>
                                <div>{reasoningContent}</div>
                              </div>
                            )}
                          </div>
                          {(hasCopyableAssistantContent || orderedCitations.length > 0 || hasReasoning || showAiGeneratedText) && (
                            <div className="ai-chat-message-actions">
                              {hasCopyableAssistantContent && (
                                <button
                                  type="button"
                                  className="icon-btn ai-chat-message-copy-btn"
                                  title={copiedMessageId === assistantMsg.id
                                    ? (isZh ? decodeEscapedUnicode('\\u5df2\\u590d\\u5236') : 'Copied')
                                    : (isZh ? decodeEscapedUnicode('\\u590d\\u5236') : 'Copy')}
                                  aria-label={copiedMessageId === assistantMsg.id
                                    ? (isZh ? decodeEscapedUnicode('\\u5df2\\u590d\\u5236') : 'Copied')
                                    : (isZh ? decodeEscapedUnicode('\\u590d\\u5236') : 'Copy')}
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
                                    ? (isZh ? decodeEscapedUnicode('▲ \\u9690\\u85cf\\u63a8\\u7406') : '▲ Hide reasoning')
                                    : (isZh ? decodeEscapedUnicode('▼ \\u67e5\\u770b\\u63a8\\u7406') : '▼ Show reasoning')}
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
            debugUiShowAll={false}
            showAlertBar={showAlertBar}
            aiPendingToolCall={aiPendingToolCall}
            onDismissErrorWarning={() => setDismissedErrorWarning(true)}
            onToggleAlertBar={() => setShowAlertBar((prev) => !prev)}
            onConfirmPendingToolCall={onConfirmPendingToolCall}
            onCancelPendingToolCall={onCancelPendingToolCall}
          />

          {/* \\u5019\\u9009\\u5feb\\u6377\\u56de\\u590d\\u6761 | Candidate quick-reply chips */}
          {aiTaskSession?.status === 'waiting_clarify' && (aiTaskSession.candidates ?? []).length > 0 && (
            <AiChatCandidateChips
              isZh={isZh}
              aiIsStreaming={Boolean(aiIsStreaming)}
              debugUiShowAll={false}
              candidates={aiTaskSession?.candidates ?? []}
              onSendAiMessage={onSendAiMessage}
            />
          )}

          {/* Input row */}
          <div className="ai-chat-composer">
            {quickPromptTemplates.length > 0 && (
              <div className="ai-chat-composer-shortcuts">
                {quickPromptTemplates.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="icon-btn ai-chat-composer-shortcut"
                    onClick={() => injectPromptTemplate(item.content)}
                  >
                    {item.title}
                  </button>
                ))}
                {quickPromptTemplates.length > 3 && (
                  <div ref={ragQuickMenuRef} className="ai-chat-rag-quick-menu-wrap">
                    <button
                      type="button"
                      className="icon-btn ai-chat-composer-shortcut ai-chat-composer-shortcut-muted"
                      aria-expanded={showRagQuickScenarios}
                      aria-haspopup="true"
                      onClick={() => setShowRagQuickScenarios((prev) => !prev)}
                    >
                      {isZh ? decodeEscapedUnicode('\\u66f4\\u591a') : 'More'}
                    </button>
                    {showRagQuickScenarios && (
                      <div className="ai-chat-rag-quick-menu" role="dialog" aria-label={isZh ? decodeEscapedUnicode('RAG \\u5feb\\u6377\\u573a\\u666f') : 'RAG Quick Scenarios'}>
                        {quickPromptTemplates.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="icon-btn ai-chat-action-btn ai-chat-action-btn-quiet ai-chat-rag-quick-menu-btn"
                            onClick={() => {
                              injectPromptTemplate(item.content);
                              setShowRagQuickScenarios(false);
                            }}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="ai-chat-composer-row">
              <input
                className="ai-chat-input ai-chat-input-composer"
              type="text"
              value={chatInput}
              placeholder={t(locale, 'ai.chat.inputPlaceholder')}
              onChange={(e) => setChatInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                const native = e.nativeEvent as KeyboardEvent;
                // \\u8f93\\u5165\\u6cd5\\u7ec4\\u5408\\u671f\\u95f4\\u56de\\u8f66\\u7528\\u4e8e\\u9009\\u8bcd，\\u4e0d\\u5e94\\u89e6\\u53d1\\u53d1\\u9001 | Enter should not submit while IME composition is active.
                if (native.isComposing || native.keyCode === 229) return;
                if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                e.preventDefault();
                submitChatInput();
              }}
              />
              <button
                type="button"
                className={`icon-btn ai-chat-composer-send-btn${aiIsStreaming ? ' is-streaming' : ''}`}
                aria-label={aiIsStreaming ? (isZh ? decodeEscapedUnicode('\\u505c\\u6b62\\u751f\\u6210') : 'Stop generating') : t(locale, 'ai.chat.send')}
                disabled={aiIsStreaming ? !onStopAiMessage : (!onSendAiMessage || hasToolPending)}
                onClick={() => {
                  if (aiIsStreaming) {
                    onStopAiMessage?.();
                    return;
                  }
                  submitChatInput();
                }}
              >
                {aiIsStreaming ? (isZh ? decodeEscapedUnicode('\\u505c\\u6b62') : 'Stop') : <ArrowUp size={16} strokeWidth={2} />}
              </button>
            </div>
            {(transientBlockedReason || inputBlockedReason) && (
              <p className="small-text" style={{ margin: 0, color: 'var(--state-warning-text)' }}>{transientBlockedReason ?? inputBlockedReason}</p>
            )}

            <div className={`ai-chat-prompt-lab-panel ${showPromptLab ? 'is-open' : 'is-closed'}${promptTemplates.length === 0 ? ' is-empty' : ''}`}>
              <button
                type="button"
                className="ai-chat-prompt-lab-panel-head"
                onClick={() => setShowPromptLab((prev) => !prev)}
                aria-expanded={showPromptLab}
              >
                <span className="ai-chat-prompt-lab-panel-title">
                  {isZh ? decodeEscapedUnicode('Prompt \\u5b9e\\u9a8c\\u5ba4') : 'Prompt Lab'}
                  <span className="ai-chat-decision-panel-bracket">{isZh ? ' · ' : ' · '}</span>
                  <span className="ai-chat-decision-panel-count">{promptTemplates.length}{isZh ? decodeEscapedUnicode(' \\u9879') : ''}</span>
                </span>
                <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
              </button>
              <div className="ai-chat-prompt-lab-panel-body" aria-hidden={!showPromptLab}>
                <AiChatPromptLabModal
                  isZh={isZh}
                  showPromptLab={showPromptLab}
                  promptTemplates={promptTemplates}
                  editingTemplateId={editingTemplateId}
                  templateTitleInput={templateTitleInput}
                  templateContentInput={templateContentInput}
                  onInjectTemplate={injectPromptTemplate}
                  onEditTemplate={editPromptTemplate}
                  onRemoveTemplate={removePromptTemplate}
                  onTemplateTitleInputChange={setTemplateTitleInput}
                  onTemplateContentInputChange={setTemplateContentInput}
                  onAppendPromptVariable={appendPromptVariable}
                  onSaveTemplate={savePromptTemplate}
                  onInjectAndClose={() => {
                    injectPromptTemplate(templateContentInput);
                  }}
                />
              </div>
            </div>
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
                    <span className="ai-chat-voice-drawer-title">{isZh ? decodeEscapedUnicode('\\u8bed\\u97f3\\u8f93\\u5165') : 'Voice Input'}</span>
                    <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                  </button>
                  <div className="ai-chat-voice-drawer-body" aria-hidden={!voiceEntry.expanded}>
                    {voiceEntry.expanded && (
                      <div
                        className="ai-chat-voice-drawer-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={isZh ? decodeEscapedUnicode('\\u62d6\\u52a8\\u8c03\\u6574\\u8bed\\u97f3\\u9762\\u677f\\u9ad8\\u5ea6') : 'Drag to resize voice panel height'}
                        onPointerDown={startVoiceDrawerResize}
                      />
                    )}
                    {voiceDrawer ?? <p className="ai-chat-fold-empty">{isZh ? decodeEscapedUnicode('\\u8bed\\u97f3\\u9762\\u677f\\u6682\\u4e0d\\u53ef\\u7528') : 'Voice panel is temporarily unavailable'}</p>}
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
                    {isZh ? decodeEscapedUnicode('AI \\u51b3\\u7b56') : 'AI Decisions'}
                    <span className="ai-chat-decision-panel-bracket">{isZh ? ' · ' : ' · '}</span>
                    <span className="ai-chat-decision-panel-count">{aiToolDecisionLogs?.length ?? 0}{isZh ? decodeEscapedUnicode(' \\u6761') : ''}</span>
                  </span>
                  <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                </button>
                  <div
                    ref={decisionPanelBodyRef}
                    className="ai-chat-decision-panel-body"
                    aria-hidden={!showDecisionPanel}
                  >
                    {showDecisionPanel && (
                      <div
                        className="ai-chat-decision-panel-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={isZh ? decodeEscapedUnicode('\\u62d6\\u52a8\\u8c03\\u6574 AI \\u51b3\\u7b56\\u533a\\u9ad8\\u5ea6') : 'Drag to resize AI decision panel height'}
                        onPointerDown={startDecisionPanelResize}
                      />
                    )}
                    {!hasDecisionLogs && (
                      <p className="ai-chat-fold-empty">{isZh ? decodeEscapedUnicode('\\u6682\\u65e0\\u51b3\\u7b56\\u8bb0\\u5f55') : 'No decisions yet'}</p>
                    )}
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(aiToolDecisionLogs ?? []).map((item) => {
                        const canReplay = typeof item.requestId === 'string' && item.requestId.trim().length > 0;
                        const isLoading = replayLoadingRequestId === item.requestId;
                        const isSelected = selectedReplayBundle?.requestId === item.requestId;
                        return (
                          <div key={item.id} className="ai-chat-decision-item" style={{ display: 'grid', gap: 4, fontSize: 10 }}>
                            <div className="ai-chat-decision-item-meta">
                              <span className="ai-chat-decision-item-main">{item.toolName || (isZh ? decodeEscapedUnicode('\\u672a\\u77e5\\u5de5\\u5177') : 'unknown')} · {formatToolDecision(isZh, item.decision)}</span>
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
                                  {isLoading ? (isZh ? decodeEscapedUnicode('\\u8bfb\\u53d6\\u4e2d...') : 'Loading...') : (isSelected ? (isZh ? decodeEscapedUnicode('\\u5df2\\u6253\\u5f00\\u56de\\u653e') : 'Replay Opened') : (isZh ? decodeEscapedUnicode('\\u67e5\\u770b\\u56de\\u653e/\\u5bf9\\u6bd4') : 'Replay / Compare'))}
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ height: 22, minWidth: 92, fontSize: 10 }}
                                  onClick={() => void exportGoldenSnapshot(item.requestId!)}
                                >
                                  {exportedSnapshotRequestId === item.requestId
                                    ? (isZh ? decodeEscapedUnicode('\\u5df2\\u5bfc\\u51fa\\u5feb\\u7167') : 'Snapshot Exported')
                                    : (isZh ? decodeEscapedUnicode('\\u5bfc\\u51fa\\u5feb\\u7167') : 'Export Snapshot')}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {replayErrorMessage && (
                        <div style={{ fontSize: 10, color: 'var(--state-danger-text)' }}>{replayErrorMessage}</div>
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

        </>
      )}
    </div>
  );
}
