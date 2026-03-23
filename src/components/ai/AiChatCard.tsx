import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Check, Copy, Settings } from 'lucide-react';
import {
  buildAiToolGoldenSnapshot,
  diffAiToolSnapshot,
  loadAiToolReplayBundle,
  serializeAiToolGoldenSnapshot,
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
    split_transcription_segment: '切分句段',
    delete_layer: '删除层',
    set_transcription_text: '写入转写',
    set_translation_text: '写入翻译',
    clear_translation_segment: '清空翻译',
    create_transcription_segment: '创建句段',
  };
  const enMap: Record<string, string> = {
    delete_transcription_segment: 'Delete Segment',
    split_transcription_segment: 'Split Segment',
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

function formatPendingConfirmActionLabel(
  isZh: boolean,
  callName: string,
): string {
  const isDeleteAction = callName === 'delete_transcription_segment' || callName === 'delete_layer';
  if (isDeleteAction) return isZh ? '确认删除' : 'Confirm Delete';
  return isZh ? '确认执行' : 'Confirm Action';
}

function normalizeImpactPreviewLines(
  lines: string[],
  reversible: boolean,
): string[] {
  const irreversiblePattern = /(不可逆|irreversible)/i;
  const reversiblePattern = /(可撤销|可逆|撤销恢复|undo|reversible)/i;

  return lines.filter((line) => {
    if (reversible) return !irreversiblePattern.test(line);
    return !reversiblePattern.test(line);
  });
}

function sanitizeSnapshotFileName(raw: string): string {
  return raw.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'snapshot';
}

function formatReplayableLabel(isZh: boolean, replayable: boolean): string {
  return replayable
    ? (isZh ? '可重放' : 'Replayable')
    : (isZh ? '仅可审计' : 'Audit only');
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
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>(() => loadPromptTemplatesFromStorage());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitleInput, setTemplateTitleInput] = useState('');
  const [templateContentInput, setTemplateContentInput] = useState('');
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
  const [showAlertBar, setShowAlertBar] = useState(alertCount > 0);
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
    try {
      const bundle = await loadAiToolReplayBundle(requestId);
      if (!bundle) {
        setSelectedReplayBundle(null);
        setReplayErrorMessage(isZh ? '未找到对应回放数据。' : 'Replay bundle was not found.');
        return;
      }
      setSelectedReplayBundle(bundle);
      // 若已导入对比快照，自动重算 diff | Auto-recompute diff if a baseline snapshot is loaded
      if (compareSnapshot) {
        setSnapshotDiff(diffAiToolSnapshot(compareSnapshot, bundle));
      }
    } catch (error) {
      setSelectedReplayBundle(null);
      setReplayErrorMessage(error instanceof Error ? error.message : (isZh ? '读取回放失败。' : 'Failed to load replay bundle.'));
    } finally {
      setReplayLoadingRequestId(null);
    }
  };

  const exportGoldenSnapshot = async (requestId: string): Promise<void> => {
    setReplayErrorMessage(null);
    try {
      const bundle = selectedReplayBundle?.requestId === requestId
        ? selectedReplayBundle
        : await loadAiToolReplayBundle(requestId);
      if (!bundle) {
        setReplayErrorMessage(isZh ? '导出失败：未找到对应回放数据。' : 'Export failed: replay bundle was not found.');
        return;
      }
      const payload = serializeAiToolGoldenSnapshot(bundle);
      if (typeof window === 'undefined') return;
      const blob = new Blob([payload], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `ai-tool-golden-${sanitizeSnapshotFileName(bundle.toolName)}-${bundle.requestId}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setSelectedReplayBundle(bundle);
      setExportedSnapshotRequestId(requestId);
      if (exportedSnapshotTimerRef.current !== null) {
        window.clearTimeout(exportedSnapshotTimerRef.current);
      }
      exportedSnapshotTimerRef.current = window.setTimeout(() => {
        setExportedSnapshotRequestId((current) => (current === requestId ? null : current));
        exportedSnapshotTimerRef.current = null;
      }, 1200);
    } catch (error) {
      setReplayErrorMessage(error instanceof Error ? error.message : (isZh ? '导出快照失败。' : 'Failed to export snapshot.'));
    }
  };

  // 从本地文件导入 golden snapshot 并与当前 replay bundle 对比 | Import a local golden snapshot and diff it against the current bundle
  const importSnapshotForCompare = (file: File): void => {
    setReplayErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as AiToolGoldenSnapshot;
        if (json?.schemaVersion !== 1 || typeof json?.requestId !== 'string') {
          setReplayErrorMessage(isZh ? '快照格式无效，请导入有效的 golden snapshot 文件。' : 'Invalid snapshot format. Please import a valid golden snapshot file.');
          return;
        }
        setCompareSnapshot(json);
        if (selectedReplayBundle) {
          setSnapshotDiff(diffAiToolSnapshot(json, selectedReplayBundle));
        }
      } catch {
        setReplayErrorMessage(isZh ? '快照解析失败，文件格式有误。' : 'Failed to parse snapshot file.');
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

          {errorWarningText && !dismissedErrorWarning && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid rgba(245, 158, 11, 0.4)',
              background: 'rgba(255, 251, 235, 0.9)',
              color: '#92400e',
              fontSize: 11,
            }}>
              <span>{errorWarningText}</span>
              <button
                type="button"
                className="icon-btn"
                style={{ height: 22, minWidth: 54, fontSize: 10 }}
                onClick={() => setDismissedErrorWarning(true)}
              >
                {isZh ? '清除' : 'Dismiss'}
              </button>
            </div>
          )}

          {/* P1: Unified AlertBar — collapsed single row, expands on click */}
          {(alertCount > 0 || debugUiShowAll) && (
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
                <span style={{ fontSize: 14 }}>{hasToolPending ? '⚡' : '📋'}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {hasToolPending && ` ${isZh ? '待确认工具调用' : 'Tool call pending'}`}
                  {debugUiShowAll && !hasToolPending && ` ${isZh ? '演示：告警详情区' : 'Demo: alert details'}`}
                </span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{showAlertBar ? (isZh ? '▲ 收起' : '▲ Hide') : (isZh ? '▼ 展开' : '▼ Expand')}</span>
              </button>

              {/* Expanded alert detail */}
              {showAlertBar && (
                <div style={{ padding: '0 10px 8px', display: 'grid', gap: 6 }}>
                  {aiPendingToolCall && (
                    <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 6, padding: '6px 8px', display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>{isZh ? '⚡ 删除操作确认' : '⚡ Confirm Destructive Action'}</div>
                      <div style={{ fontSize: 11 }}>{isZh ? '操作' : 'Action'}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                      {(() => {
                        const pendingTarget = formatPendingTarget(isZh, aiPendingToolCall.call);
                        if (!pendingTarget) return null;
                        return <div style={{ fontSize: 11 }}>{isZh ? '目标' : 'Target'}: {pendingTarget}</div>;
                      })()}
                      {aiPendingToolCall.riskSummary && <div style={{ fontSize: 11, color: '#92400e' }}>{aiPendingToolCall.riskSummary}</div>}
                      {aiPendingToolCall.previewContract && (
                        <div style={{ fontSize: 10, color: '#78350f', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span>{isZh ? '影响' : 'Affects'}: {aiPendingToolCall.previewContract.affectedCount} {isZh ? '项' : 'item(s)'}</span>
                          {!aiPendingToolCall.previewContract.reversible && <span style={{ color: '#b91c1c' }}>{isZh ? '不可逆' : 'Irreversible'}</span>}
                          {(aiPendingToolCall.previewContract.cascadeTypes ?? []).length > 0 && (
                            <span>{isZh ? '级联' : 'Cascade'}: {(aiPendingToolCall.previewContract.cascadeTypes ?? []).join(', ')}</span>
                          )}
                        </div>
                      )}
                      {normalizeImpactPreviewLines(
                        aiPendingToolCall.impactPreview ?? [],
                        aiPendingToolCall.previewContract?.reversible ?? false,
                      ).length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: '#7c2d12' }}>
                          {normalizeImpactPreviewLines(
                            aiPendingToolCall.impactPreview ?? [],
                            aiPendingToolCall.previewContract?.reversible ?? false,
                          ).slice(0, 3).map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 92, fontSize: 11 }} disabled={!onConfirmPendingToolCall} onClick={() => void onConfirmPendingToolCall?.()}>{formatPendingConfirmActionLabel(isZh, aiPendingToolCall.call.name)}</button>
                        <button type="button" className="icon-btn" style={{ height: 24, minWidth: 64, fontSize: 11 }} disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{isZh ? '取消' : 'Cancel'}</button>
                      </div>
                    </div>
                  )}
                  {debugUiShowAll && !aiPendingToolCall && (
                    <p className="small-text" style={{ margin: 0 }}>{isZh ? '演示模式：这里会显示错误和待确认工具调用详情。' : 'Demo mode: error and pending tool-call details appear here.'}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 候选快捷回复条 | Candidate quick-reply chips */}
          {((aiTaskSession?.status === 'waiting_clarify' && (aiTaskSession.candidates ?? []).length > 0) || debugUiShowAll) && (
            <div className="ai-chat-candidate-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0', flexShrink: 0 }}>
              {((aiTaskSession?.candidates ?? []).length > 0 ? (aiTaskSession?.candidates ?? []) : [{ key: 'demo-1', label: isZh ? '示例候选 1' : 'Sample candidate 1' }, { key: 'demo-2', label: isZh ? '示例候选 2' : 'Sample candidate 2' }]).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="icon-btn ai-chat-candidate-chip"
                  style={{ height: 26, fontSize: 11, padding: '0 10px', borderRadius: 13 }}
                  disabled={!onSendAiMessage || aiIsStreaming || debugUiShowAll}
                  onClick={() => {
                    if (debugUiShowAll) return;
                    void onSendAiMessage?.(c.label);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* 交互指标迷你仪表盘 | Interaction metrics mini dashboard */}
          {aiInteractionMetrics && (
            <div
              className="ai-chat-metrics-bar"
              style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', padding: '3px 0',
                fontSize: 10, color: '#64748b', flexShrink: 0,
              }}
            >
              <span title={isZh ? '对话轮次' : 'Turns'}>{isZh ? '轮次' : 'Turns'} {aiInteractionMetrics.turnCount}</span>
              {aiInteractionMetrics.successCount > 0 && (
                <span style={{ color: '#16a34a' }} title={isZh ? '执行成功' : 'Successes'}>✓ {aiInteractionMetrics.successCount}</span>
              )}
              {aiInteractionMetrics.failureCount > 0 && (
                <span style={{ color: '#dc2626' }} title={isZh ? '执行失败' : 'Failures'}>✗ {aiInteractionMetrics.failureCount}</span>
              )}
              {aiInteractionMetrics.clarifyCount > 0 && (
                <span title={isZh ? '澄清次数' : 'Clarifications'}>{isZh ? '澄清' : 'Clarify'} {aiInteractionMetrics.clarifyCount}</span>
              )}
              {aiInteractionMetrics.cancelCount > 0 && (
                <span title={isZh ? '取消次数' : 'Cancellations'}>{isZh ? '取消' : 'Cancel'} {aiInteractionMetrics.cancelCount}</span>
              )}
              {aiInteractionMetrics.explainFallbackCount > 0 && (
                <span title={isZh ? '解释回退' : 'Explain fallbacks'}>{isZh ? '解释' : 'Explain'} {aiInteractionMetrics.explainFallbackCount}</span>
              )}
              {aiInteractionMetrics.recoveryCount > 0 && (
                <span style={{ color: '#2563eb' }} title={isZh ? '恢复次数' : 'Recoveries'}>{isZh ? '恢复' : 'Recover'} {aiInteractionMetrics.recoveryCount}</span>
              )}
              {aiSessionMemory?.lastToolName && (
                <span style={{ marginLeft: 'auto', fontStyle: 'italic' }} title={isZh ? '上次工具' : 'Last tool'}>
                  {formatToolName(isZh, aiSessionMemory.lastToolName)}
                </span>
              )}
            </div>
          )}

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
                        <div style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, padding: '8px', display: 'grid', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                            <strong style={{ fontSize: 11 }}>{isZh ? '回放 / 对比' : 'Replay / Compare'}</strong>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button" className="icon-btn" style={{ height: 22, minWidth: 70, fontSize: 10 }} onClick={() => setShowReplayDetailPanel((prev) => !prev)}>{showReplayDetailPanel ? (isZh ? '收起详情' : 'Hide detail') : (isZh ? '展开详情' : 'Show detail')}</button>
                              <button type="button" className="icon-btn" style={{ height: 22, minWidth: 44, fontSize: 10 }} onClick={() => { setSelectedReplayBundle(null); setCompareSnapshot(null); setSnapshotDiff(null); }}>{isZh ? '关闭' : 'Close'}</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 10, display: 'grid', gap: 2 }}>
                            <div>{isZh ? '工具' : 'Tool'}: {formatToolName(isZh, selectedReplayBundle.toolName)}</div>
                            <div>{isZh ? '请求' : 'Request'}: {compactInternalId(selectedReplayBundle.requestId)}</div>
                            <div>{isZh ? '状态' : 'Status'}: {formatReplayableLabel(isZh, selectedReplayBundle.replayable)}</div>
                            {selectedReplayBundle.latestDecision && (
                              <div>{isZh ? '最新决策' : 'Latest decision'}: {formatToolDecision(isZh, selectedReplayBundle.latestDecision.decision)}</div>
                            )}
                          </div>
                          {showReplayDetailPanel && (
                            <>
                          {selectedReplayBundle.toolCall?.arguments && (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? '执行参数' : 'Tool arguments'}</div>
                              <pre style={{ margin: 0, padding: 6, fontSize: 10, lineHeight: 1.4, background: '#f8fafc', borderRadius: 4, overflowX: 'auto' }}>{JSON.stringify(selectedReplayBundle.toolCall.arguments, null, 2)}</pre>
                            </div>
                          )}
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? '决策轨迹' : 'Decision timeline'}</div>
                            <div style={{ display: 'grid', gap: 3 }}>
                              {selectedReplayBundle.decisions.map((decision) => (
                                <div key={`${decision.timestamp}-${decision.decision}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
                                  <span>{formatToolDecision(isZh, decision.decision)}{decision.reason ? ` · ${decision.reason}` : ''}</span>
                                  <em>{new Date(decision.timestamp).toLocaleTimeString()}</em>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? 'Golden 快照预览' : 'Golden Snapshot Preview'}</div>
                            <pre style={{ margin: 0, padding: 6, fontSize: 10, lineHeight: 1.4, background: '#f8fafc', borderRadius: 4, overflowX: 'auto', maxHeight: 160, overflowY: 'auto' }}>{JSON.stringify(buildAiToolGoldenSnapshot(selectedReplayBundle), null, 2)}</pre>
                          </div>
                          {/* 导入对比区 | Import & compare row */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="file"
                              accept=".json"
                              style={{ display: 'none' }}
                              ref={importFileInputRef}
                              onChange={(e) => {
                                const file = e.currentTarget.files?.[0];
                                if (file) importSnapshotForCompare(file);
                                e.currentTarget.value = '';
                              }}
                            />
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ fontSize: 9, height: 18 }}
                              onClick={() => importFileInputRef.current?.click()}
                            >
                              {isZh ? '导入快照对比' : 'Import & Compare'}
                            </button>
                            {compareSnapshot && (
                              <button
                                type="button"
                                className="icon-btn"
                                style={{ fontSize: 9, height: 18 }}
                                onClick={() => { setCompareSnapshot(null); setSnapshotDiff(null); }}
                              >
                                {isZh ? '清除对比' : 'Clear diff'}
                              </button>
                            )}
                          </div>
                          {/* diff 结果面板 | Diff result panel */}
                          {snapshotDiff && compareSnapshot && (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? '快照对比' : 'Snapshot Diff'}</div>
                                <span style={{ fontSize: 10, fontWeight: 600, color: snapshotDiff.matches ? '#16a34a' : '#d97706' }}>
                                  {snapshotDiff.matches ? (isZh ? '✓ 一致' : '✓ Matches') : (isZh ? '△ 有差异' : '△ Changed')}
                                </span>
                              </div>
                              <div style={{ fontSize: 9, opacity: 0.6 }}>
                                {isZh ? `基准: ${compactInternalId(compareSnapshot.requestId)}` : `Baseline: ${compactInternalId(compareSnapshot.requestId)}`}
                              </div>
                              <div style={{ display: 'grid', gap: 2 }}>
                                {snapshotDiff.fields.map((f) => (
                                  <div key={f.label} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, fontSize: 9 }}>
                                    <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{f.label}</span>
                                    {f.changed
                                      ? <span style={{ color: '#b91c1c' }}>{f.baseline} {'\u2192'} {f.live}</span>
                                      : <span style={{ color: '#16a34a' }}>✓</span>
                                    }
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
              </div>
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
