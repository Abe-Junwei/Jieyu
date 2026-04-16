import type { AiToolFeedbackStyle } from '../providers/providerCatalog';

export type ConversationClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target'
  | 'local-metric-ambiguous'
  | 'local-scope-ambiguous'
  | 'local-query-ambiguous'
  | 'local-target-ambiguous'
  | 'local-action-ambiguous';

export interface ConversationClarifyCandidate {
  label: string;
}

const CLARIFY_TARGET_HINT_BY_REASON: Record<ConversationClarifyReason, string> = {
  'missing-utterance-target': '\u7f3a\u5c11\u76ee\u6807\u53e5\u6bb5',
  'missing-split-position': '\u7f3a\u5c11\u53ef\u7528\u5207\u5206\u4f4d\u7f6e',
  'missing-translation-layer-target': '\u7f3a\u5c11\u76ee\u6807\u7ffb\u8bd1\u5c42',
  'missing-layer-link-target': '\u7f3a\u5c11\u76ee\u6807\u5c42',
  'missing-layer-target': '\u7f3a\u5c11\u76ee\u6807\u5c42',
  'missing-language-target': '\u7f3a\u5c11\u660e\u786e\u8bed\u8a00\u6216\u76ee\u6807\u5c42',
  'local-metric-ambiguous': '\u7f3a\u5c11\u660e\u786e\u6307\u6807',
  'local-scope-ambiguous': '\u7f3a\u5c11\u660e\u786e\u8303\u56f4',
  'local-query-ambiguous': '\u7f3a\u5c11\u660e\u786e\u67e5\u8be2\u5185\u5bb9',
  'local-target-ambiguous': '\u7f3a\u5c11\u660e\u786e\u76ee\u6807\u5bf9\u8c61',
  'local-action-ambiguous': '\u7f3a\u5c11\u660e\u786e\u64cd\u4f5c',
};

function pickCopyByStyle(style: AiToolFeedbackStyle, concise: string, verbose: string): string {
  return style === 'concise' ? concise : verbose;
}

export function formatNonActionFallback(userText: string, style: AiToolFeedbackStyle): string {
  const trimmed = userText.trim();
  if (/^(\u4f60\u597d|\u60a8\u597d|\u55e8)([！!，,.。?？\s].*)?$/i.test(trimmed) || /^(hello|hi)\b/i.test(trimmed)) {
    return pickCopyByStyle(
      style,
      '\u4f60\u597d，\u6211\u5728。\u53ef\u7ee7\u7eed\u63d0\u95ee，\u6216\u76f4\u63a5\u8bf4\u8981\u6267\u884c\u7684\u64cd\u4f5c。',
      '\u4f60\u597d，\u6211\u5728。\u4f60\u53ef\u4ee5\u76f4\u63a5\u95ee\u6211\u95ee\u9898，\u4e5f\u53ef\u4ee5\u660e\u786e\u544a\u8bc9\u6211\u8981\u6267\u884c\u7684\u64cd\u4f5c。',
    );
  }
  if (/[?？]$/.test(trimmed) || /(\u4ec0\u4e48\u610f\u601d|\u662f\u4ec0\u4e48|\u5982\u4f55|\u600e\u4e48|\u89e3\u91ca|\u8bf4\u660e|why|what|how)/i.test(trimmed)) {
    return pickCopyByStyle(
      style,
      '\u8fd9\u662f\u63d0\u95ee/\u8bf4\u660e，\u6211\u4e0d\u4f1a\u6267\u884c\u5de5\u5177\u64cd\u4f5c。\u4f60\u53ef\u7ee7\u7eed\u8ffd\u95ee。',
      '\u8fd9\u662f\u4e00\u4e2a\u8bf4\u660e\u6216\u63d0\u95ee，\u6211\u4e0d\u4f1a\u6267\u884c\u5de5\u5177\u64cd\u4f5c。\u4f60\u53ef\u4ee5\u7ee7\u7eed\u8ffd\u95ee，\u6211\u4f1a\u76f4\u63a5\u56de\u7b54\u4f60。',
    );
  }
  return pickCopyByStyle(
    style,
    '\u6536\u5230，\u8fd9\u66f4\u50cf\u666e\u901a\u5bf9\u8bdd，\u6211\u4e0d\u4f1a\u6267\u884c\u5de5\u5177\u64cd\u4f5c。',
    '\u6536\u5230，\u8fd9\u6761\u66f4\u50cf\u666e\u901a\u5bf9\u8bdd，\u6211\u4e0d\u4f1a\u6267\u884c\u5de5\u5177\u64cd\u4f5c。\u4f60\u53ef\u4ee5\u7ee7\u7eed\u804a\u5929，\u6216\u660e\u786e\u63cf\u8ff0\u8981\u6267\u884c\u7684\u52a8\u4f5c。',
  );
}

export function formatActionClarify(actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickCopyByStyle(
    style,
    `\u6211\u68c0\u6d4b\u5230\u53ef\u80fd\u7684\u64cd\u4f5c（${actionLabel}），\u4f46\u610f\u56fe\u4e0d\u591f\u660e\u786e。\u8bf7\u786e\u8ba4：1）\u6267\u884c\u8be5\u64cd\u4f5c；2）\u4ec5\u505a\u89e3\u91ca\u8bf4\u660e。`,
    `\u6211\u770b\u5230\u4e86\u4e00\u4e2a\u53ef\u80fd\u7684\u64cd\u4f5c\u610f\u56fe（${actionLabel}），\u4f46\u76ee\u524d\u8fd8\u4e0d\u591f\u786e\u5b9a。\u4f60\u53ef\u4ee5\u544a\u8bc9\u6211“\u6267\u884c\u8fd9\u4e2a\u64cd\u4f5c”，\u6216\u8005\u8bf4“\u5148\u89e3\u91ca，\u4e0d\u6267\u884c”。`,
  );
}

export function formatTargetClarify(
  actionLabel: string,
  reason: ConversationClarifyReason | undefined,
  style: AiToolFeedbackStyle,
  candidates: ConversationClarifyCandidate[] = [],
): string {
  if (reason === 'missing-split-position') {
    return pickCopyByStyle(
      style,
      `\u65e0\u6cd5\u6267\u884c（${actionLabel}）：\u5f53\u524d\u5149\u6807\u5728\u8bed\u6bb5\u8fb9\u754c。\u8bf7\u5148\u628a\u5149\u6807\u79fb\u52a8\u5230\u60f3\u5207\u5206\u7684\u4f4d\u7f6e，\u7136\u540e\u56de\u590d“\u8fd9\u91cc”\u6216“\u6b64\u5904”。`,
      `\u6211\u5df2\u8bc6\u522b\u5230\u4f60\u60f3\u6267\u884c“${actionLabel}”，\u4f46\u5f53\u524d\u5149\u6807\u5728\u8bed\u6bb5\u8fb9\u754c，\u8fd8\u4e0d\u80fd\u5b89\u5168\u5207\u5206。\u8bf7\u5148\u628a\u5149\u6807\u79fb\u52a8\u5230\u60f3\u5207\u5206\u7684\u4f4d\u7f6e，\u518d\u56de\u590d“\u8fd9\u91cc”\u6216“\u6b64\u5904”。`,
    );
  }

  const targetHint = reason != null ? CLARIFY_TARGET_HINT_BY_REASON[reason] ?? '\u7f3a\u5c11\u76ee\u6807\u5bf9\u8c61' : '\u7f3a\u5c11\u76ee\u6807\u5bf9\u8c61';
  const candidateText = candidates.length > 0
    ? ` \u53ef\u9009\u9879：${candidates.map((item, index) => `${index + 1})${item.label}`).join('；')}。`
    : '';
  const candidateReplyHint = candidates.length > 0 ? ' \u4f60\u4e5f\u53ef\u4ee5\u56de\u590d“\u7b2c1\u4e2a/\u8fd9\u4e2a”。' : '';

  return pickCopyByStyle(
    style,
    `\u65e0\u6cd5\u6267\u884c（${actionLabel}）：${targetHint}。\u8bf7\u5148\u9009\u4e2d\u76ee\u6807，\u6216\u76f4\u63a5\u63d0\u4f9b\u5bf9\u5e94 ID。${candidateText}${candidateReplyHint}`,
    `\u6211\u5df2\u8bc6\u522b\u5230\u4f60\u60f3\u6267\u884c“${actionLabel}”，\u4f46\u76ee\u524d${targetHint}，\u8fd8\u4e0d\u80fd\u5b89\u5168\u6267\u884c。\u8bf7\u5148\u9009\u4e2d\u76ee\u6807，\u6216\u5728\u6307\u4ee4\u91cc\u8865\u5145\u5bf9\u5e94 ID。${candidateText}${candidateReplyHint}`,
  );
}

export function formatInlineCancelReply(): string {
  return '\u597d\u7684，\u5df2\u53d6\u6d88。';
}

export function formatEmptyModelReply(): string {
  return '\u8fd9\u6b21\u6ca1\u6709\u6536\u5230\u6a21\u578b\u7684\u6709\u6548\u56de\u590d，\u8bf7\u91cd\u8bd5\u4e00\u6b21；\u5982\u679c\u4ecd\u4e3a\u7a7a，\u8bf7\u5207\u6362\u6a21\u578b\u6216\u68c0\u67e5\u4e0a\u6e38\u670d\u52a1\u72b6\u6001。';
}

export function formatStreamingBusyError(): string {
  return '\u4e0a\u4e00\u6761\u56de\u590d\u4ecd\u5728\u751f\u6210\u4e2d，\u8bf7\u7a0d\u5019\u6216\u5148\u505c\u6b62\u540e\u518d\u53d1\u9001。';
}

export function formatPendingConfirmationBlockedError(): string {
  return '\u5b58\u5728\u5f85\u786e\u8ba4\u7684\u9ad8\u98ce\u9669\u5de5\u5177\u8c03\u7528，\u8bf7\u5148\u786e\u8ba4\u6216\u53d6\u6d88\u540e\u518d\u7ee7\u7eed。';
}

export function formatFirstChunkTimeoutError(isLongThinkProvider: boolean, providerLabel: string): string {
  if (isLongThinkProvider) {
    return `${providerLabel} \u601d\u8003\u65f6\u95f4\u8f83\u957f（\u9996\u5305\u8d85\u65f6，\u5df2\u7b49\u5f8560\u79d2），\u8bf7\u7a0d\u540e\u91cd\u8bd5，\u6216\u5207\u6362\u81f3\u5176\u4ed6\u6a21\u578b。`;
  }
  return '\u4e0a\u6e38\u6a21\u578b\u54cd\u5e94\u8d85\u65f6（\u9996\u5305\u8d85\u65f6），\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u5207\u6362\u6a21\u578b。';
}

export function formatAbortedMessage(): string {
  return '\u5df2\u4e2d\u65ad';
}