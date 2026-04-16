import type { Locale } from './index';
import { getLayerActionLabels, type LayerActionLabels } from './layerActionLabels';

export type LayerActionPopoverMessages = LayerActionLabels & {
  editTranscriptionMetadata: string;
  editTranslationMetadata: string;
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

const zhCN: LayerActionPopoverMessages = {
  ...getLayerActionLabels('zh-CN'),
  editTranscriptionMetadata: '编辑转写层元信息',
  editTranslationMetadata: '编辑翻译层元信息',
  saveMetadata: '保存',
  createFailedPrefix: '\u521b\u5efa\u5931\u8d25',
  transcriptionCreateFallback: '\u65e0\u6cd5\u521b\u5efa\u8f6c\u5199\u5c42\uff1a\u8bf7\u68c0\u67e5\u8fb9\u754c\u6a21\u5f0f\u3001\u76ee\u6807\u8bed\u8a00\u4e0e\u522b\u540d\u8bbe\u7f6e\u3002',
  translationCreateFallback: '\u65e0\u6cd5\u521b\u5efa\u7ffb\u8bd1\u5c42\uff1a\u8bf7\u68c0\u67e5\u4f9d\u8d56\u5c42\u3001\u76ee\u6807\u8bed\u8a00\u4e0e\u522b\u540d\u8bbe\u7f6e\u3002',
  genericActionFailed: '\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
  createdPrefix: '\u5df2\u521b\u5efa',
  cancel: '\u53d6\u6d88',
  create: '\u521b\u5efa',
  deleteAction: '\u5220\u9664',
  customLanguageOption: '\u5176\u4ed6\uff08\u624b\u52a8\u8f93\u5165\uff09',
  selectLanguage: '\u9009\u62e9\u8bed\u8a00\u2026',
  customLanguageCodePlaceholder: 'ISO 639-3 \u4ee3\u7801\uff08\u5982 tib\uff09',
  sourceLanguagePlaceholder: '\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u2026',
  sourceLanguageCodeLabel: '\u6765\u6e90\u8bed\u8a00\u4ee3\u7801',
  sourceLanguageCodePlaceholder: '\u6765\u6e90\u8bed\u8a00 ISO 639-3 \u4ee3\u7801\uff08\u5982 eng\uff09',
  useDefaultScript: '\u5f53\u524d\u8bed\u8a00\u6682\u65e0\u53ef\u7528\u6b63\u5b57\u6cd5',
  orthographyFieldLabel: '\u6b63\u5b57\u6cd5',
  createOrthography: '+ \u65b0\u5efa\u6b63\u5b57\u6cd5\u2026',
  newOrthographyButton: '\u65b0\u5efa',
  orthographyHint: '\u5f53\u524d\u8bed\u8a00\u5c1a\u672a\u5339\u914d\u5230\u5185\u7f6e\u6216\u81ea\u5efa\u6b63\u5b57\u6cd5\uff0c\u53ef\u76f4\u63a5\u65b0\u5efa\u4e00\u5957\u6b63\u5b57\u6cd5\u3002',
  dialectPlaceholder: '\u65b9\u8a00\uff08\u53ef\u9009\uff09',
  vernacularPlaceholder: '\u571f\u8bed\uff08\u53ef\u9009\uff09',
  aliasShortPlaceholder: '\u522b\u540d\uff08\u53ef\u9009\uff09',
  constraintLegend: '\u5c42\u7ea6\u675f\u7c7b\u578b',
  dependentConstraint: '\u4f9d\u8d56\u8fb9\u754c\uff08\u8ddf\u968f\u4e3b\u8f6c\u5199\u5c42\uff09',
  independentConstraint: '\u72ec\u7acb\u8fb9\u754c\uff08\u81ea\u7531\u5b9a\u4e49\uff09',
  selectParentLayer: '\u9009\u62e9\u4f9d\u8d56\u8fb9\u754c\u5c42\u2026',
  autoLinkedParent: (label) => `\u5df2\u81ea\u52a8\u5173\u8054\u5230\u300c${label}\u300d\u3002`,
  currentRestrictionTranslation: '\u5f53\u524d\u9650\u5236\uff1a\u65e0\u6cd5\u65b0\u5efa\u7ffb\u8bd1\u3002',
  currentRestrictionTranscription: '\u5f53\u524d\u9650\u5236\uff1a\u65e0\u6cd5\u65b0\u5efa\u8f6c\u5199\u3002',
  requiredPrefix: '\u5fc5\u586b\u9879\uff1a',
  deleteLayerConfirmMessage: (layerName, textCount) => `\u5c42\u300c${layerName}\u300d\u5305\u542b ${textCount} \u6761\u6587\u672c\u8bb0\u5f55\uff0c\u5220\u9664\u540e\u5c06\u65e0\u6cd5\u6062\u590d\u3002`,
  transcriptionCreateUnavailable: '\u5f53\u524d\u65e0\u6cd5\u65b0\u5efa\u8f6c\u5199',
  translationCreateUnavailable: '\u5f53\u524d\u65e0\u6cd5\u65b0\u5efa\u7ffb\u8bd1',
  transcriptionLanguageRequired: '\u5fc5\u586b\u9879\uff1a\u8bf7\u5148\u9009\u62e9\u8f6c\u5199\u5c42\u8bed\u8a00\uff08\u81ea\u5b9a\u4e49\u8bed\u8a00\u9700\u586b\u5199\u4ee3\u7801\uff09\u3002',
  translationLanguageRequired: '\u5fc5\u586b\u9879\uff1a\u8bf7\u5148\u9009\u62e9\u7ffb\u8bd1\u5c42\u8bed\u8a00\uff08\u81ea\u5b9a\u4e49\u8bed\u8a00\u9700\u586b\u5199\u4ee3\u7801\uff09\u3002',
  modalityLabel: '\u6a21\u6001',
  modalityText: '\u6587\u672c\uff08\u7eaf\u6587\u5b57\u7ffb\u8bd1\uff09',
  modalityAudio: '\u8bed\u97f3\uff08\u53e3\u8bd1\u5f55\u97f3\uff09',
  modalityMixed: '\u6df7\u5408\uff08\u6587\u5b57 + \u5f55\u97f3\uff09',
  translationBoundarySource: '\u8fb9\u754c\u6765\u6e90\uff1a\u7ffb\u8bd1\u5c42\u4f1a\u6cbf\u7528\u6240\u9009\u8f6c\u5199\u5c42\u7684\u8fb9\u754c\u8303\u56f4\u3002',
  languageNameLabel: '\u8bed\u8a00\u540d\u79f0',
  languageAssetIdLabel: '\u8bed\u8a00 ID\uff08\u7cfb\u7edf\u552f\u4e00\u6807\u8bc6\uff09',
  languageAssetIdPlaceholder: '\u7559\u7a7a\u5219\u81ea\u52a8\u751f\u6210',
  languageCodeLabel: '\u8bed\u8a00\u4ee3\u7801',
  aliasHint: '\u522b\u540d\uff08\u53ef\u9009\uff0c\u540c\u8bed\u8a00\u591a\u5c42\u65f6\u7528\u4e8e\u533a\u5206\uff09',
  confirmDelete: '\u786e\u8ba4\u5220\u9664',
  resetForm: '\u91cd\u7f6e\u8868\u5355',
  invalidLanguageCode: '\u8bed\u8a00\u4ee3\u7801\u5fc5\u987b\u662f\u6709\u6548\u7684 ISO 639-3 \u4e09\u5b57\u6bcd\u4ee3\u7801\u3002',
  invalidOrthographySelection: '\u6240\u9009\u6b63\u5b57\u6cd5\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u3002',
  orthographyContextTargetLanguage: (language) => `\u76ee\u6807\u5c42\u8bed\u8a00\uff1a${language}`,
  orthographyContextLayerType: (layerType) => `\u5c42\u7c7b\u578b\uff1a${layerType}`,
};

const enUS: LayerActionPopoverMessages = {
  ...getLayerActionLabels('en-US'),
  editTranscriptionMetadata: 'Edit Transcription Metadata',
  editTranslationMetadata: 'Edit Translation Metadata',
  saveMetadata: 'Save',
  createFailedPrefix: 'Create failed',
  transcriptionCreateFallback: 'Unable to create transcription layer. Check boundary mode, target language, and alias settings.',
  translationCreateFallback: 'Unable to create translation layer. Check dependency layer, target language, and alias settings.',
  genericActionFailed: 'Action failed. Please try again later.',
  createdPrefix: 'Created',
  cancel: 'Cancel',
  create: 'Create',
  deleteAction: 'Delete',
  customLanguageOption: 'Other (manual input)',
  selectLanguage: 'Select language…',
  customLanguageCodePlaceholder: 'ISO 639-3 code (e.g. tib)',
  sourceLanguagePlaceholder: 'Select source language…',
  sourceLanguageCodeLabel: 'Source language code',
  sourceLanguageCodePlaceholder: 'Source language ISO 639-3 code (e.g. eng)',
  useDefaultScript: 'No available orthography yet',
  orthographyFieldLabel: 'Orthography',
  createOrthography: '+ Create orthography…',
  newOrthographyButton: 'New',
  orthographyHint: 'No built-in or custom orthography is available for this language yet. Create one directly.',
  dialectPlaceholder: 'Dialect (optional)',
  vernacularPlaceholder: 'Vernacular (optional)',
  aliasShortPlaceholder: 'Alias (optional)',
  constraintLegend: 'Layer Constraint Type',
  dependentConstraint: 'Dependent boundary (follows parent transcription layer)',
  independentConstraint: 'Independent boundary (free-defined)',
  selectParentLayer: 'Select dependent boundary layer…',
  autoLinkedParent: (label) => `Automatically linked to "${label}".`,
  currentRestrictionTranslation: 'Current restriction: cannot create translation. ',
  currentRestrictionTranscription: 'Current restriction: cannot create transcription. ',
  requiredPrefix: 'Required:',
  deleteLayerConfirmMessage: (layerName, textCount) => `Layer "${layerName}" contains ${textCount} text entries and cannot be restored after deletion.`,
  transcriptionCreateUnavailable: 'Unable to create transcription right now',
  translationCreateUnavailable: 'Unable to create translation right now',
  transcriptionLanguageRequired: 'Required: select a transcription layer language first (custom languages require a code).',
  translationLanguageRequired: 'Required: select a translation layer language first (custom languages require a code).',
  modalityText: 'Text (text-only translation)',
  modalityLabel: 'Modality',
  modalityAudio: 'Audio (interpreting recording)',
  modalityMixed: 'Mixed (text + recording)',
  translationBoundarySource: 'Boundary source: translation layers inherit the boundary range of the selected transcription layer.',
  languageNameLabel: 'Language Name',
  languageAssetIdLabel: 'Language ID (unique identifier)',
  languageAssetIdPlaceholder: 'Auto-generated if left empty',
  languageCodeLabel: 'Language Code',
  aliasHint: 'Optional — used to distinguish layers of the same language',
  confirmDelete: 'Confirm Delete',
  resetForm: 'Reset form',
  invalidLanguageCode: 'Language code must be a valid ISO 639-3 code.',
  invalidOrthographySelection: 'The selected orthography is no longer available. Please choose another one.',
  orthographyContextTargetLanguage: (language) => `Target layer language: ${language}`,
  orthographyContextLayerType: (layerType) => `Layer type: ${layerType}`,
};

export function getLayerActionPopoverMessages(locale: Locale): LayerActionPopoverMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}