import type { PromptTemplateItem } from './aiChatCardUtils';

interface AiChatPromptLabModalProps {
  isZh: boolean;
  showPromptLab: boolean;
  promptTemplates: PromptTemplateItem[];
  editingTemplateId: string | null;
  templateTitleInput: string;
  templateContentInput: string;
  onInjectTemplate: (content: string) => void;
  onEditTemplate: (item: PromptTemplateItem) => void;
  onRemoveTemplate: (id: string) => void;
  onTemplateTitleInputChange: (value: string) => void;
  onTemplateContentInputChange: (value: string) => void;
  onAppendPromptVariable: (name: string) => void;
  onSaveTemplate: () => void;
  onInjectAndClose: () => void;
}

export function AiChatPromptLabModal({
  isZh,
  showPromptLab,
  promptTemplates,
  editingTemplateId,
  templateTitleInput,
  templateContentInput,
  onInjectTemplate,
  onEditTemplate,
  onRemoveTemplate,
  onTemplateTitleInputChange,
  onTemplateContentInputChange,
  onAppendPromptVariable,
  onSaveTemplate,
  onInjectAndClose,
}: AiChatPromptLabModalProps) {
  if (!showPromptLab) return null;

  return (
    <div className="ai-chat-prompt-lab-panel-content">
      <div className="ai-chat-prompt-lab-section">
        <p className="ai-chat-fold-empty ai-chat-prompt-lab-panel-note">
          {isZh ? '\u7ef4\u62a4\u81ea\u5b9a\u4e49 Prompt \u6a21\u677f，\u652f\u6301\u53d8\u91cf\u62fc\u88c5\u5e76\u6ce8\u5165\u8f93\u5165\u6846。' : 'Manage custom prompt templates, compose variables, and inject them into the input.'}
        </p>
      </div>

      <div className="ai-chat-prompt-lab-section">
        {promptTemplates.length === 0 ? (
          <p className="ai-chat-fold-empty ai-chat-prompt-lab-empty">{isZh ? '\u6682\u65e0\u81ea\u5b9a\u4e49\u6a21\u677f，\u53ef\u5728\u4e0b\u65b9\u521b\u5efa。' : 'No custom templates yet. Create one below.'}</p>
        ) : (
          promptTemplates.map((item) => (
            <div key={item.id} className="ai-chat-prompt-lab-template-row">
              <span className="small-text ai-chat-prompt-lab-item-title ai-chat-prompt-lab-item-title-ellipsis" title={item.content}>{item.title}</span>
              <button type="button" className="icon-btn ai-chat-prompt-lab-mini-btn" onClick={() => onInjectTemplate(item.content)}>{isZh ? '\u6ce8\u5165' : 'Inject'}</button>
              <button type="button" className="icon-btn ai-chat-prompt-lab-mini-btn" onClick={() => onEditTemplate(item)}>{isZh ? '\u7f16\u8f91' : 'Edit'}</button>
              <button type="button" className="icon-btn ai-chat-prompt-lab-mini-btn ai-chat-prompt-lab-mini-btn-danger" onClick={() => onRemoveTemplate(item.id)}>{isZh ? '\u5220\u9664' : 'Del'}</button>
            </div>
          ))
        )}
      </div>

      <div className="ai-chat-prompt-lab-section ai-chat-prompt-lab-section-separated">
        <input
          type="text"
          value={templateTitleInput}
          placeholder={isZh ? '\u6a21\u677f\u540d\u79f0' : 'Template title'}
          onChange={(event) => onTemplateTitleInputChange(event.currentTarget.value)}
          className="ai-chat-input ai-chat-prompt-lab-input"
        />
        <textarea
          value={templateContentInput}
          placeholder={isZh ? '\u6a21\u677f\u5185\u5bb9，\u652f\u6301 {{selected_text}} \u7b49\u53d8\u91cf' : 'Template body with {{selected_text}} {{current_utterance}}...'}
          onChange={(event) => onTemplateContentInputChange(event.currentTarget.value)}
          className="ai-chat-prompt-lab-textarea"
        />
        <div className="ai-chat-prompt-lab-token-row">
          {['selected_text', 'current_utterance', 'lexicon_summary', 'project_stage', 'current_row'].map((token) => (
            <button key={token} type="button" className="icon-btn ai-chat-prompt-lab-token-btn" onClick={() => onAppendPromptVariable(token)}>{`{{${token}}}`}</button>
          ))}
        </div>
        <div className="ai-chat-prompt-lab-action-row">
          <button type="button" className="icon-btn ai-chat-prompt-lab-action-btn" disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0} onClick={onSaveTemplate}>{editingTemplateId ? (isZh ? '\u66f4\u65b0' : 'Update') : (isZh ? '\u4fdd\u5b58' : 'Save')}</button>
          <button type="button" className="icon-btn ai-chat-prompt-lab-action-btn ai-chat-prompt-lab-action-btn-primary" disabled={templateContentInput.trim().length === 0} onClick={onInjectAndClose}>{isZh ? '\u6ce8\u5165\u5230\u8f93\u5165\u6846' : 'Inject to Input'}</button>
        </div>
      </div>
    </div>
  );
}
