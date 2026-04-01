import type { AiChatProviderKind } from '../ai/providers/providerCatalog';

type AiConnectionTestStatus = 'idle' | 'testing' | 'success' | 'error' | null | undefined;

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
  hideReasoning: string;
  showReasoning: string;
  more: string;
  ragQuickScenarios: string;
  stopGenerating: string;
  stop: string;
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
};

export function getAiChatCardMessages(isZh: boolean): AiChatCardMessages {
  if (isZh) {
    return {
      providerGroupOfficial: '\u5b98\u65b9\u76f4\u8fde',
      providerGroupCompatible: '\u517c\u5bb9\u6a21\u5f0f',
      providerGroupLocalCustom: '\u672c\u5730/\u81ea\u5b9a\u4e49',
      providerStatusLabel: (kind, status) => {
        if (kind === 'mock') return '\u6a21\u62df';
        if (kind === 'ollama') return '\u672c\u5730';
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
      hideReasoning: '\u25b2 \u9690\u85cf\u63a8\u7406',
      showReasoning: '\u25bc \u67e5\u770b\u63a8\u7406',
      more: '\u66f4\u591a',
      ragQuickScenarios: 'RAG \u5feb\u6377\u573a\u666f',
      stopGenerating: '\u505c\u6b62\u751f\u6210',
      stop: '\u505c\u6b62',
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
    };
  }

  return {
    providerGroupOfficial: 'Official',
    providerGroupCompatible: 'Compatible',
    providerGroupLocalCustom: 'Local / Custom',
    providerStatusLabel: (kind, status) => {
      if (kind === 'mock') return 'Mock';
      if (kind === 'ollama') return 'Local';
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
    hideReasoning: '\u25b2 Hide reasoning',
    showReasoning: '\u25bc Show reasoning',
    more: 'More',
    ragQuickScenarios: 'RAG Quick Scenarios',
    stopGenerating: 'Stop generating',
    stop: 'Stop',
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
  };
}
