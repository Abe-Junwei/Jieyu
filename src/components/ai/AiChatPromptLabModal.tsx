import { useId, useMemo } from 'react';
import type { PromptTemplateItem } from './aiChatCardUtils';
import { getAiChatPromptLabMessages } from '../../i18n/messages';
import { useLocale } from '../../i18n';
import { computeAdaptivePanelWidth } from '../../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { PanelButton, PanelChip } from '../ui';
import { PanelSection } from '../ui/PanelSection';
import { PanelSummary } from '../ui/PanelSummary';
import { EmbeddedPanelShell } from '../ui/EmbeddedPanelShell';

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
    density: 'standard',
    minWidth: 520,
    maxWidth: 860,
    ...(viewportWidth !== undefined ? { viewportWidth } : {}),
  }), [locale, uiTextDirection, uiFontScale, viewportWidth]);
  const fieldIdPrefix = useId();
  if (!showPromptLab) return null;
  const messages = getAiChatPromptLabMessages(isZh);
  const hasDraft = templateTitleInput.trim().length > 0 || templateContentInput.trim().length > 0;
  const draftStatusLabel = editingTemplateId
    ? messages.editingTemplate
    : (hasDraft ? messages.draftReady : messages.draftEmpty);

  return (
    <EmbeddedPanelShell
      className="ai-chat-prompt-lab ai-chat-prompt-lab-panel-content panel-design-match-content"
      bodyClassName="ai-chat-prompt-lab-body"
      footerClassName="ai-chat-prompt-lab-footer"
      dir={uiTextDirection}
      layoutStyle={{
        minWidth: `min(100%, ${compactWidth}px)`,
        maxWidth: `min(100%, ${wideWidth}px)`,
      }}
      title={messages.overviewTitle}
      actions={<PanelChip>{messages.templateCount(promptTemplates.length)}</PanelChip>}
      footer={(
        <div className="ai-chat-prompt-lab-action-row ai-chat-prompt-lab-action-row-footer">
          <PanelButton className="ai-chat-prompt-lab-action-btn" disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0} onClick={onSaveTemplate}>{editingTemplateId ? messages.update : messages.save}</PanelButton>
          <PanelButton variant="primary" className="ai-chat-prompt-lab-action-btn ai-chat-prompt-lab-action-btn-primary" disabled={templateContentInput.trim().length === 0} onClick={onInjectAndClose}>{messages.injectToInput}</PanelButton>
        </div>
      )}
    >
      <PanelSummary
        className="ai-chat-prompt-lab-summary"
        description={messages.panelNote}
        meta={(
          <div className="panel-meta">
            <PanelChip variant={hasDraft ? 'warning' : 'default'}>{draftStatusLabel}</PanelChip>
          </div>
        )}
      />

      <PanelSection className="ai-chat-prompt-lab-section ai-chat-prompt-lab-library-surface" title={messages.libraryTitle}>
        {promptTemplates.length === 0 ? (
          <p className="ai-chat-fold-empty ai-chat-prompt-lab-empty">{messages.emptyTemplates}</p>
        ) : (
          promptTemplates.map((item) => (
            <div key={item.id} className="ai-chat-prompt-lab-template-row">
              <span className="small-text ai-chat-prompt-lab-item-title ai-chat-prompt-lab-item-title-ellipsis" title={item.content}>{item.title}</span>
              <PanelButton className="ai-chat-prompt-lab-mini-btn" onClick={() => onInjectTemplate(item.content)}>{messages.inject}</PanelButton>
              <PanelButton className="ai-chat-prompt-lab-mini-btn" onClick={() => onEditTemplate(item)}>{messages.edit}</PanelButton>
              <PanelButton variant="danger" className="ai-chat-prompt-lab-mini-btn ai-chat-prompt-lab-mini-btn-danger" onClick={() => onRemoveTemplate(item.id)}>{messages.deleteShort}</PanelButton>
            </div>
          ))
        )}
      </PanelSection>

      <PanelSection
        className="ai-chat-prompt-lab-section ai-chat-prompt-lab-editor-surface ai-chat-prompt-lab-section-separated"
        title={messages.editorTitle}
        description={messages.editorHint}
      >
        <label htmlFor={`${fieldIdPrefix}-title`} className="layer-action-dialog-field-label">{messages.titlePlaceholder}</label>
        <input
          id={`${fieldIdPrefix}-title`}
          type="text"
          value={templateTitleInput}
          placeholder={messages.titlePlaceholder}
          onChange={(event) => onTemplateTitleInputChange(event.currentTarget.value)}
          className="ai-chat-input panel-input ai-chat-prompt-lab-input"
        />
        <label htmlFor={`${fieldIdPrefix}-content`} className="layer-action-dialog-field-label">{messages.contentPlaceholder}</label>
        <textarea
          id={`${fieldIdPrefix}-content`}
          value={templateContentInput}
          placeholder={messages.contentPlaceholder}
          onChange={(event) => onTemplateContentInputChange(event.currentTarget.value)}
          className="panel-input ai-chat-prompt-lab-textarea"
        />
        <div className="ai-chat-prompt-lab-token-row">
          {['selected_text', 'current_unit', 'current_unit', 'lexicon_summary', 'project_stage', 'current_row'].map((token) => (
            <PanelButton key={token} className="ai-chat-prompt-lab-token-btn" onClick={() => onAppendPromptVariable(token)}>{`{{${token}}}`}</PanelButton>
          ))}
        </div>
      </PanelSection>
    </EmbeddedPanelShell>
  );
}
