import type { Locale } from './index';

export type LayerManagerPopoverMessages = {
  createFailedPrefix: string;
  transcriptionCreateFallback: string;
  translationCreateFallback: string;
  missingLanguage: string;
  layerManagement: string;
  close: string;
  createTranscriptionLayer: string;
  createTranslationLayer: string;
  deleteLayer: string;
  existingCount: (count: number) => string;
  deletableCount: (count: number) => string;
  selectLanguage: string;
  customLanguageOption: string;
  customLanguageCodePlaceholder: string;
  aliasPlaceholder: string;
  constraintLegend: string;
  dependentConstraint: string;
  independentConstraint: string;
  selectParentLayer: string;
  autoLinkedParent: (label: string) => string;
  transcriptionCreateUnavailable: string;
  translationCreateUnavailable: string;
  transcriptionDisabledReason: (reason: string) => string;
  translationDisabledReason: (reason: string) => string;
  transcriptionLanguageRequired: string;
  translationLanguageRequired: string;
  modalityText: string;
  modalityAudio: string;
  modalityMixed: string;
  translationBoundarySource: string;
  transcriptionLayerType: string;
  translationLayerType: string;
  noDeletableLayers: string;
  noDeletableLayersHint: string;
  deleteCleanupHint: string;
  confirmDelete: string;
};

const zhCN: LayerManagerPopoverMessages = {
  createFailedPrefix: '\u521b\u5efa\u5931\u8d25',
  transcriptionCreateFallback: '\u65e0\u6cd5\u521b\u5efa\u8f6c\u5199\u5c42\uff1a\u8bf7\u68c0\u67e5\u8fb9\u754c\u6a21\u5f0f\u3001\u76ee\u6807\u8bed\u8a00\u4e0e\u522b\u540d\u8bbe\u7f6e\u3002',
  translationCreateFallback: '\u65e0\u6cd5\u521b\u5efa\u7ffb\u8bd1\u5c42\uff1a\u8bf7\u68c0\u67e5\u4f9d\u8d56\u5c42\u3001\u76ee\u6807\u8bed\u8a00\u4e0e\u522b\u540d\u8bbe\u7f6e\u3002',
  missingLanguage: '\u672a\u8bbe\u7f6e\u8bed\u8a00',
  layerManagement: '\u5c42\u7ba1\u7406',
  close: '\u5173\u95ed',
  createTranscriptionLayer: '\u65b0\u5efa\u8f6c\u5199\u5c42',
  createTranslationLayer: '\u65b0\u5efa\u7ffb\u8bd1\u5c42',
  deleteLayer: '\u5220\u9664\u5c42',
  existingCount: (count) => `\u73b0\u6709 ${count}`,
  deletableCount: (count) => `\u53ef\u5220 ${count}`,
  selectLanguage: '\u9009\u62e9\u8bed\u8a00\u2026',
  customLanguageOption: '\u5176\u4ed6\uff08\u624b\u52a8\u8f93\u5165\uff09',
  customLanguageCodePlaceholder: 'ISO 639-3 \u4ee3\u7801\uff08\u5982 tib\uff09',
  aliasPlaceholder: '\u522b\u540d\uff08\u53ef\u9009\uff0c\u540c\u8bed\u8a00\u591a\u5c42\u65f6\u7528\u4e8e\u533a\u5206\uff09',
  constraintLegend: '\u5c42\u7ea6\u675f\u7c7b\u578b | Layer Constraint Type',
  dependentConstraint: '\u4f9d\u8d56\u8fb9\u754c\uff08\u8ddf\u968f\u4e3b\u8f6c\u5199\u5c42\uff09| Dependent',
  independentConstraint: '\u72ec\u7acb\u8fb9\u754c\uff08\u81ea\u7531\u5b9a\u4e49\uff09| Independent',
  selectParentLayer: '\u9009\u62e9\u4f9d\u8d56\u8fb9\u754c\u5c42\u2026',
  autoLinkedParent: (label) => `\u5df2\u81ea\u52a8\u5173\u8054\u5230\u300c${label}\u300d\u3002`,
  transcriptionCreateUnavailable: '\u5f53\u524d\u65e0\u6cd5\u65b0\u5efa\u8f6c\u5199',
  translationCreateUnavailable: '\u5f53\u524d\u65e0\u6cd5\u65b0\u5efa\u7ffb\u8bd1',
  transcriptionDisabledReason: (reason) => `\u5f53\u524d\u9650\u5236\uff1a\u65e0\u6cd5\u65b0\u5efa\u8f6c\u5199\u3002${reason}`,
  translationDisabledReason: (reason) => `\u5f53\u524d\u9650\u5236\uff1a\u65e0\u6cd5\u65b0\u5efa\u7ffb\u8bd1\u3002${reason}`,
  transcriptionLanguageRequired: '\u5fc5\u586b\u9879\uff1a\u8bf7\u5148\u9009\u62e9\u8f6c\u5199\u5c42\u8bed\u8a00\uff08\u81ea\u5b9a\u4e49\u8bed\u8a00\u9700\u586b\u5199\u4ee3\u7801\uff09\u3002',
  translationLanguageRequired: '\u5fc5\u586b\u9879\uff1a\u8bf7\u5148\u9009\u62e9\u7ffb\u8bd1\u5c42\u8bed\u8a00\uff08\u81ea\u5b9a\u4e49\u8bed\u8a00\u9700\u586b\u5199\u4ee3\u7801\uff09\u3002',
  modalityText: '\u6587\u672c\uff08\u7eaf\u6587\u5b57\u7ffb\u8bd1\uff09',
  modalityAudio: '\u8bed\u97f3\uff08\u53e3\u8bd1\u5f55\u97f3\uff09',
  modalityMixed: '\u6df7\u5408\uff08\u6587\u5b57 + \u5f55\u97f3\uff09',
  translationBoundarySource: '\u8fb9\u754c\u6765\u6e90\uff1a\u7ffb\u8bd1\u5c42\u4f1a\u6cbf\u7528\u6240\u9009\u8f6c\u5199\u5c42\u7684\u8fb9\u754c\u8303\u56f4\u3002',
  transcriptionLayerType: '\u8f6c\u5199\u5c42',
  translationLayerType: '\u7ffb\u8bd1\u5c42',
  noDeletableLayers: '\u65e0\u53ef\u5220\u9664\u5c42',
  noDeletableLayersHint: '\u5f53\u524d\u6ca1\u6709\u53ef\u5220\u9664\u5c42\u3002\u9ed8\u8ba4\u5c42\u4f1a\u88ab\u4fdd\u62a4\uff0c\u4e0d\u80fd\u5220\u9664\u3002',
  deleteCleanupHint: '\u5220\u9664\u65f6\u4f1a\u540c\u65f6\u6e05\u7406\u8be5\u5c42\u4e0b\u7684\u6587\u672c/\u5f55\u97f3\u8bb0\u5f55\u4e0e\u5173\u8054\u94fe\u63a5\u3002',
  confirmDelete: '\u786e\u8ba4\u5220\u9664',
};

const enUS: LayerManagerPopoverMessages = {
  createFailedPrefix: 'Create failed',
  transcriptionCreateFallback: 'Unable to create transcription layer. Check boundary mode, target language, and alias settings.',
  translationCreateFallback: 'Unable to create translation layer. Check dependency layer, target language, and alias settings.',
  missingLanguage: 'Language not set',
  layerManagement: 'Layer Manager',
  close: 'Close',
  createTranscriptionLayer: 'New Transcription Layer',
  createTranslationLayer: 'New Translation Layer',
  deleteLayer: 'Delete Layer',
  existingCount: (count) => `Existing ${count}`,
  deletableCount: (count) => `Deletable ${count}`,
  selectLanguage: 'Select language\u2026',
  customLanguageOption: 'Other (manual input)',
  customLanguageCodePlaceholder: 'ISO 639-3 code (e.g. tib)',
  aliasPlaceholder: 'Alias (optional, used to distinguish multiple layers in the same language)',
  constraintLegend: 'Layer Constraint Type',
  dependentConstraint: 'Dependent boundary (follows parent transcription layer)',
  independentConstraint: 'Independent boundary (free-defined)',
  selectParentLayer: 'Select dependent boundary layer\u2026',
  autoLinkedParent: (label) => `Automatically linked to "${label}".`,
  transcriptionCreateUnavailable: 'Unable to create transcription right now',
  translationCreateUnavailable: 'Unable to create translation right now',
  transcriptionDisabledReason: (reason) => `Current constraint: cannot create transcription. ${reason}`,
  translationDisabledReason: (reason) => `Current constraint: cannot create translation. ${reason}`,
  transcriptionLanguageRequired: 'Required: select a transcription layer language first (custom languages require a code).',
  translationLanguageRequired: 'Required: select a translation layer language first (custom languages require a code).',
  modalityText: 'Text (text-only translation)',
  modalityAudio: 'Audio (interpreting recording)',
  modalityMixed: 'Mixed (text + recording)',
  translationBoundarySource: 'Boundary source: translation layers inherit the boundary range of the selected transcription layer.',
  transcriptionLayerType: 'Transcription',
  translationLayerType: 'Translation',
  noDeletableLayers: 'No deletable layers',
  noDeletableLayersHint: 'There are no deletable layers right now. Protected default layers cannot be removed.',
  deleteCleanupHint: 'Deleting a layer also removes its text/audio records and related links.',
  confirmDelete: 'Confirm Delete',
};

export function getLayerManagerPopoverMessages(locale: Locale): LayerManagerPopoverMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
