import type { LayerConstraint, LayerDocType } from '../../db';
import {
  getLayerCreateGuard,
  type TranslationCreateGuardResult,
} from '../../services/LayerConstraintService';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { LayerActionType } from '../layerActionPopoverHelpers';

export type LayerActionPopoverCreateGuardBundle = {
  existingTranscriptionCount: number;
  resolvedLangForGuard: string;
  hasValidLanguage: boolean;
  showConstraintSelector: boolean;
  preferredTranslationHostResolved: string | undefined;
  translationGuard: TranslationCreateGuardResult;
  transcriptionGuard: TranslationCreateGuardResult;
  translationCreateDisabledReason: string;
  transcriptionCreateDisabledReason: string;
  symbolicConstraintGuard: TranslationCreateGuardResult;
  independentConstraintGuard: TranslationCreateGuardResult;
  showCreateFailure: boolean;
  createLanguageRequiredText: string;
};

export function buildLayerActionPopoverTitleLabel(
  action: LayerActionType,
  messages: LayerActionPopoverMessages,
): string {
  if (action === 'create-transcription') return messages.createTranscriptionLayer;
  if (action === 'create-translation') return messages.createTranslationLayer;
  if (action === 'edit-transcription-metadata' || action === 'edit-translation-metadata') {
    return messages.editLayerMetadata;
  }
  return messages.deleteLayer;
}

export function buildLayerActionPopoverCreateGuardBundle(input: {
  action: LayerActionType;
  deletableLayers: readonly LayerDocType[];
  resolvedLanguageId: string;
  alias: string;
  modality: LayerDocType['modality'];
  constraint: LayerConstraint;
  translationHostIds: readonly string[];
  preferredTranslationHostId: string;
  independentParentLayers: readonly LayerDocType[];
  resolvedTranscriptionParentLayerId: string;
  messages: LayerActionPopoverMessages;
  createFailureMessage: string;
}): LayerActionPopoverCreateGuardBundle {
  const {
    action,
    deletableLayers,
    resolvedLanguageId,
    alias,
    modality,
    constraint,
    translationHostIds,
    preferredTranslationHostId,
    independentParentLayers,
    resolvedTranscriptionParentLayerId,
    messages: actionMessages,
    createFailureMessage,
  } = input;

  const existingTranscriptionCount = deletableLayers.filter(
    (layer) => layer.layerType === 'transcription',
  ).length;
  const resolvedLangForGuard = resolvedLanguageId.trim();
  const hasValidLanguage = resolvedLangForGuard.length > 0;
  const showConstraintSelector =
    action === 'create-transcription' && existingTranscriptionCount > 0;
  const preferredTranslationHostResolved =
    preferredTranslationHostId && translationHostIds.includes(preferredTranslationHostId)
      ? preferredTranslationHostId
      : translationHostIds[0];
  const translationGuard =
    action === 'create-translation'
      ? getLayerCreateGuard([...deletableLayers], 'translation', {
          languageId: resolvedLangForGuard,
          alias,
          modality,
          constraint: 'symbolic_association',
          ...(translationHostIds.length > 0
            ? {
                hostTranscriptionLayerIds: [...translationHostIds],
                ...(preferredTranslationHostResolved
                  ? { preferredHostTranscriptionLayerId: preferredTranslationHostResolved }
                  : {}),
              }
            : {}),
          hasSupportedParent: independentParentLayers.length > 0,
        })
      : { allowed: true as const };
  const transcriptionGuard =
    action === 'create-transcription'
      ? getLayerCreateGuard([...deletableLayers], 'transcription', {
          languageId: resolvedLangForGuard,
          alias,
          modality,
          ...(showConstraintSelector ? { constraint } : {}),
          ...(resolvedTranscriptionParentLayerId
            ? { parentLayerId: resolvedTranscriptionParentLayerId }
            : {}),
          hasSupportedParent: independentParentLayers.length > 0,
        })
      : { allowed: true as const };
  const translationCreateDisabledReason =
    action === 'create-translation'
      ? translationGuard.allowed
        ? ''
        : (translationGuard.reasonShort ?? actionMessages.translationCreateUnavailable)
      : '';
  const transcriptionCreateDisabledReason =
    action === 'create-transcription'
      ? transcriptionGuard.allowed
        ? ''
        : (transcriptionGuard.reasonShort ?? actionMessages.transcriptionCreateUnavailable)
      : '';

  const createGuardByConstraint = (candidate: LayerConstraint): TranslationCreateGuardResult => {
    if (action === 'delete') return { allowed: true as const };
    const optionParentLayerId =
      candidate === 'independent_boundary'
        ? undefined
        : resolvedTranscriptionParentLayerId || independentParentLayers[0]?.id;
    return getLayerCreateGuard(
      [...deletableLayers],
      action === 'create-transcription' ? 'transcription' : 'translation',
      {
        languageId: resolvedLangForGuard,
        alias,
        modality,
        constraint: candidate,
        ...(optionParentLayerId ? { parentLayerId: optionParentLayerId } : {}),
        hasSupportedParent: independentParentLayers.length > 0,
      },
    );
  };
  const symbolicConstraintGuard = createGuardByConstraint('symbolic_association');
  const independentConstraintGuard = createGuardByConstraint('independent_boundary');

  const showCreateFailure = action !== 'delete' && createFailureMessage.trim().length > 0;
  const createLanguageRequiredMessage =
    action === 'create-translation'
      ? actionMessages.translationLanguageRequired
      : actionMessages.transcriptionLanguageRequired;
  const createLanguageRequiredText = createLanguageRequiredMessage.startsWith(
    actionMessages.requiredPrefix,
  )
    ? createLanguageRequiredMessage
    : `${actionMessages.requiredPrefix}${createLanguageRequiredMessage}`;

  return {
    existingTranscriptionCount,
    resolvedLangForGuard,
    hasValidLanguage,
    showConstraintSelector,
    preferredTranslationHostResolved,
    translationGuard,
    transcriptionGuard,
    translationCreateDisabledReason,
    transcriptionCreateDisabledReason,
    symbolicConstraintGuard,
    independentConstraintGuard,
    showCreateFailure,
    createLanguageRequiredText,
  };
}
