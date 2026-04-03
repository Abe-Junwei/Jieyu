import { Fragment, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowUp, Check, Copy, Settings, X } from 'lucide-react';
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
import { escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';
import { getAiChatCardMessages } from '../../i18n/aiChatCardMessages';
import { DialogShell } from '../ui/DialogShell';
import { AiPanelContext } from '../../contexts/AiPanelContext';
import { useGlobalContext } from '../../services/GlobalContextService';
import { deriveAdaptiveProfileFromMessages, mergeAdaptiveProfiles } from '../../ai/chat/adaptiveInputProfile';
import { rankCandidateLabelsByAdaptiveProfile } from './aiChatAdaptiveRanking';
import { useAiChatHybridRecommendations } from './useAiChatHybridRecommendations';

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

function normalizeRecommendationText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function classifyRecommendationAdoption(
  inputText: string,
  recommendedText: string,
): 'accepted_exact' | 'accepted_edited' | null {
  const normalizedInput = normalizeRecommendationText(inputText);
  const normalizedRecommended = normalizeRecommendationText(recommendedText);
  if (!normalizedInput || !normalizedRecommended) return null;
  if (normalizedInput === normalizedRecommended) return 'accepted_exact';

  const anchorLength = normalizedRecommended.length >= 16 ? 10 : 6;
  const recommendedAnchor = normalizedRecommended.slice(0, Math.min(anchorLength, normalizedRecommended.length));
  if (recommendedAnchor.length >= 4 && normalizedInput.startsWith(recommendedAnchor)) {
    return 'accepted_edited';
  }

  let sharedPrefix = 0;
  while (
    sharedPrefix < normalizedInput.length
    && sharedPrefix < normalizedRecommended.length
    && normalizedInput[sharedPrefix] === normalizedRecommended[sharedPrefix]
  ) {
    sharedPrefix += 1;
  }

  return sharedPrefix / normalizedRecommended.length >= 0.45 ? 'accepted_edited' : null;
}

export function AiChatCard({ embedded = false, voiceDrawer, voiceEntry }: AiChatCardProps = {}) {
  const locale = useLocale();
  const {
    currentPage,
    selectedUtterance,
    selectedRowMeta,
    selectedUnitKind,
    selectedLayerType,
    selectedText,
    selectedTimeRangeLabel,
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
    aiSessionMemory,
    aiToolDecisionLogs,
    onUpdateAiChatSettings,
    onTestAiConnection,
    onSendAiMessage,
    onStopAiMessage,
    onClearAiMessages,
    onConfirmPendingToolCall,
    onCancelPendingToolCall,
    onTrackAiRecommendationEvent,
    observerStage,
    onJumpToCitation,
  } = useAiAssistantHubContext();
  const aiPanelContext = useContext(AiPanelContext);
  const { profile } = useGlobalContext();

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
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lastTrackedRecommendationSignatureRef = useRef<string | null>(null);
  const exposedRecommendationRef = useRef<{ prompt: string; source: 'fallback' | 'llm'; signature: string } | null>(null);
  const [dismissedRecommendationSignature, setDismissedRecommendationSignature] = useState<string | null>(null);

  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const isZh = locale === 'zh-CN';
  const cardMessages = useMemo(() => getAiChatCardMessages(isZh), [isZh]);
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

  const adaptiveInputProfile = useMemo(
    () => mergeAdaptiveProfiles(
      deriveAdaptiveProfileFromMessages(aiMessages ?? []),
      aiSessionMemory?.adaptiveInputProfile,
    ),
    [aiMessages, aiSessionMemory?.adaptiveInputProfile],
  );

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
    ...(adaptiveInputProfile !== undefined ? { adaptiveInputProfile } : {}),
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
      { label: cardMessages.providerGroupOfficial, items: pick(directKinds) },
      { label: cardMessages.providerGroupCompatible, items: pick(compatibleKinds) },
      { label: cardMessages.providerGroupLocalCustom, items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, [cardMessages]);

  const providerStatusLabel = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    return cardMessages.providerStatusLabel(kind, aiConnectionTestStatus);
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus, cardMessages]);

  const providerStatusTone = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    if (aiConnectionTestStatus === 'error') return 'error';
    if (aiConnectionTestStatus === 'success') return 'ok';
    if (kind === 'mock' || kind === 'ollama') return 'local';
    return 'idle';
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus]);

  const inputPlaceholder = useMemo(() => cardMessages.recommendedInputPlaceholder({
    fallback: t(locale, 'ai.chat.inputPlaceholder'),
    page: currentPage,
    observerStage,
    aiCurrentTask: aiPanelContext?.aiCurrentTask,
    rowNumber: selectedRowMeta?.rowNumber ?? null,
    selectedText: selectedText ?? '',
    annotationStatus: selectedUtterance?.annotationStatus ?? null,
    confidence: selectedUtterance?.ai_metadata?.confidence ?? null,
    lexemeCount: lexemeMatches.length,
    lastToolName: aiTaskSession?.toolName ?? aiSessionMemory?.lastToolName ?? null,
    preferredMode: profile.preferences.preferredMode,
    confirmationThreshold: profile.preferences.confirmationThreshold,
    selectedUnitKind: selectedUnitKind ?? null,
    ...(adaptiveInputProfile?.dominantIntent !== undefined ? { adaptiveIntent: adaptiveInputProfile.dominantIntent } : {}),
    ...(adaptiveInputProfile?.preferredResponseStyle !== undefined ? { adaptiveResponseStyle: adaptiveInputProfile.preferredResponseStyle } : {}),
    ...(adaptiveInputProfile?.topKeywords !== undefined ? { adaptiveKeywords: adaptiveInputProfile.topKeywords } : {}),
    ...(adaptiveInputProfile?.lastPromptExcerpt !== undefined ? { adaptiveLastPromptExcerpt: adaptiveInputProfile.lastPromptExcerpt } : {}),
    ...(selectedLayerType !== undefined ? { selectedLayerType } : {}),
    ...(selectedTimeRangeLabel !== undefined ? { selectedTimeRangeLabel } : {}),
  }), [
    adaptiveInputProfile?.dominantIntent,
    adaptiveInputProfile?.lastPromptExcerpt,
    adaptiveInputProfile?.preferredResponseStyle,
    adaptiveInputProfile?.topKeywords,
    aiPanelContext?.aiCurrentTask,
    aiTaskSession?.toolName,
    aiSessionMemory?.lastToolName,
    cardMessages,
    currentPage,
    lexemeMatches.length,
    locale,
    observerStage,
    profile.preferences.confirmationThreshold,
    profile.preferences.preferredMode,
    selectedLayerType,
    selectedRowMeta?.rowNumber,
    selectedText,
    selectedTimeRangeLabel,
    selectedUnitKind,
    selectedUtterance,
  ]);

  const rankedClarifyCandidates = useMemo(
    () => rankCandidateLabelsByAdaptiveProfile(aiTaskSession?.candidates ?? [], adaptiveInputProfile),
    [adaptiveInputProfile, aiTaskSession?.candidates],
  );

  const hybridRecommendations = useAiChatHybridRecommendations({
    locale,
    enabled: aiChatEnabled,
    composerIdle: chatInput.trim().length === 0 && !aiIsStreaming,
    aiChatSettings,
    connectionTestStatus: aiConnectionTestStatus,
    recommendationTelemetry: aiSessionMemory?.recommendationTelemetry,
    primarySuggestion: inputPlaceholder,
    page: currentPage,
    observerStage,
    aiCurrentTask: aiPanelContext?.aiCurrentTask,
    rowNumber: selectedRowMeta?.rowNumber ?? null,
    selectedText: selectedText ?? '',
    annotationStatus: selectedUtterance?.annotationStatus ?? null,
    confidence: selectedUtterance?.ai_metadata?.confidence ?? null,
    lexemeCount: lexemeMatches.length,
    lastToolName: aiTaskSession?.toolName ?? aiSessionMemory?.lastToolName ?? null,
    preferredMode: profile.preferences.preferredMode,
    confirmationThreshold: profile.preferences.confirmationThreshold,
    selectedUnitKind: selectedUnitKind ?? null,
    selectedLayerType: selectedLayerType ?? null,
    selectedTimeRangeLabel: selectedTimeRangeLabel ?? null,
    ...(adaptiveInputProfile?.dominantIntent !== undefined ? { adaptiveIntent: adaptiveInputProfile.dominantIntent } : {}),
    ...(adaptiveInputProfile?.preferredResponseStyle !== undefined ? { adaptiveResponseStyle: adaptiveInputProfile.preferredResponseStyle } : {}),
    ...(adaptiveInputProfile?.topKeywords !== undefined ? { adaptiveKeywords: adaptiveInputProfile.topKeywords } : {}),
    ...(adaptiveInputProfile?.lastPromptExcerpt !== undefined ? { adaptiveLastPromptExcerpt: adaptiveInputProfile.lastPromptExcerpt } : {}),
  });
  const topHybridRecommendation = hybridRecommendations.items[0];
  const hybridInputSuggestion = topHybridRecommendation?.prompt ?? inputPlaceholder;
  const hybridInputSignature = topHybridRecommendation
    ? `${hybridRecommendations.source}:${topHybridRecommendation.prompt}`
    : `fallback:${inputPlaceholder}`;
  const showInlineRecommendation = chatInput.length === 0
    && !aiIsStreaming
    && hybridInputSuggestion.trim().length > 0
    && dismissedRecommendationSignature !== hybridInputSignature;
  const composerPlaceholder = showInlineRecommendation ? '' : inputPlaceholder;

  useEffect(() => {
    if (dismissedRecommendationSignature !== hybridInputSignature) return;
    setDismissedRecommendationSignature(null);
  }, [dismissedRecommendationSignature, hybridInputSignature]);

  useEffect(() => {
    const topRecommendation = hybridRecommendations.items[0];
    if (!topRecommendation || !showInlineRecommendation || !onTrackAiRecommendationEvent) return;
    const signature = `${hybridRecommendations.source}:${topRecommendation.prompt}`;
    if (lastTrackedRecommendationSignatureRef.current === signature) return;
    lastTrackedRecommendationSignatureRef.current = signature;
    exposedRecommendationRef.current = {
      prompt: topRecommendation.prompt,
      source: hybridRecommendations.source,
      signature,
    };
    onTrackAiRecommendationEvent({
      type: 'shown',
      source: hybridRecommendations.source,
      prompt: topRecommendation.prompt,
      signature,
      timestamp: new Date().toISOString(),
    });
  }, [hybridRecommendations.items, hybridRecommendations.source, onTrackAiRecommendationEvent, showInlineRecommendation]);

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
      ? cardMessages.layerMismatchWarning
      : `⚠ ${raw}`;
  }, [aiLastError, cardMessages]);
  const inputBlockedReason = useMemo(() => {
    if (hasToolPending) {
      return cardMessages.highRiskPending;
    }
    return null;
  }, [hasToolPending, cardMessages]);
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
      showTransientBlockedReason(cardMessages.chatNotReady);
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(cardMessages.previousReplyStreaming);
      return;
    }
    if (hasToolPending) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? cardMessages.pendingActionBeforeSend);
      return;
    }
    const exposedRecommendation = exposedRecommendationRef.current;
    if (exposedRecommendation && onTrackAiRecommendationEvent) {
      const adoptionType = classifyRecommendationAdoption(text, exposedRecommendation.prompt);
      if (adoptionType) {
        onTrackAiRecommendationEvent({
          type: adoptionType,
          source: exposedRecommendation.source,
          prompt: exposedRecommendation.prompt,
          signature: exposedRecommendation.signature,
          timestamp: new Date().toISOString(),
        });
      }
    }
    void onSendAiMessage(text);
    setChatInput('');
    setDismissedRecommendationSignature(null);
  };

  const applyInlineRecommendation = (): void => {
    if (!topHybridRecommendation) return;
    setChatInput(topHybridRecommendation.prompt);
    setDismissedRecommendationSignature(null);
    const input = chatInputRef.current;
    if (!input) return;
    if (typeof window === 'undefined') {
      input.focus();
      return;
    }
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
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
            <div className="transcription-ai-mode-switch" role="group" aria-label={cardMessages.toolFeedbackStyle}>
              <button
                type="button"
                className={`transcription-ai-mode-btn ${(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed' ? 'is-active' : ''}`}
                disabled={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed'}
                aria-pressed={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'detailed'}
                onClick={() => onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' })}
              >
                {cardMessages.detailed}
              </button>
              <button
                type="button"
                className={`transcription-ai-mode-btn ${(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise' ? 'is-active' : ''}`}
                disabled={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise'}
                aria-pressed={(aiChatSettings?.toolFeedbackStyle ?? 'detailed') === 'concise'}
                onClick={() => onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' })}
              >
                {cardMessages.concise}
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
              aria-label={showProviderConfig ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
              title={showProviderConfig ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
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
              style={{ height: 'calc(26px * var(--ui-font-scale, 1))', minWidth: 'calc(80px * var(--ui-font-scale, 1))', fontSize: 'calc(12px * var(--ui-font-scale, 1))' }}
              onClick={() => { if (!onTestAiConnection) return; void onTestAiConnection(); }}
            >
              {aiConnectionTestStatus === 'testing'
                ? t(locale, 'ai.chat.testing')
                : aiConnectionTestStatus === 'success'
                  ? <><Check size={12} strokeWidth={2.5} style={{ marginRight: 2, verticalAlign: -1 }} />{cardMessages.connected}</>
                  : t(locale, 'ai.chat.testConnection')}
            </button>
            {hasApiKeyField && (
              <button
                type="button"
                className="icon-btn"
                style={{ height: 'calc(26px * var(--ui-font-scale, 1))', minWidth: 'calc(96px * var(--ui-font-scale, 1))', fontSize: 'calc(12px * var(--ui-font-scale, 1))' }}
                onClick={() => onUpdateAiChatSettings?.({ apiKey: '' })}
              >
                {cardMessages.clearCurrentKey}
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
                      ? cardMessages.parsingToolCall
                      : (assistantMsg.content || (assistantMsg.status === 'streaming'
                        ? (assistantMsg.thinking ? cardMessages.thinking : '...')
                        : (assistantMsg.status === 'aborted' ? cardMessages.aborted : ''))))
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
                    ? cardMessages.generatedByModel(generatedModelName)
                    : cardMessages.aiGenerated;
                  const userContent = userMsg
                    ? (userMsg.content || (userMsg.status === 'streaming' ? '...' : (userMsg.status === 'aborted' ? cardMessages.aborted : '')))
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
                                  fontSize: 'calc(11px * var(--ui-font-scale, 1))',
                                  color: 'var(--text-secondary)',
                                  lineHeight: 1.5,
                                  fontStyle: 'italic',
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: 2, fontStyle: 'normal' }}>
                                  {cardMessages.reasoning}
                                </div>
                                <div>{reasoningContent}</div>
                              </div>
                            )}
                            {(hasCopyableAssistantContent || orderedCitations.length > 0 || hasReasoning || showAiGeneratedText) && (
                              <div className="ai-chat-message-actions">
                                {hasCopyableAssistantContent && (
                                  <button
                                    type="button"
                                    className="icon-btn ai-chat-message-copy-btn"
                                    title={copiedMessageId === assistantMsg.id
                                      ? cardMessages.copied
                                      : cardMessages.copy}
                                    aria-label={copiedMessageId === assistantMsg.id
                                      ? cardMessages.copied
                                      : cardMessages.copy}
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
                                      ? cardMessages.hideReasoning
                                      : cardMessages.showReasoning}
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
              candidates={rankedClarifyCandidates}
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
                      {cardMessages.more}
                    </button>
                    {showRagQuickScenarios && (
                      <DialogShell
                        className="ai-chat-rag-quick-menu"
                        compact
                        role="dialog"
                        aria-label={cardMessages.ragQuickScenarios}
                        headerClassName="ai-chat-rag-quick-menu-header"
                        bodyClassName="ai-chat-rag-quick-menu-body"
                        title={cardMessages.ragQuickScenarios}
                        actions={(
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setShowRagQuickScenarios(false)}
                              aria-label={`${cardMessages.ragQuickScenarios} ${t(locale, 'ai.assistantHub.cancel')}`}
                              title={`${cardMessages.ragQuickScenarios} ${t(locale, 'ai.assistantHub.cancel')}`}
                            >
                              <X size={16} />
                            </button>
                        )}
                      >
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
                      </DialogShell>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="ai-chat-composer-row">
              <div className="ai-chat-composer-input-wrap">
                <input
                  ref={chatInputRef}
                  className={`ai-chat-input ai-chat-input-composer${showInlineRecommendation ? ' has-ghost-suggestion' : ''}`}
                  type="text"
                  value={chatInput}
                  placeholder={composerPlaceholder}
                  aria-label={showInlineRecommendation ? hybridInputSuggestion : inputPlaceholder}
                  onChange={(e) => setChatInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    const native = e.nativeEvent as KeyboardEvent;
                    // \\u8f93\\u5165\\u6cd5\\u7ec4\\u5408\\u671f\\u95f4\\u56de\\u8f66\\u7528\\u4e8e\\u9009\\u8bcd，\\u4e0d\\u5e94\\u89e6\\u53d1\\u53d1\\u9001 | Enter should not submit while IME composition is active.
                    if (native.isComposing || native.keyCode === 229) return;
                    if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && showInlineRecommendation && e.key === 'ArrowRight') {
                      const input = chatInputRef.current;
                      const caretAtStart = !input || ((input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0);
                      if (caretAtStart) {
                        e.preventDefault();
                        applyInlineRecommendation();
                        return;
                      }
                    }
                    if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && showInlineRecommendation && e.key === 'Escape') {
                      e.preventDefault();
                      setDismissedRecommendationSignature(hybridInputSignature);
                      return;
                    }
                    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                    e.preventDefault();
                    submitChatInput();
                  }}
                />
                {showInlineRecommendation && (
                  <button
                    type="button"
                    className="ai-chat-input-ghost-suggestion"
                    onClick={applyInlineRecommendation}
                    aria-label={hybridInputSuggestion}
                    title={hybridInputSuggestion}
                  >
                    <span className="ai-chat-input-ghost-prefix">{cardMessages.recommendationTitle}</span>
                    <span className="ai-chat-input-ghost-text">{hybridInputSuggestion}</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                className={`icon-btn ai-chat-composer-send-btn${aiIsStreaming ? ' is-streaming' : ''}`}
                aria-label={aiIsStreaming ? cardMessages.stopGenerating : t(locale, 'ai.chat.send')}
                disabled={aiIsStreaming ? !onStopAiMessage : (!onSendAiMessage || hasToolPending)}
                onClick={() => {
                  if (aiIsStreaming) {
                    onStopAiMessage?.();
                    return;
                  }
                  submitChatInput();
                }}
              >
                {aiIsStreaming ? cardMessages.stop : <ArrowUp size={16} strokeWidth={2} />}
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
                  {cardMessages.promptLab}
                  <span className="ai-chat-decision-panel-bracket"> · </span>
                  <span className="ai-chat-decision-panel-count">{promptTemplates.length}{cardMessages.promptTemplateCountSuffix}</span>
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
                    <span className="ai-chat-voice-drawer-title">{cardMessages.voiceInput}</span>
                    <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                  </button>
                  <div className="ai-chat-voice-drawer-body" aria-hidden={!voiceEntry.expanded}>
                    {voiceEntry.expanded && (
                      <div
                        className="ai-chat-voice-drawer-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={cardMessages.dragResizeVoicePanelHeight}
                        onPointerDown={startVoiceDrawerResize}
                      />
                    )}
                    {voiceDrawer ?? <p className="ai-chat-fold-empty">{cardMessages.voicePanelUnavailable}</p>}
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
                    {cardMessages.aiDecisions}
                    <span className="ai-chat-decision-panel-bracket"> · </span>
                    <span className="ai-chat-decision-panel-count">{aiToolDecisionLogs?.length ?? 0}{cardMessages.decisionCountSuffix}</span>
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
                        aria-label={cardMessages.dragResizeDecisionPanelHeight}
                        onPointerDown={startDecisionPanelResize}
                      />
                    )}
                    {!hasDecisionLogs && (
                      <p className="ai-chat-fold-empty">{cardMessages.noDecisionsYet}</p>
                    )}
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(aiToolDecisionLogs ?? []).map((item) => {
                        const canReplay = typeof item.requestId === 'string' && item.requestId.trim().length > 0;
                        const isLoading = replayLoadingRequestId === item.requestId;
                        const isSelected = selectedReplayBundle?.requestId === item.requestId;
                        return (
                          <div key={item.id} className="ai-chat-decision-item" style={{ display: 'grid', gap: 4, fontSize: 'calc(10px * var(--ui-font-scale, 1))' }}>
                            <div className="ai-chat-decision-item-meta">
                              <span className="ai-chat-decision-item-main">{item.toolName || cardMessages.unknownTool} · {formatToolDecision(isZh, item.decision)}</span>
                              <em className="ai-chat-decision-item-time">{new Date(item.timestamp).toLocaleTimeString()}</em>
                            </div>
                            {canReplay && (
                              <div className="ai-chat-decision-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ height: 'calc(22px * var(--ui-font-scale, 1))', minWidth: 'calc(96px * var(--ui-font-scale, 1))', fontSize: 'calc(10px * var(--ui-font-scale, 1))' }}
                                  disabled={isLoading}
                                  onClick={() => void openReplayBundle(item.requestId!)}
                                >
                                  {isLoading ? cardMessages.loading : (isSelected ? cardMessages.replayOpened : cardMessages.replayCompare)}
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ height: 'calc(22px * var(--ui-font-scale, 1))', minWidth: 'calc(92px * var(--ui-font-scale, 1))', fontSize: 'calc(10px * var(--ui-font-scale, 1))' }}
                                  onClick={() => void exportGoldenSnapshot(item.requestId!)}
                                >
                                  {exportedSnapshotRequestId === item.requestId
                                    ? cardMessages.snapshotExported
                                    : cardMessages.exportSnapshot}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {replayErrorMessage && (
                        <div style={{ fontSize: 'calc(10px * var(--ui-font-scale, 1))', color: 'var(--state-danger-text)' }}>{replayErrorMessage}</div>
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
