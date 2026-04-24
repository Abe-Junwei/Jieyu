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
  /** 新建转写层时模态说明 | Note when choosing modality for new transcription layer */
  transcriptionModalityHint: string;
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
  'autoLinkedParent' | 'deleteLayerConfirmMessage' | 'orthographyContextTargetLanguage' | 'orthographyContextLayerType'
> & {
  autoLinkedParent: string;
  deleteLayerConfirmMessage: string;
  orthographyContextTargetLanguage: string;
  orthographyContextLayerType: string;
};

export function getLayerActionPopoverMessages(locale: Locale): LayerActionPopoverMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const labels = getLayerActionLabels(normalizedLocale);
  const {
    autoLinkedParent,
    deleteLayerConfirmMessage,
    orthographyContextTargetLanguage,
    orthographyContextLayerType,
    ...rest
  } = readMessageCatalog<LayerActionPopoverCatalog>(normalizedLocale, 'msg.layerActionPopover.catalog');
  return {
    ...labels,
    ...rest,
    autoLinkedParent: (label) => formatCatalogTemplate(autoLinkedParent, { label }),
    deleteLayerConfirmMessage: (layerName, textCount) => formatCatalogTemplate(deleteLayerConfirmMessage, { layerName, textCount }),
    orthographyContextTargetLanguage: (language) => formatCatalogTemplate(orthographyContextTargetLanguage, { language }),
    orthographyContextLayerType: (layerType) => formatCatalogTemplate(orthographyContextLayerType, { layerType }),
  };
}