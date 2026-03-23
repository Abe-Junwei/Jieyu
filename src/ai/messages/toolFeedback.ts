import type { AiToolFeedbackStyle } from '../providers/providerCatalog';

function pickToolCopyByStyle(style: AiToolFeedbackStyle, concise: string, verbose: string): string {
  return style === 'concise' ? concise : verbose;
}

function toNaturalTargetResolutionPrompt(
  callName: string,
  message: string,
  style: AiToolFeedbackStyle,
): string | null {
  const normalized = message.toLowerCase();
  const isMissingOrNotFound = normalized.includes('缺少')
    || normalized.includes('missing')
    || normalized.includes('未找到')
    || normalized.includes('not found');
  const hasUtteranceSignal = normalized.includes('utteranceid') || normalized.includes('句段');
  const hasLayerSignal = normalized.includes('layerid') || normalized.includes('层');
  const hasTranslationLayerSignal = normalized.includes('翻译层') || normalized.includes('translation');
  const hasLinkLayerSignal = normalized.includes('transcriptionlayerid')
    || normalized.includes('translationlayerid')
    || normalized.includes('目标层');
  const isAmbiguous = normalized.includes('匹配到多个')
    || normalized.includes('目标不唯一')
    || normalized.includes('multiple')
    || normalized.includes('ambiguous');
  const isLayerNotFound = normalized.includes('未找到匹配') || normalized.includes('未找到目标层');

  if (callName === 'delete_layer' && (isAmbiguous || isLayerNotFound)) {
    const layerKind = normalized.includes('翻译层') ? '翻译层' : '转写层';
    return pickToolCopyByStyle(
      style,
      `你想删除哪个${layerKind}？请补充更具体的语言条件，或直接提供 layerId。`,
      `你想删除哪个${layerKind}？请补充更具体的语言条件，或者直接告诉我 layerId。`,
    );
  }

  if (
    ['create_transcription_segment', 'split_transcription_segment', 'set_transcription_text', 'delete_transcription_segment', 'auto_gloss_utterance'].includes(callName)
    && isMissingOrNotFound
    && hasUtteranceSignal
  ) {
    const actionNoun = callName === 'delete_transcription_segment'
      ? '删除'
      : callName === 'split_transcription_segment'
        ? '切分'
      : callName === 'create_transcription_segment'
        ? '切分'
        : callName === 'auto_gloss_utterance'
          ? '标注'
          : '修改';
    return pickToolCopyByStyle(
      style,
      `你想${actionNoun}哪个句段？请先选中目标，或直接提供 utteranceId。`,
      `你想${actionNoun}哪个句段？请先选中目标，或者直接告诉我 utteranceId。`,
    );
  }

  if (
    ['set_translation_text', 'clear_translation_segment'].includes(callName)
    && isMissingOrNotFound
    && (hasUtteranceSignal || hasLayerSignal || hasTranslationLayerSignal)
  ) {
    return pickToolCopyByStyle(
      style,
      '你想修改哪个句段的哪个翻译层？请先选中句段和翻译层，或直接提供 utteranceId + layerId。',
      '你想修改哪个句段的哪个翻译层？请先选中句段和翻译层，或者直接告诉我 utteranceId 和 layerId。',
    );
  }

  if (
    ['link_translation_layer', 'unlink_translation_layer'].includes(callName)
    && isMissingOrNotFound
    && (hasLinkLayerSignal || hasLayerSignal)
  ) {
    return pickToolCopyByStyle(
      style,
      '你想关联哪两个层？请提供转写层和翻译层，或直接给出 transcriptionLayerId + translationLayerId。',
      '你想关联哪两个层？请先告诉我转写层和翻译层，或者直接给出 transcriptionLayerId 与 translationLayerId。',
    );
  }

  const isCreateLayerConflict = normalized.includes('创建转写层失败')
    || normalized.includes('创建翻译层失败')
    || normalized.includes('别名是否冲突')
    || normalized.includes('alias');

  if (callName === 'create_transcription_layer' && isCreateLayerConflict) {
    return pickToolCopyByStyle(
      style,
      '新建转写层失败。你想新建哪个转写层？请告诉我语言，必要时加一个别名。',
      '新建转写层失败了。你想新建哪个转写层？请告诉我目标语言，必要时加一个别名避免冲突。',
    );
  }

  if (callName === 'create_translation_layer' && isCreateLayerConflict) {
    return pickToolCopyByStyle(
      style,
      '新建翻译层失败。你想新建哪个翻译层？请告诉我语言，必要时加一个别名。',
      '新建翻译层失败了。你想新建哪个翻译层？请告诉我目标语言，必要时加一个别名避免冲突。',
    );
  }

  return null;
}

function toFailureRecoveryHint(callName: string, message: string, style: AiToolFeedbackStyle): string {
  const normalized = message.toLowerCase();
  const prefix = pickToolCopyByStyle(style, '。下一步：', '。建议下一步：');
  if (normalized.includes('缺少') || normalized.includes('missing')) {
    return `${prefix}请先选中目标，或回复“第1个/这个”确认候选对象。`;
  }
  if (normalized.includes('未找到') || normalized.includes('not found')) {
    return `${prefix}请改为提供更精确的对象名称，或直接给出明确 ID。`;
  }
  if (normalized.includes('多个') || normalized.includes('ambiguous')) {
    if (callName === 'delete_layer' || normalized.includes('layer') || normalized.includes('层')) {
      return `${prefix}目标层不唯一，请补充更具体的语言条件，或直接提供 layerId 后重试。`;
    }
    return `${prefix}当前目标不唯一，请回复“第1个/第2个”明确选择后继续。`;
  }
  if (callName === 'delete_layer' || callName === 'delete_transcription_segment') {
    return `${prefix}可先让我预演影响范围，再确认是否执行删除。`;
  }
  return `${prefix}你可以换一种更具体的表达重试，我会继续沿用当前上下文。`;
}

export function formatToolSuccessMessage(actionLabel: string, message: string, style: AiToolFeedbackStyle): string {
  // 切分反馈直接返回结果句，避免“已完成 + 结果”重复冗余 | For split feedback, return the result sentence directly to avoid redundant prefix.
  if (actionLabel === '切分句段' || actionLabel === 'Split Segment') {
    return message;
  }

  return pickToolCopyByStyle(
    style,
    `已完成${actionLabel}：${message}`,
    `已完成“${actionLabel}”。${message}`,
  );
}

export function formatToolFailureMessage(
  callName: string,
  actionLabel: string,
  message: string,
  style: AiToolFeedbackStyle,
): string {
  const clarificationPrompt = toNaturalTargetResolutionPrompt(callName, message, style);
  if (clarificationPrompt) return clarificationPrompt;
  const recoveryHint = toFailureRecoveryHint(callName, message, style);
  return pickToolCopyByStyle(
    style,
    `未完成${actionLabel}：${message}${recoveryHint}`,
    `“${actionLabel}”没有完成：${message}${recoveryHint}`,
  );
}

export function formatToolPendingMessage(actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    `待确认：${actionLabel}。要继续吗？`,
    `你想继续“${actionLabel}”吗？我已暂停执行，等你确认。`,
  );
}

export function formatToolGraySkippedMessage(actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    `灰度模式：已识别${actionLabel}，当前只记录审计，不自动执行。`,
    `现在是灰度模式：我识别到你想执行“${actionLabel}”，但这次只做记录，不会自动执行。`,
  );
}

export function formatToolRollbackSkippedMessage(actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    `回滚模式：${actionLabel} 的自动执行已关闭，请改为手动操作。`,
    `现在是回滚模式：我识别到你想执行“${actionLabel}”，但自动执行已关闭，请改为手动操作。`,
  );
}

export function formatToolCancelledMessage(actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    `已取消${actionLabel}。`,
    `好的，已取消“${actionLabel}”，不会修改数据。`,
  );
}