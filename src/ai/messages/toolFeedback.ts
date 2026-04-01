import { t, tf, type Locale } from '../../i18n';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';

const SIGNAL_MISSING = '\u7f3a\u5c11';
const SIGNAL_NOT_FOUND = '\u672a\u627e\u5230';
const SIGNAL_SEGMENT = '\u53e5\u6bb5';
const SIGNAL_LAYER = '\u5c42';
const SIGNAL_TRANSLATION_LAYER = '\u7ffb\u8bd1\u5c42';
const SIGNAL_TARGET_LAYER = '\u76ee\u6807\u5c42';
const SIGNAL_MULTIPLE = '\u5339\u914d\u5230\u591a\u4e2a';
const SIGNAL_NOT_UNIQUE = '\u76ee\u6807\u4e0d\u552f\u4e00';
const SIGNAL_NOT_FOUND_MATCH = '\u672a\u627e\u5230\u5339\u914d';
const SIGNAL_CREATE_TRANSCRIPTION_FAILED = '\u521b\u5efa\u8f6c\u5199\u5c42\u5931\u8d25';
const SIGNAL_CREATE_TRANSLATION_FAILED = '\u521b\u5efa\u7ffb\u8bd1\u5c42\u5931\u8d25';
const SIGNAL_ALIAS_CONFLICT = '\u522b\u540d\u662f\u5426\u51b2\u7a81';
const SIGNAL_TRANSLATION_KIND = '\u7ffb\u8bd1\u5c42';
const SPLIT_SEGMENT_ACTION_LABEL_ZH = '\u5207\u5206\u53e5\u6bb5';

function pickToolCopyByStyle(style: AiToolFeedbackStyle, concise: string, verbose: string): string {
  return style === 'concise' ? concise : verbose;
}

function includesAny(message: string, needles: readonly string[]): boolean {
  return needles.some((needle) => message.includes(needle));
}

function toNaturalTargetResolutionPrompt(
  locale: Locale,
  callName: string,
  message: string,
  style: AiToolFeedbackStyle,
): string | null {
  const normalized = message.toLowerCase();
  const isMissingOrNotFound = includesAny(normalized, [SIGNAL_MISSING, 'missing', SIGNAL_NOT_FOUND, 'not found']);
  const hasUtteranceSignal = includesAny(normalized, ['utteranceid', SIGNAL_SEGMENT]);
  const hasLayerSignal = includesAny(normalized, ['layerid', SIGNAL_LAYER]);
  const hasTranslationLayerSignal = includesAny(normalized, [SIGNAL_TRANSLATION_LAYER, 'translation']);
  const hasLinkLayerSignal = includesAny(normalized, ['transcriptionlayerid', 'translationlayerid', SIGNAL_TARGET_LAYER]);
  const isAmbiguous = includesAny(normalized, [SIGNAL_MULTIPLE, SIGNAL_NOT_UNIQUE, 'multiple', 'ambiguous']);
  const isLayerNotFound = includesAny(normalized, [SIGNAL_NOT_FOUND_MATCH, `\u672a\u627e\u5230${SIGNAL_TARGET_LAYER}`]);

  if (callName === 'delete_layer' && (isAmbiguous || isLayerNotFound)) {
    const layerKind = normalized.includes(SIGNAL_TRANSLATION_KIND)
      ? t(locale, 'transcription.toolFeedback.layerKind.translation')
      : t(locale, 'transcription.toolFeedback.layerKind.transcription');
    return pickToolCopyByStyle(
      style,
      tf(locale, 'transcription.toolFeedback.clarify.deleteLayer.concise', { layerKind }),
      tf(locale, 'transcription.toolFeedback.clarify.deleteLayer.verbose', { layerKind }),
    );
  }

  if (
    ['create_transcription_segment', 'split_transcription_segment', 'set_transcription_text', 'delete_transcription_segment', 'auto_gloss_utterance'].includes(callName)
    && isMissingOrNotFound
    && hasUtteranceSignal
  ) {
    const actionNoun = callName === 'delete_transcription_segment'
      ? t(locale, 'transcription.toolFeedback.action.delete')
      : callName === 'auto_gloss_utterance'
        ? t(locale, 'transcription.toolFeedback.action.annotate')
        : callName === 'set_transcription_text'
          ? t(locale, 'transcription.toolFeedback.action.edit')
          : t(locale, 'transcription.toolFeedback.action.split');
    return pickToolCopyByStyle(
      style,
      tf(locale, 'transcription.toolFeedback.clarify.segment.concise', { actionNoun }),
      tf(locale, 'transcription.toolFeedback.clarify.segment.verbose', { actionNoun }),
    );
  }

  if (
    ['set_translation_text', 'clear_translation_segment'].includes(callName)
    && isMissingOrNotFound
    && (hasUtteranceSignal || hasLayerSignal || hasTranslationLayerSignal)
  ) {
    return pickToolCopyByStyle(
      style,
      t(locale, 'transcription.toolFeedback.clarify.translation.concise'),
      t(locale, 'transcription.toolFeedback.clarify.translation.verbose'),
    );
  }

  if (
    ['link_translation_layer', 'unlink_translation_layer'].includes(callName)
    && isMissingOrNotFound
    && (hasLinkLayerSignal || hasLayerSignal)
  ) {
    return pickToolCopyByStyle(
      style,
      t(locale, 'transcription.toolFeedback.clarify.linkLayers.concise'),
      t(locale, 'transcription.toolFeedback.clarify.linkLayers.verbose'),
    );
  }

  const isCreateLayerConflict = includesAny(normalized, [
    SIGNAL_CREATE_TRANSCRIPTION_FAILED,
    SIGNAL_CREATE_TRANSLATION_FAILED,
    SIGNAL_ALIAS_CONFLICT,
    'alias',
  ]);

  if (callName === 'create_transcription_layer' && isCreateLayerConflict) {
    return pickToolCopyByStyle(
      style,
      t(locale, 'transcription.toolFeedback.clarify.createTranscriptionLayer.concise'),
      t(locale, 'transcription.toolFeedback.clarify.createTranscriptionLayer.verbose'),
    );
  }

  if (callName === 'create_translation_layer' && isCreateLayerConflict) {
    return pickToolCopyByStyle(
      style,
      t(locale, 'transcription.toolFeedback.clarify.createTranslationLayer.concise'),
      t(locale, 'transcription.toolFeedback.clarify.createTranslationLayer.verbose'),
    );
  }

  return null;
}

function toFailureRecoveryHint(locale: Locale, callName: string, message: string, style: AiToolFeedbackStyle): string {
  const normalized = message.toLowerCase();
  const prefix = pickToolCopyByStyle(
    style,
    t(locale, 'transcription.toolFeedback.nextStep.concise'),
    t(locale, 'transcription.toolFeedback.nextStep.verbose'),
  );
  if (includesAny(normalized, [SIGNAL_MISSING, 'missing'])) {
    return `${prefix}${t(locale, 'transcription.toolFeedback.recovery.missing')}`;
  }
  if (includesAny(normalized, [SIGNAL_NOT_FOUND, 'not found'])) {
    return `${prefix}${t(locale, 'transcription.toolFeedback.recovery.notFound')}`;
  }
  if (includesAny(normalized, ['\u591a\u4e2a', 'ambiguous'])) {
    if (callName === 'delete_layer' || includesAny(normalized, ['layer', SIGNAL_LAYER])) {
      return `${prefix}${t(locale, 'transcription.toolFeedback.recovery.layerAmbiguous')}`;
    }
    return `${prefix}${t(locale, 'transcription.toolFeedback.recovery.targetAmbiguous')}`;
  }
  if (callName === 'delete_layer' || callName === 'delete_transcription_segment') {
    return `${prefix}${t(locale, 'transcription.toolFeedback.recovery.previewDelete')}`;
  }
  return `${prefix}${t(locale, 'transcription.toolFeedback.recovery.retrySpecific')}`;
}

export function formatToolSuccessMessage(
  locale: Locale,
  actionLabel: string,
  message: string,
  style: AiToolFeedbackStyle,
): string {
  // Return split feedback directly to avoid redundant "completed + result" wording.
  if (actionLabel === SPLIT_SEGMENT_ACTION_LABEL_ZH || actionLabel === 'Split Segment') {
    return message;
  }

  return pickToolCopyByStyle(
    style,
    tf(locale, 'transcription.toolFeedback.success.concise', { actionLabel, message }),
    tf(locale, 'transcription.toolFeedback.success.verbose', { actionLabel, message }),
  );
}

export function formatToolFailureMessage(
  locale: Locale,
  callName: string,
  actionLabel: string,
  message: string,
  style: AiToolFeedbackStyle,
): string {
  const clarificationPrompt = toNaturalTargetResolutionPrompt(locale, callName, message, style);
  if (clarificationPrompt) return clarificationPrompt;
  const recoveryHint = toFailureRecoveryHint(locale, callName, message, style);
  return pickToolCopyByStyle(
    style,
    tf(locale, 'transcription.toolFeedback.failure.concise', { actionLabel, message, recoveryHint }),
    tf(locale, 'transcription.toolFeedback.failure.verbose', { actionLabel, message, recoveryHint }),
  );
}

export function formatToolPendingMessage(locale: Locale, actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    tf(locale, 'transcription.toolFeedback.pending.concise', { actionLabel }),
    tf(locale, 'transcription.toolFeedback.pending.verbose', { actionLabel }),
  );
}

export function formatToolGraySkippedMessage(locale: Locale, actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    tf(locale, 'transcription.toolFeedback.gray.concise', { actionLabel }),
    tf(locale, 'transcription.toolFeedback.gray.verbose', { actionLabel }),
  );
}

export function formatToolRollbackSkippedMessage(locale: Locale, actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    tf(locale, 'transcription.toolFeedback.rollback.concise', { actionLabel }),
    tf(locale, 'transcription.toolFeedback.rollback.verbose', { actionLabel }),
  );
}

export function formatToolCancelledMessage(locale: Locale, actionLabel: string, style: AiToolFeedbackStyle): string {
  return pickToolCopyByStyle(
    style,
    tf(locale, 'transcription.toolFeedback.cancelled.concise', { actionLabel }),
    tf(locale, 'transcription.toolFeedback.cancelled.verbose', { actionLabel }),
  );
}
