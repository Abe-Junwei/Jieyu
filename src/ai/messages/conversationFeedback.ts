import type { AiToolFeedbackStyle } from '../providers/providerCatalog';

export type ConversationClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

export interface ConversationClarifyCandidate {
  label: string;
}

const CLARIFY_TARGET_HINT_BY_REASON: Record<ConversationClarifyReason, string> = {
  'missing-utterance-target': '缺少目标句段',
  'missing-split-position': '缺少可用切分位置',
  'missing-translation-layer-target': '缺少目标翻译层',
  'missing-layer-link-target': '缺少目标层',
  'missing-layer-target': '缺少目标层',
  'missing-language-target': '缺少明确语言或目标层',
};

function pickCopyByStyle(style: AiToolFeedbackStyle, concise: string, verbose: string): string {
  return style === 'concise' ? concise : verbose;
}

export function formatNonActionFallback(userText: string): string {
  const trimmed = userText.trim();
  if (/^(你好|您好|嗨)([！!，,.。?？\s].*)?$/i.test(trimmed) || /^(hello|hi)\b/i.test(trimmed)) {
    return '你好，我在。你可以直接问我问题，也可以明确告诉我要执行的操作。';
  }
  if (/[?？]$/.test(trimmed) || /(什么意思|是什么|如何|怎么|解释|说明|why|what|how)/i.test(trimmed)) {
    return '这是一个说明或提问，我不会执行工具操作。你可以继续追问，我会直接回答你。';
  }
  return '收到，这条更像普通对话，我不会执行工具操作。你可以继续聊天，或明确描述要执行的动作。';
}

export function formatActionClarify(actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickCopyByStyle(
    style,
    `我检测到可能的操作（${actionLabel}），但意图不够明确。请确认：1）执行该操作；2）仅做解释说明。`,
    `我看到了一个可能的操作意图（${actionLabel}），但目前还不够确定。你可以告诉我“执行这个操作”，或者说“先解释，不执行”。`,
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
      `无法执行（${actionLabel}）：当前光标在语段边界。请先把光标移动到想切分的位置，然后回复“这里”或“此处”。`,
      `我已识别到你想执行“${actionLabel}”，但当前光标在语段边界，还不能安全切分。请先把光标移动到想切分的位置，再回复“这里”或“此处”。`,
    );
  }

  const targetHint = reason != null ? CLARIFY_TARGET_HINT_BY_REASON[reason] ?? '缺少目标对象' : '缺少目标对象';
  const candidateText = candidates.length > 0
    ? ` 可选项：${candidates.map((item, index) => `${index + 1})${item.label}`).join('；')}。`
    : '';
  const candidateReplyHint = candidates.length > 0 ? ' 你也可以回复“第1个/这个”。' : '';

  return pickCopyByStyle(
    style,
    `无法执行（${actionLabel}）：${targetHint}。请先选中目标，或直接提供对应 ID。${candidateText}${candidateReplyHint}`,
    `我已识别到你想执行“${actionLabel}”，但目前${targetHint}，还不能安全执行。请先选中目标，或在指令里补充对应 ID。${candidateText}${candidateReplyHint}`,
  );
}

export function formatInlineCancelReply(): string {
  return '好的，已取消。';
}

export function formatEmptyModelReply(): string {
  return '这次没有收到模型的有效回复，请重试一次；如果仍为空，请切换模型或检查上游服务状态。';
}

export function formatStreamingBusyError(): string {
  return '上一条回复仍在生成中，请稍候或先停止后再发送。';
}

export function formatPendingConfirmationBlockedError(): string {
  return '存在待确认的高风险工具调用，请先确认或取消后再继续。';
}

export function formatFirstChunkTimeoutError(isLongThinkProvider: boolean, providerLabel: string): string {
  if (isLongThinkProvider) {
    return `${providerLabel} 思考时间较长（首包超时，已等待60秒），请稍后重试，或切换至其他模型。`;
  }
  return '上游模型响应超时（首包超时），请稍后重试或切换模型。';
}

export function formatAbortedMessage(): string {
  return '已中断';
}