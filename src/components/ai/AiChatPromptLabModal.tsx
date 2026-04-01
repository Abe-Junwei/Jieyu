import type { PromptTemplateItem } from './aiChatCardUtils';
import { getAiChatPromptLabMessages } from '../../i18n/aiChatPromptLabMessages';

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
  const messages = getAiChatPromptLabMessages(isZh);

  return (
    <div className="ai-chat-prompt-lab-panel-content">
      <div className="ai-chat-prompt-lab-section">
        <p className="ai-chat-fold-empty ai-chat-prompt-lab-panel-note">
          {messages.panelNote}
        </p>
      </div>

      <div className="ai-chat-prompt-lab-section">
        {promptTemplates.length === 0 ? (
          <p className="ai-chat-fold-empty ai-chat-prompt-lab-empty">{messages.emptyTemplates}</p>
        ) : (
          promptTemplates.map((item) => (
            <div key={item.id} className="ai-chat-prompt-lab-template-row">
              <span className="small-text ai-chat-prompt-lab-item-title ai-chat-prompt-lab-item-title-ellipsis" title={item.content}>{item.title}</span>
              <button type="button" className="icon-btn ai-chat-prompt-lab-mini-btn" onClick={() => onInjectTemplate(item.content)}>{messages.inject}</button>
              <button type="button" className="icon-btn ai-chat-prompt-lab-mini-btn" onClick={() => onEditTemplate(item)}>{messages.edit}</button>
              <button type="button" className="icon-btn ai-chat-prompt-lab-mini-btn ai-chat-prompt-lab-mini-btn-danger" onClick={() => onRemoveTemplate(item.id)}>{messages.deleteShort}</button>
            </div>
          ))
        )}
      </div>

      <div className="ai-chat-prompt-lab-section ai-chat-prompt-lab-section-separated">
        <input
          type="text"
          value={templateTitleInput}
          placeholder={messages.titlePlaceholder}
          onChange={(event) => onTemplateTitleInputChange(event.currentTarget.value)}
          className="ai-chat-input ai-chat-prompt-lab-input"
        />
        <textarea
          value={templateContentInput}
          placeholder={messages.contentPlaceholder}
          onChange={(event) => onTemplateContentInputChange(event.currentTarget.value)}
          className="ai-chat-prompt-lab-textarea"
        />
        <div className="ai-chat-prompt-lab-token-row">
          {['selected_text', 'current_utterance', 'lexicon_summary', 'project_stage', 'current_row'].map((token) => (
            <button key={token} type="button" className="icon-btn ai-chat-prompt-lab-token-btn" onClick={() => onAppendPromptVariable(token)}>{`{{${token}}}`}</button>
          ))}
        </div>
        <div className="ai-chat-prompt-lab-action-row">
          <button type="button" className="icon-btn ai-chat-prompt-lab-action-btn" disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0} onClick={onSaveTemplate}>{editingTemplateId ? messages.update : messages.save}</button>
          <button type="button" className="icon-btn ai-chat-prompt-lab-action-btn ai-chat-prompt-lab-action-btn-primary" disabled={templateContentInput.trim().length === 0} onClick={onInjectAndClose}>{messages.injectToInput}</button>
        </div>
      </div>
    </div>
  );
}
