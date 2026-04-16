import { t, tf, type Locale } from '.';
import type { AiChatProviderKind } from '../ai/providers/providerCatalog';

type AiConnectionTestStatus = 'idle' | 'testing' | 'success' | 'error' | null | undefined;
type AiChatPreferredMode = 'command' | 'dictation' | 'analysis' | null | undefined;
type AiChatConfirmationThreshold = 'always' | 'destructive' | 'never' | null | undefined;
type AiChatPage = 'transcription' | 'glossing' | 'settings' | 'other' | null | undefined;
type AiChatUnitKind = 'unit' | 'segment' | null | undefined;
type AiChatLayerType = 'transcription' | 'translation' | null | undefined;
type AiAdaptiveIntent = 'translation' | 'transcription' | 'gloss' | 'review' | 'summary' | 'explain' | 'compare' | 'steps' | 'qa';
type AiAdaptiveResponseStyle = 'analysis' | 'direct_edit' | 'concise' | 'detailed' | 'step_by_step';
type AiChatTask =
  | 'segmentation'
  | 'transcription'
  | 'translation'
  | 'pos_tagging'
  | 'glossing'
  | 'risk_review'
  | 'ai_chat_setup'
  | null
  | undefined;

export interface RecommendedPlaceholderInput {
  fallback: string;
  page?: AiChatPage;
  observerStage?: string | null;
  aiCurrentTask?: AiChatTask;
  selectedLayerType?: AiChatLayerType;
  selectedUnitKind?: AiChatUnitKind;
  selectedTimeRangeLabel?: string | null;
  rowNumber?: number | null;
  selectedText?: string | null;
  annotationStatus?: string | null;
  confidence?: number | null;
  lexemeCount?: number;
  lastToolName?: string | null;
  preferredMode?: AiChatPreferredMode;
  confirmationThreshold?: AiChatConfirmationThreshold;
  adaptiveIntent?: AiAdaptiveIntent;
  adaptiveResponseStyle?: AiAdaptiveResponseStyle;
  adaptiveKeywords?: string[];
  adaptiveLastPromptExcerpt?: string | null;
}

function clipText(text: string | null | undefined, max = 16): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function isLowConfidence(confidence: number | null | undefined): boolean {
  return typeof confidence === 'number' && confidence > 0 && confidence < 0.72;
}

function normalizeTask(task: AiChatTask, observerStage: string | null | undefined): NonNullable<AiChatTask> | 'collecting' {
  if (task) return task;
  if (observerStage === 'reviewing') return 'risk_review';
  if (observerStage === 'glossing') return 'glossing';
  if (observerStage === 'transcribing') return 'transcription';
  return 'collecting';
}

function getPlaceholderPrefix(locale: Locale, input: RecommendedPlaceholderInput): string {
  if (input.adaptiveResponseStyle === 'step_by_step') return t(locale, 'ai.chat.placeholder.prefix.steps');
  if (input.preferredMode === 'analysis' || input.confirmationThreshold === 'always' || input.adaptiveResponseStyle === 'analysis') {
    return t(locale, 'ai.chat.placeholder.prefix.analysis');
  }
  if (input.adaptiveResponseStyle === 'direct_edit') return t(locale, 'ai.chat.placeholder.prefix.directEdit');
  return t(locale, 'ai.chat.placeholder.prefix.default');
}

function buildRecommendedPlaceholder(locale: Locale, input: RecommendedPlaceholderInput): string {
  const task = normalizeTask(input.aiCurrentTask, input.observerStage);
  const rowLabel = input.rowNumber ? tf(locale, 'ai.chat.placeholder.scope.row', { rowNumber: input.rowNumber }) : '';
  const unitLabel = input.selectedUnitKind === 'segment'
    ? t(locale, 'ai.chat.placeholder.scope.unit.segment')
    : input.selectedUnitKind === 'unit'
      ? t(locale, 'ai.chat.placeholder.scope.unit.unit')
      : '';
  const layerLabel = input.selectedLayerType === 'translation'
    ? t(locale, 'ai.chat.placeholder.scope.layer.translation')
    : input.selectedLayerType === 'transcription'
      ? t(locale, 'ai.chat.placeholder.scope.layer.transcription')
      : '';
  const excerpt = clipText(input.selectedText);
  const excerptLabel = excerpt ? (locale === 'zh-CN' ? `「${excerpt}」` : `"${excerpt}"`) : '';
  const scope = [rowLabel, unitLabel, layerLabel, (input.selectedTimeRangeLabel ?? '').trim()].filter(Boolean).join(locale === 'zh-CN' ? ' · ' : ' | ');
  const target = [scope, excerptLabel].filter(Boolean).join(' ');
  const focus = target || (input.page === 'transcription'
    ? t(locale, 'ai.chat.placeholder.focus.transcriptionWorkspace')
    : t(locale, 'ai.chat.placeholder.focus.currentContext'));
  const prefix = getPlaceholderPrefix(locale, input);
  const confidenceReview = isLowConfidence(input.confidence) || input.annotationStatus === 'verified';
  const keywordHint = input.adaptiveKeywords && input.adaptiveKeywords.length > 0
    ? tf(locale, 'ai.chat.placeholder.hint.keywords', { keywords: input.adaptiveKeywords.slice(0, 2).join(' / ') })
    : '';
  const recentNeedHint = input.adaptiveLastPromptExcerpt
    ? tf(locale, 'ai.chat.placeholder.hint.recent', { prompt: input.adaptiveLastPromptExcerpt })
    : '';

  if (task === 'ai_chat_setup') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.setup')}`;
  }

  if (input.adaptiveIntent === 'compare') {
    return `${prefix}${tf(locale, 'ai.chat.placeholder.compare', { focus })}${keywordHint}`;
  }
  if (input.adaptiveIntent === 'summary') {
    return `${prefix}${tf(locale, 'ai.chat.placeholder.summary', { focus })}${keywordHint}`;
  }
  if (input.adaptiveIntent === 'explain') {
    return `${prefix}${tf(locale, 'ai.chat.placeholder.explain', { focus })}${keywordHint}`;
  }

  if (input.selectedLayerType === 'translation') {
    if (!excerpt) return `${prefix}${tf(locale, 'ai.chat.placeholder.translation.draft', { focus })}`;
    if (confidenceReview || task === 'risk_review' || input.observerStage === 'reviewing') {
      return `${prefix}${tf(locale, 'ai.chat.placeholder.translation.review', { focus })}${recentNeedHint}${keywordHint}`;
    }
    return `${prefix}${tf(locale, 'ai.chat.placeholder.translation.refine', { focus })}${recentNeedHint}${keywordHint}`;
  }

  if (input.selectedLayerType === 'transcription') {
    if (!excerpt) return `${prefix}${tf(locale, 'ai.chat.placeholder.transcription.complete', { focus })}`;
    if (task === 'glossing' || task === 'pos_tagging' || (input.lexemeCount ?? 0) > 0) {
      return `${prefix}${tf(locale, 'ai.chat.placeholder.transcription.gloss', { focus })}${recentNeedHint}${keywordHint}`;
    }
    if (confidenceReview || input.observerStage === 'reviewing') {
      return `${prefix}${tf(locale, 'ai.chat.placeholder.transcription.risk', { focus })}${recentNeedHint}${keywordHint}`;
    }
    return `${prefix}${tf(locale, 'ai.chat.placeholder.transcription.check', { focus })}${recentNeedHint}${keywordHint}`;
  }

  if (input.adaptiveIntent === 'translation') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.intent.translation')}${keywordHint}`;
  }
  if (input.adaptiveIntent === 'review') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.intent.review')}${keywordHint}`;
  }
  if (input.adaptiveIntent === 'gloss') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.intent.gloss')}${keywordHint}`;
  }
  if (task === 'glossing' || task === 'pos_tagging') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.task.gloss')}${keywordHint}`;
  }
  if (task === 'risk_review' || input.observerStage === 'reviewing') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.task.risk')}${keywordHint}`;
  }
  if (task === 'transcription' || task === 'segmentation') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.task.transcription')}${keywordHint}`;
  }
  if (task === 'translation') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.task.translation')}${keywordHint}`;
  }
  if (input.lastToolName === 'set_translation_text') {
    return `${prefix}${t(locale, 'ai.chat.placeholder.tool.translationConsistency')}${keywordHint}`;
  }
  return `${prefix}${t(locale, 'ai.chat.placeholder.fallback')}${keywordHint}`;
}

export type AiChatCardMessages = {
  providerGroupOfficial: string;
  providerGroupCompatible: string;
  providerGroupLocalCustom: string;
  providerStatusLabel: (kind: AiChatProviderKind, status: AiConnectionTestStatus) => string;
  layerMismatchWarning: string;
  highRiskPending: string;
  chatNotReady: string;
  previousReplyStreaming: string;
  pendingActionBeforeSend: string;
  toolFeedbackStyle: string;
  detailed: string;
  concise: string;
  hideProviderConfig: string;
  openProviderConfig: string;
  connected: string;
  clearCurrentKey: string;
  parsingToolCall: string;
  thinking: string;
  aborted: string;
  generatedByModel: (modelName: string) => string;
  aiGenerated: string;
  reasoning: string;
  copied: string;
  copy: string;
  pinMessage: string;
  unpinMessage: string;
  hideReasoning: string;
  showReasoning: string;
  showConversationSummary: string;
  hideConversationSummary: string;
  conversationSummaryTitle: string;
  summaryCoveredTurns: (turnCount: number) => string;
  summaryQualityWarning: (similarity: number, threshold: number) => string;
  summaryEmpty: string;
  more: string;
  ragQuickScenarios: string;
  stopGenerating: string;
  stop: string;
  recommendationTitle: string;
  recommendationApply: string;
  recommendationDismiss: string;
  recommendationApplyHint: string;
  followUpTitle: string;
  taskTraceTitle: string;
  taskTraceStepLabel: (step: number) => string;
  promptLab: string;
  promptTemplateCountSuffix: string;
  voiceInput: string;
  dragResizeVoicePanelHeight: string;
  voicePanelUnavailable: string;
  aiDecisions: string;
  decisionCountSuffix: string;
  dragResizeDecisionPanelHeight: string;
  noDecisionsYet: string;
  unknownTool: string;
  loading: string;
  replayOpened: string;
  replayCompare: string;
  snapshotExported: string;
  exportSnapshot: string;
  webllmRuntimeTitle: string;
  webllmRuntimeSource: string;
  webllmRuntimeDetail: string;
  webllmRuntimeRoute: string;
  webllmRuntimeSourceInjected: string;
  webllmRuntimeSourcePromptApi: string;
  webllmRuntimeSourceUnavailable: string;
  webllmWarmup: string;
  webllmWarmingUp: string;
  webllmWarmupPreparing: string;
  webllmWarmupProgressLabel: string;
  webllmWarmupCancel: string;
  webllmWarmupCancelled: string;
  webllmWarmupDone: string;
  webllmWarmupFailed: string;
  webllmWarmupFailedWithReason: (reason: string) => string;
  webllmWarmupPhasePreparing: string;
  webllmWarmupPhaseDownloading: string;
  webllmWarmupPhaseInitializing: string;
  webllmWarmupPhaseReady: string;
  agentLoopProgress: (step: number, maxSteps: number) => string;
  tokenBudgetWarning: (estimatedTokens: number) => string;
  recommendedInputPlaceholder: (input: RecommendedPlaceholderInput) => string;
};

export function getAiChatCardMessages(isZh: boolean): AiChatCardMessages {
  if (isZh) {
    return {
      providerGroupOfficial: '\u5b98\u65b9\u76f4\u8fde',
      providerGroupCompatible: '\u517c\u5bb9\u6a21\u5f0f',
      providerGroupLocalCustom: '\u672c\u5730/\u81ea\u5b9a\u4e49',
      providerStatusLabel: (kind, status) => {
        if (kind === 'mock') return '\u6a21\u62df';
        if (kind === 'ollama' || kind === 'webllm') return '\u672c\u5730';
        if (status === 'success') return '\u5df2\u8fde\u63a5';
        if (status === 'error') return '\u5f02\u5e38';
        return '\u672a\u9a8c\u8bc1';
      },
      layerMismatchWarning: '\u26a0 \u672a\u627e\u5230\u5339\u914d\u201c\u5f53\u524d\u201d\u7684\u8f6c\u5199\u5c42',
      highRiskPending: '\u5b58\u5728\u5f85\u786e\u8ba4\u7684\u9ad8\u98ce\u9669\u64cd\u4f5c\uff0c\u8bf7\u5148\u786e\u8ba4\u6216\u53d6\u6d88\u3002',
      chatNotReady: 'AI \u5bf9\u8bdd\u5c1a\u672a\u5c31\u7eea\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
      previousReplyStreaming: '\u4e0a\u4e00\u6761\u56de\u590d\u4ecd\u5728\u751f\u6210\u4e2d\uff0c\u505c\u6b62\u540e\u53ef\u7ee7\u7eed\u53d1\u9001\u3002',
      pendingActionBeforeSend: '\u5b58\u5728\u5f85\u786e\u8ba4\u64cd\u4f5c\uff0c\u8bf7\u5148\u5904\u7406\u540e\u518d\u53d1\u9001\u3002',
      toolFeedbackStyle: '\u5de5\u5177\u53cd\u9988\u98ce\u683c',
      detailed: '\u8be6\u7ec6',
      concise: '\u7b80\u6d01',
      hideProviderConfig: '\u6536\u8d77\u914d\u7f6e',
      openProviderConfig: '\u6253\u5f00\u914d\u7f6e',
      connected: '\u5df2\u8fde\u63a5',
      clearCurrentKey: '\u6e05\u7a7a\u5f53\u524d Key',
      parsingToolCall: '\u6b63\u5728\u89e3\u6790\u5de5\u5177\u8c03\u7528\u2026',
      thinking: '\u6b63\u5728\u601d\u8003...',
      aborted: '\u23f9 \u5df2\u4e2d\u65ad',
      generatedByModel: (modelName) => `${modelName} \u751f\u6210`,
      aiGenerated: 'AI \u751f\u6210',
      reasoning: '\ud83d\udcad \u63a8\u7406\u8fc7\u7a0b',
      copied: '\u5df2\u590d\u5236',
      copy: '\u590d\u5236',
      pinMessage: '\u9489\u4f4f\u6d88\u606f',
      unpinMessage: '\u53d6\u6d88\u9489\u4f4f',
      hideReasoning: '\u25b2 \u9690\u85cf\u63a8\u7406',
      showReasoning: '\u25bc \u67e5\u770b\u63a8\u7406',
      showConversationSummary: '\u67e5\u770b\u5bf9\u8bdd\u6458\u8981',
      hideConversationSummary: '\u6536\u8d77\u5bf9\u8bdd\u6458\u8981',
      conversationSummaryTitle: '\u5bf9\u8bdd\u6458\u8981\u94fe',
      summaryCoveredTurns: (turnCount) => `\u5df2\u8986\u76d6 ${turnCount} \u8f6e`,
      summaryQualityWarning: (similarity, threshold) => `\u6458\u8981\u53ef\u80fd\u9057\u6f0f\u5173\u952e\u4fe1\u606f (${Math.round(similarity * 100)}% < ${Math.round(threshold * 100)}%)`,
      summaryEmpty: '\u6682\u65e0\u6458\u8981\u8bb0\u5f55',
      more: '\u66f4\u591a',
      ragQuickScenarios: 'RAG \u5feb\u6377\u573a\u666f',
      stopGenerating: '\u505c\u6b62\u751f\u6210',
      stop: '\u505c\u6b62',
      recommendationTitle: '\u4f60\u53ef\u80fd\u60f3\u95ee\uff1a',
      recommendationApply: '\u586b\u5165\u8f93\u5165\u6846',
      recommendationDismiss: '\u5ffd\u7565\u672c\u6761\u63a8\u8350',
      recommendationApplyHint: 'Tab \u586b\u5165\uff0cEsc \u5ffd\u7565',
      followUpTitle: '\u7ee7\u7eed\u8ffd\u95ee',
      taskTraceTitle: '\u672c\u8f6e\u8fdb\u5ea6',
      taskTraceStepLabel: (step) => `\u6b65\u9aa4 ${step}`,
      promptLab: 'Prompt \u5b9e\u9a8c\u5ba4',
      promptTemplateCountSuffix: ' \u9879',
      voiceInput: '\u8bed\u97f3\u8f93\u5165',
      dragResizeVoicePanelHeight: '\u62d6\u52a8\u8c03\u6574\u8bed\u97f3\u9762\u677f\u9ad8\u5ea6',
      voicePanelUnavailable: '\u8bed\u97f3\u9762\u677f\u6682\u4e0d\u53ef\u7528',
      aiDecisions: 'AI \u51b3\u7b56',
      decisionCountSuffix: ' \u6761',
      dragResizeDecisionPanelHeight: '\u62d6\u52a8\u8c03\u6574 AI \u51b3\u7b56\u533a\u9ad8\u5ea6',
      noDecisionsYet: '\u6682\u65e0\u51b3\u7b56\u8bb0\u5f55',
      unknownTool: '\u672a\u77e5\u5de5\u5177',
      loading: '\u8bfb\u53d6\u4e2d...',
      replayOpened: '\u5df2\u6253\u5f00\u56de\u653e',
      replayCompare: '\u67e5\u770b\u56de\u653e/\u5bf9\u6bd4',
      snapshotExported: '\u5df2\u5bfc\u51fa\u5feb\u7167',
      exportSnapshot: '\u5bfc\u51fa\u5feb\u7167',
      webllmRuntimeTitle: 'WebLLM \u672c\u5730\u6a21\u578b\u72b6\u6001',
      webllmRuntimeSource: '\u8fd0\u884c\u65f6\u6765\u6e90',
      webllmRuntimeDetail: '\u68c0\u6d4b\u8be6\u60c5',
      webllmRuntimeRoute: '\u79bb\u7ebf\u964d\u7ea7\u8def\u7531',
      webllmRuntimeSourceInjected: 'Injected Runtime',
      webllmRuntimeSourcePromptApi: 'Browser Prompt API',
      webllmRuntimeSourceUnavailable: '\u672a\u68c0\u6d4b\u5230\u8fd0\u884c\u65f6',
      webllmWarmup: '\u9884\u70ed\u6a21\u578b',
      webllmWarmingUp: '\u9884\u70ed\u4e2d...',
      webllmWarmupPreparing: '\u6b63\u5728\u521d\u59cb\u5316\u9884\u70ed',
      webllmWarmupProgressLabel: '\u9884\u70ed\u8fdb\u5ea6',
      webllmWarmupCancel: '\u53d6\u6d88\u9884\u70ed',
      webllmWarmupCancelled: '\u5df2\u53d6\u6d88\u9884\u70ed',
      webllmWarmupDone: '\u6a21\u578b\u5df2\u5c31\u7eea',
      webllmWarmupFailed: '\u9884\u70ed\u5931\u8d25',
      webllmWarmupFailedWithReason: (reason) => `\u9884\u70ed\u5931\u8d25\uff1a${reason}`,
      webllmWarmupPhasePreparing: '\u68c0\u6d4b\u8fd0\u884c\u73af\u5883',
      webllmWarmupPhaseDownloading: '\u4e0b\u8f7d\u6a21\u578b\u8d44\u6e90',
      webllmWarmupPhaseInitializing: '\u521d\u59cb\u5316\u6a21\u578b',
      webllmWarmupPhaseReady: '\u6a21\u578b\u5c31\u7eea',
      agentLoopProgress: (step, maxSteps) => `\u591a\u6b65\u63a8\u7406 ${step}/${maxSteps}`,
      tokenBudgetWarning: (estimatedTokens) => `\n\n如需我继续完成这项查询，请回复“继续”。预计还需约 ${estimatedTokens} tokens。`,
      recommendedInputPlaceholder: (input) => buildRecommendedPlaceholder('zh-CN', input),
    };
  }

  return {
    providerGroupOfficial: 'Official',
    providerGroupCompatible: 'Compatible',
    providerGroupLocalCustom: 'Local / Custom',
    providerStatusLabel: (kind, status) => {
      if (kind === 'mock') return 'Mock';
      if (kind === 'ollama' || kind === 'webllm') return 'Local';
      if (status === 'success') return 'Connected';
      if (status === 'error') return 'Error';
      return 'Unverified';
    },
    layerMismatchWarning: '\u26a0 No matching "current" transcription layer found',
    highRiskPending: 'A high-risk action is pending. Confirm or cancel it first.',
    chatNotReady: 'AI chat is not ready yet. Please try again shortly.',
    previousReplyStreaming: 'Previous reply is still streaming. Stop it before sending.',
    pendingActionBeforeSend: 'A pending action must be handled before sending.',
    toolFeedbackStyle: 'Tool feedback style',
    detailed: 'Detailed',
    concise: 'Concise',
    hideProviderConfig: 'Hide provider config',
    openProviderConfig: 'Open provider config',
    connected: 'Connected',
    clearCurrentKey: 'Clear Current Key',
    parsingToolCall: 'Parsing tool call...',
    thinking: 'Thinking...',
    aborted: '\u23f9 Aborted',
    generatedByModel: (modelName) => `${modelName} Generated`,
    aiGenerated: 'AI Generated',
    reasoning: '\ud83d\udcad Reasoning',
    copied: 'Copied',
    copy: 'Copy',
    pinMessage: 'Pin message',
    unpinMessage: 'Unpin message',
    hideReasoning: '\u25b2 Hide reasoning',
    showReasoning: '\u25bc Show reasoning',
    showConversationSummary: 'View summary',
    hideConversationSummary: 'Hide summary',
    conversationSummaryTitle: 'Conversation summary chain',
    summaryCoveredTurns: (turnCount) => `Covers ${turnCount} turns`,
    summaryQualityWarning: (similarity, threshold) => `Summary may miss key details (${Math.round(similarity * 100)}% < ${Math.round(threshold * 100)}%)`,
    summaryEmpty: 'No summary history yet',
    more: 'More',
    ragQuickScenarios: 'RAG Quick Scenarios',
    stopGenerating: 'Stop generating',
    stop: 'Stop',
    recommendationTitle: 'You may want to ask:',
    recommendationApply: 'Use suggestion',
    recommendationDismiss: 'Dismiss suggestion',
    recommendationApplyHint: 'Tab to use, Esc to dismiss',
    followUpTitle: 'Continue with',
    taskTraceTitle: 'Latest progress',
    taskTraceStepLabel: (step) => `Step ${step}`,
    promptLab: 'Prompt Lab',
    promptTemplateCountSuffix: '',
    voiceInput: 'Voice Input',
    dragResizeVoicePanelHeight: 'Drag to resize voice panel height',
    voicePanelUnavailable: 'Voice panel is temporarily unavailable',
    aiDecisions: 'AI Decisions',
    decisionCountSuffix: '',
    dragResizeDecisionPanelHeight: 'Drag to resize AI decision panel height',
    noDecisionsYet: 'No decisions yet',
    unknownTool: 'unknown',
    loading: 'Loading...',
    replayOpened: 'Replay Opened',
    replayCompare: 'Replay / Compare',
    snapshotExported: 'Snapshot Exported',
    exportSnapshot: 'Export Snapshot',
    webllmRuntimeTitle: 'WebLLM Local Model Status',
    webllmRuntimeSource: 'Runtime source',
    webllmRuntimeDetail: 'Detection detail',
    webllmRuntimeRoute: 'Offline fallback route',
    webllmRuntimeSourceInjected: 'Injected Runtime',
    webllmRuntimeSourcePromptApi: 'Browser Prompt API',
    webllmRuntimeSourceUnavailable: 'No runtime detected',
    webllmWarmup: 'Warm up model',
    webllmWarmingUp: 'Warming up...',
    webllmWarmupPreparing: 'Preparing warmup...',
    webllmWarmupProgressLabel: 'Warmup progress',
    webllmWarmupCancel: 'Cancel warmup',
    webllmWarmupCancelled: 'Warmup cancelled',
    webllmWarmupDone: 'Model ready',
    webllmWarmupFailed: 'Warmup failed',
    webllmWarmupFailedWithReason: (reason) => `Warmup failed: ${reason}`,
    webllmWarmupPhasePreparing: 'Checking runtime',
    webllmWarmupPhaseDownloading: 'Downloading model assets',
    webllmWarmupPhaseInitializing: 'Initializing model runtime',
    webllmWarmupPhaseReady: 'Model ready',
    agentLoopProgress: (step, maxSteps) => `Agent loop ${step}/${maxSteps}`,
    tokenBudgetWarning: (estimatedTokens) => `\n\nIf you want me to continue this lookup, reply "continue". Estimated remaining cost is ~${estimatedTokens} tokens.`,
    recommendedInputPlaceholder: (input) => buildRecommendedPlaceholder('en-US', input),
  };
}
