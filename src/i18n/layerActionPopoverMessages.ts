import { normalizeLocale, type Locale } from './index';
import { getLayerActionLabels, type LayerActionLabels } from './layerActionLabels';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';

export type LayerActionPopoverMessages = LayerActionLabels & {
  /** 转写/翻译层编辑元数据共用标题 | Shared title for editing layer metadata */
  editLayerMetadata: string;
  saveMetadata: string;
  createFailedPrefix: string;
  transcriptionCreateFallback: string;
  translationCreateFallback: string;
  genericActionFailed: string;
  createdPrefix: string;
  cancel: string;
  create: string;
  deleteAction: string;
  customLanguageOption: string;
  selectLanguage: string;
  customLanguageCodePlaceholder: string;
  sourceLanguagePlaceholder: string;
  sourceLanguageCodeLabel: string;
  sourceLanguageCodePlaceholder: string;
  useDefaultScript: string;
  orthographyFieldLabel: string;
  createOrthography: string;
  newOrthographyButton: string;
  orthographyHint: string;
  dialectPlaceholder: string;
  vernacularPlaceholder: string;
  aliasShortPlaceholder: string;
  constraintLegend: string;
  dependentConstraint: string;
  independentConstraint: string;
  selectParentLayer: string;
  /** 新建翻译层：多宿主转写勾选 | New translation: pick host transcription layers */
  translationHostLayersLabel: string;
  /** 新建翻译层：首选宿主（多选时）| Preferred host when multiple hosts */
  translationPreferredHostLabel: string;
  autoLinkedParent: (label: string) => string;
  currentRestrictionTranslation: string;
  currentRestrictionTranscription: string;
  requiredPrefix: string;
  deleteLayerConfirmMessage: (layerName: string, textCount: number) => string;
  transcriptionCreateUnavailable: string;
  translationCreateUnavailable: string;
  translationLanguageRequired: string;
  transcriptionLanguageRequired: string;
  modalityLabel: string;
  modalityText: string;
  modalityAudio: string;
  modalityMixed: string;
  translationBoundarySource: string;
  languageNameLabel: string;
  languageAssetIdLabel: string;
  languageAssetIdPlaceholder: string;
  languageCodeLabel: string;
  aliasHint: string;
  confirmDelete: string;
  resetForm: string;
  invalidLanguageCode: string;
  invalidOrthographySelection: string;
  orthographyContextTargetLanguage: (language: string) => string;
  orthographyContextLayerType: (layerType: string) => string;
};

type LayerActionPopoverCatalog = Omit<
  LayerActionPopoverMessages,
  | 'createTranscriptionLayer'
  | 'createTranslationLayer'
  | 'deleteLayer'
  | 'transcriptionLayerType'
  | 'translationLayerType'
  | 'autoLinkedParent'
  | 'deleteLayerConfirmMessage'
  | 'orthographyContextTargetLanguage'
  | 'orthographyContextLayerType'
> & {
  autoLinkedParent: string;
  deleteLayerConfirmMessage: string;
  orthographyContextTargetLanguage: string;
  orthographyContextLayerType: string;
};

const DEFAULT_LAYER_ACTION_POPOVER_CATALOG: LayerActionPopoverCatalog = {
  editLayerMetadata: 'Edit layer metadata',
  saveMetadata: 'Save',
  createFailedPrefix: 'Create failed',
  transcriptionCreateFallback: 'Unable to create transcription layer.',
  translationCreateFallback: 'Unable to create translation layer.',
  genericActionFailed: 'Action failed. Please try again later.',
  createdPrefix: 'Created',
  cancel: 'Cancel',
  create: 'Create',
  deleteAction: 'Delete',
  customLanguageOption: 'Other (manual input)',
  selectLanguage: 'Select language…',
  customLanguageCodePlaceholder: 'ISO 639-3 code',
  sourceLanguagePlaceholder: 'Select source language…',
  sourceLanguageCodeLabel: 'Source language code',
  sourceLanguageCodePlaceholder: 'Source language ISO 639-3 code',
  useDefaultScript: 'No available orthography yet',
  orthographyFieldLabel: 'Orthography',
  createOrthography: '+ Create orthography…',
  newOrthographyButton: 'New',
  orthographyHint: 'No available orthography for this language yet.',
  dialectPlaceholder: 'Dialect (optional)',
  vernacularPlaceholder: 'Vernacular (optional)',
  aliasShortPlaceholder: 'Alias (optional)',
  constraintLegend: 'Layer Constraint Type',
  dependentConstraint: 'Dependent boundary (follows the selected host transcription layer)',
  independentConstraint: 'Independent boundary (maintained independently on this layer)',
  selectParentLayer: 'Select parent transcription layer…',
  translationHostLayersLabel: 'Host transcription layers (multi-select)',
  translationPreferredHostLabel: 'Preferred host',
  autoLinkedParent: 'Automatically linked to "{label}".',
  currentRestrictionTranslation: 'Current restriction: cannot create translation. ',
  currentRestrictionTranscription: 'Current restriction: cannot create transcription. ',
  requiredPrefix: 'Required: ',
  deleteLayerConfirmMessage: 'Layer "{layerName}" contains {textCount} text entries and cannot be restored after deletion.',
  transcriptionCreateUnavailable: 'Unable to create transcription right now',
  translationCreateUnavailable: 'Unable to create translation right now',
  translationLanguageRequired: 'Required: select a translation layer language first (custom languages require a code).',
  transcriptionLanguageRequired: 'Required: select a transcription layer language first (custom languages require a code).',
  modalityLabel: 'Modality',
  modalityText: 'Text',
  modalityAudio: 'Audio',
  modalityMixed: 'Mixed',
  translationBoundarySource: 'Boundary source: translation layers inherit the selected transcription boundary range.',
  languageNameLabel: 'Language Name',
  languageAssetIdLabel: 'Language ID',
  languageAssetIdPlaceholder: 'Auto-generated if left empty',
  languageCodeLabel: 'Language Code',
  aliasHint: 'Used to distinguish layers of the same language',
  confirmDelete: 'Confirm Delete',
  resetForm: 'Reset form',
  invalidLanguageCode: 'Language code must be a valid ISO 639-3 code.',
  invalidOrthographySelection: 'The selected orthography is no longer available. Please choose another one.',
  orthographyContextTargetLanguage: 'Target layer language: {language}',
  orthographyContextLayerType: 'Layer type: {layerType}',
};

export function getLayerActionPopoverMessages(locale: Locale): LayerActionPopoverMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const labels = getLayerActionLabels(normalizedLocale);
  const catalog = {
    ...DEFAULT_LAYER_ACTION_POPOVER_CATALOG,
    ...readMessageCatalog<Partial<LayerActionPopoverCatalog>>(normalizedLocale, 'msg.layerActionPopover.catalog'),
  };
  const {
    autoLinkedParent,
    deleteLayerConfirmMessage,
    orthographyContextTargetLanguage,
    orthographyContextLayerType,
    ...rest
  } = catalog;
  return {
    ...labels,
    ...rest,
    autoLinkedParent: (label) => formatCatalogTemplate(autoLinkedParent, { label }),
    deleteLayerConfirmMessage: (layerName, textCount) => formatCatalogTemplate(deleteLayerConfirmMessage, { layerName, textCount }),
    orthographyContextTargetLanguage: (language) => formatCatalogTemplate(orthographyContextTargetLanguage, { language }),
    orthographyContextLayerType: (layerType) => formatCatalogTemplate(orthographyContextLayerType, { layerType }),
  };
}