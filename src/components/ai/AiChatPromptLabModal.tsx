import { useMemo } from 'react';
import type { PromptTemplateItem } from './aiChatCardUtils';
import { getAiChatPromptLabMessages } from '../../i18n/aiChatPromptLabMessages';
import { useLocale } from '../../i18n';
import { computeAdaptivePanelWidth } from '../../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../../hooks/useViewportWidth';

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
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const compactWidth = useMemo(() => computeAdaptivePanelWidth({
    baseWidth: 320,
    locale,
    direction: uiTextDirection,
    uiFontScale,
    density: 'compact',
    minWidth: 280,
    maxWidth: 540,
    ...(viewportWidth !== undefined ? { viewportWidth } : {}),
  }), [locale, uiTextDirection, uiFontScale, viewportWidth]);
  const wideWidth = useMemo(() => computeAdaptivePanelWidth({
    baseWidth: 720,
    locale,
    direction: uiTextDirection,
    uiFontScale,
    density: 'wide',
    minWidth: 520,
    maxWidth: 940,
    ...(viewportWidth !== undefined ? { viewportWidth } : {}),
  }), [locale, uiTextDirection, uiFontScale, viewportWidth]);
  if (!showPromptLab) return null;
  const messages = getAiChatPromptLabMessages(isZh);
  const hasDraft = templateTitleInput.trim().length > 0 || templateContentInput.trim().length > 0;
  const draftStatusLabel = editingTemplateId
    ? messages.editingTemplate
    : (hasDraft ? messages.draftReady : messages.draftEmpty);

  return (
    <div
      className="ai-chat-prompt-lab-panel-content"
      dir={uiTextDirection}
      style={{
        minWidth: `min(100%, ${compactWidth}px)`,
        maxWidth: `min(100%, ${wideWidth}px)`,
      }}
    >
      <section className="panel-organization-surface panel-organization-surface-emphasis ai-chat-prompt-lab-summary">
        <div className="panel-organization-surface-head">
          <div>
            <div className="panel-organization-surface-title">{messages.overviewTitle}</div>
            <p className="panel-organization-surface-copy ai-chat-prompt-lab-panel-note">{messages.panelNote}</p>
          </div>
          <div className="dialog-stat-row">
            <span className="dialog-stat-chip">{messages.templateCount(promptTemplates.length)}</span>
            <span className={`dialog-stat-chip${hasDraft ? ' dialog-stat-chip-warning' : ''}`}>{draftStatusLabel}</span>
          </div>
        </div>
      </section>

      <section className="panel-organization-surface ai-chat-prompt-lab-section ai-chat-prompt-lab-library-surface">
        <div className="panel-organization-surface-head">
          <div>
            <div className="panel-organization-surface-title">{messages.libraryTitle}</div>
            <p className="dialog-supporting-note">{messages.templateCount(promptTemplates.length)}</p>
          </div>
        </div>
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
      </section>

      <section className="panel-organization-surface ai-chat-prompt-lab-section ai-chat-prompt-lab-editor-surface ai-chat-prompt-lab-section-separated">
        <div className="panel-organization-surface-head">
          <div>
            <div className="panel-organization-surface-title">{messages.editorTitle}</div>
            <p className="dialog-supporting-note">{messages.editorHint}</p>
          </div>
        </div>
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
      </section>
    </div>
  );
}
