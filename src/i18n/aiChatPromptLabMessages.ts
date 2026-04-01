export type AiChatPromptLabMessages = {
  panelNote: string;
  emptyTemplates: string;
  inject: string;
  edit: string;
  deleteShort: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
  update: string;
  save: string;
  injectToInput: string;
};

const zhCN: AiChatPromptLabMessages = {
  panelNote: '\u7ef4\u62a4\u81ea\u5b9a\u4e49 Prompt \u6a21\u677f\uff0c\u652f\u6301\u53d8\u91cf\u62fc\u88c5\u5e76\u6ce8\u5165\u8f93\u5165\u6846\u3002',
  emptyTemplates: '\u6682\u65e0\u81ea\u5b9a\u4e49\u6a21\u677f\uff0c\u53ef\u5728\u4e0b\u65b9\u521b\u5efa\u3002',
  inject: '\u6ce8\u5165',
  edit: '\u7f16\u8f91',
  deleteShort: '\u5220\u9664',
  titlePlaceholder: '\u6a21\u677f\u540d\u79f0',
  contentPlaceholder: '\u6a21\u677f\u5185\u5bb9\uff0c\u652f\u6301 {{selected_text}} \u7b49\u53d8\u91cf',
  update: '\u66f4\u65b0',
  save: '\u4fdd\u5b58',
  injectToInput: '\u6ce8\u5165\u5230\u8f93\u5165\u6846',
};

const enUS: AiChatPromptLabMessages = {
  panelNote: 'Manage custom prompt templates, compose variables, and inject them into the input.',
  emptyTemplates: 'No custom templates yet. Create one below.',
  inject: 'Inject',
  edit: 'Edit',
  deleteShort: 'Del',
  titlePlaceholder: 'Template title',
  contentPlaceholder: 'Template body with {{selected_text}} {{current_utterance}}...',
  update: 'Update',
  save: 'Save',
  injectToInput: 'Inject to Input',
};

export function getAiChatPromptLabMessages(isZh: boolean): AiChatPromptLabMessages {
  return isZh ? zhCN : enUS;
}
