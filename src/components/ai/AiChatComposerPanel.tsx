import type { ReactNode, RefObject } from 'react';
import { t } from '../../i18n';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_PANEL } from '../../utils/jieyuMaterialIcon';
import type { getAiChatCardMessages } from '../../i18n/messages';
import type { AiInteractionMetrics, AiSessionMemory, AiTaskSession } from '../../hooks/useAiChat';
import type { AiTaskTraceEntry } from '../../ai/chat/chatDomain.types';
import { formatTaskTraceOutcome } from './aiChatCardFollowUps';
import type { PromptTemplateItem } from './aiChatCardUtils';
import { AiChatMetricsBar } from './AiChatMetricsBar';
import { AiChatDirectiveConsole, type DirectiveRow, type DirectiveSourceFilter } from './AiChatDirectiveConsole';
import { AiChatPromptLabModal } from './AiChatPromptLabModal';

type VoiceEntry = {
  enabled: boolean;
  expanded: boolean;
  listening: boolean;
  statusText?: string;
  onTogglePanel: () => void;
};

export function AiChatComposerPanel({
  showAgentLoopProgress,
  cardMessages,
  aiTaskSession,
  recentTaskTrace,
  isZh,
  followUpSuggestions,
  submitFollowUpPrompt,
  aiInteractionMetrics,
  aiSessionMemory,
  quickPromptTemplates,
  injectPromptTemplate,
  chatInputRef,
  showInlineRecommendation,
  chatInput,
  composerPlaceholder,
  hybridInputSuggestion,
  inputPlaceholder,
  setChatInput,
  handleComposerKeyDown,
  aiIsStreaming,
  onStopAiMessage,
  onSendAiMessage,
  sharedDialogueComposerBlocked,
  submitChatInput,
  canUseVoiceEntry,
  voiceEntry,
  activeDirectiveRows,
  filteredDirectiveRows,
  directiveSourceFilter,
  directiveActionNotice,
  setDirectiveSourceFilter,
  setDirectiveActionNotice,
  onDeactivateAiSessionDirective,
  onPruneAiSessionDirectivesBySourceMessage,
  transientBlockedReason,
  inputBlockedReason,
  showPromptLab,
  setShowPromptLab,
  promptTemplates,
  editingTemplateId,
  templateTitleInput,
  templateContentInput,
  editPromptTemplate,
  removePromptTemplate,
  setTemplateTitleInput,
  setTemplateContentInput,
  appendPromptVariable,
  savePromptTemplate,
  isVoiceDrawerResizing,
  voiceDrawerInlineStyle,
  startVoiceDrawerResize,
  voiceDrawer,
  locale,
}: {
  showAgentLoopProgress: boolean;
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  aiTaskSession: AiTaskSession | null | undefined;
  recentTaskTrace: AiTaskTraceEntry[];
  isZh: boolean;
  followUpSuggestions: Array<{ id: string; label: string; prompt: string }>;
  submitFollowUpPrompt: (prompt: string) => void;
  aiInteractionMetrics: AiInteractionMetrics | null | undefined;
  aiSessionMemory: AiSessionMemory | null | undefined;
  quickPromptTemplates: Array<{ id: string; title: string; content: string }>;
  injectPromptTemplate: (content: string) => void;
  chatInputRef: RefObject<HTMLInputElement | null>;
  showInlineRecommendation: boolean;
  chatInput: string;
  composerPlaceholder: string;
  hybridInputSuggestion: string;
  inputPlaceholder: string;
  setChatInput: (next: string) => void;
  handleComposerKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  aiIsStreaming: boolean | undefined;
  onStopAiMessage: (() => void) | undefined;
  onSendAiMessage: ((text: string) => void | Promise<void>) | undefined;
  sharedDialogueComposerBlocked: boolean;
  submitChatInput: () => void;
  canUseVoiceEntry: boolean;
  voiceEntry: VoiceEntry | undefined;
  activeDirectiveRows: DirectiveRow[];
  filteredDirectiveRows: DirectiveRow[];
  directiveSourceFilter: DirectiveSourceFilter;
  directiveActionNotice: string | null;
  setDirectiveSourceFilter: (next: DirectiveSourceFilter) => void;
  setDirectiveActionNotice: (next: string | null) => void;
  onDeactivateAiSessionDirective: ((id: string) => void | Promise<void>) | undefined;
  onPruneAiSessionDirectivesBySourceMessage: ((id: string) => void | Promise<void>) | undefined;
  transientBlockedReason: string | null;
  inputBlockedReason: string | null;
  showPromptLab: boolean;
  setShowPromptLab: (next: boolean | ((prev: boolean) => boolean)) => void;
  promptTemplates: PromptTemplateItem[];
  editingTemplateId: string | null;
  templateTitleInput: string;
  templateContentInput: string;
  editPromptTemplate: (item: PromptTemplateItem) => void;
  removePromptTemplate: (id: string) => void;
  setTemplateTitleInput: (next: string) => void;
  setTemplateContentInput: (next: string) => void;
  appendPromptVariable: (name: string) => void;
  savePromptTemplate: () => void;
  isVoiceDrawerResizing: boolean;
  voiceDrawerInlineStyle: React.CSSProperties | undefined;
  startVoiceDrawerResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  voiceDrawer: ReactNode | undefined;
  locale: Parameters<typeof t>[0];
}) {
  const voiceDrawerStyleProps = voiceDrawerInlineStyle !== undefined ? { style: voiceDrawerInlineStyle } : {};

  return (
    <div className="ai-chat-composer">
      {showAgentLoopProgress && (
        <div className="ai-chat-agent-loop-progress" role="status" aria-live="polite">
          {cardMessages.agentLoopProgress(aiTaskSession?.step ?? 0, aiTaskSession?.maxSteps ?? 0)}
        </div>
      )}
      {recentTaskTrace.length > 0 && (
        <div className="ai-chat-task-trace" role="status" aria-live="polite">
          <div className="ai-chat-task-trace-title">{cardMessages.taskTraceTitle}</div>
          <div className="ai-chat-task-trace-list">
            {recentTaskTrace.map((entry) => (
              <div key={`${entry.requestId ?? entry.toolName ?? entry.phase}-${entry.stepNumber}`} className="ai-chat-task-trace-chip">
                <span className="ai-chat-task-trace-step">{cardMessages.taskTraceStepLabel(entry.stepNumber)}</span>
                <span className="ai-chat-task-trace-tool">{entry.toolName ?? entry.phase}</span>
                <span className="ai-chat-task-trace-status">{formatTaskTraceOutcome(entry, isZh)}</span>
                {typeof entry.durationMs === 'number' ? <span className="ai-chat-task-trace-duration">{`${entry.durationMs}ms`}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
      {followUpSuggestions.length > 0 && (
        <div className="ai-chat-follow-up-panel">
          <div className="ai-chat-follow-up-title">{cardMessages.followUpTitle}</div>
          <div className="ai-chat-composer-shortcuts-list">
            {followUpSuggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                className="icon-btn ai-chat-composer-shortcut ai-chat-follow-up-chip"
                onClick={() => submitFollowUpPrompt(item.prompt)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <AiChatMetricsBar
        isZh={isZh}
        aiInteractionMetrics={aiInteractionMetrics}
        aiSessionMemory={aiSessionMemory}
      />
      {quickPromptTemplates.length > 0 && (
        <div className="ai-chat-composer-shortcuts">
          <div className="ai-chat-composer-shortcuts-list">
            {quickPromptTemplates.map((item) => (
              <button
                key={item.id}
                type="button"
                className="icon-btn ai-chat-composer-shortcut"
                onClick={() => injectPromptTemplate(item.content)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="ai-chat-composer-row">
        <div className="ai-chat-composer-input-wrap">
          <input
            ref={chatInputRef}
            data-testid="ai-chat-composer-input"
            className={`ai-chat-input ai-chat-input-composer${showInlineRecommendation ? ' has-ghost-suggestion' : ''}`}
            type="text"
            value={chatInput}
            placeholder={composerPlaceholder}
            aria-label={showInlineRecommendation ? hybridInputSuggestion : inputPlaceholder}
            onChange={(e) => setChatInput(e.currentTarget.value)}
            onKeyDown={handleComposerKeyDown}
          />
          {showInlineRecommendation && (
            <div
              className="ai-chat-input-ghost-suggestion"
              aria-hidden="true"
            >
              <span className="ai-chat-input-ghost-prefix">{cardMessages.recommendationTitle}</span>
              <span className="ai-chat-input-ghost-text">{hybridInputSuggestion}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`icon-btn ai-chat-composer-send-btn${aiIsStreaming ? ' is-streaming' : ''}`}
          aria-label={aiIsStreaming ? cardMessages.stopGenerating : t(locale, 'ai.chat.send')}
          disabled={aiIsStreaming ? !onStopAiMessage : (!onSendAiMessage || sharedDialogueComposerBlocked)}
          onClick={() => {
            if (aiIsStreaming) {
              onStopAiMessage?.();
              return;
            }
            submitChatInput();
          }}
        >
          {aiIsStreaming ? cardMessages.stop : <MaterialSymbol name="arrow_upward" className={JIEYU_MATERIAL_PANEL} />}
        </button>
        {canUseVoiceEntry && voiceEntry && (
          <button
            type="button"
            className={`icon-btn ai-chat-composer-voice-entry-btn${voiceEntry.expanded ? ' is-active' : ''}${voiceEntry.listening ? ' is-listening' : ''}`}
            aria-label={voiceEntry.statusText ?? cardMessages.voiceInput}
            title={voiceEntry.statusText ?? cardMessages.voiceInput}
            onClick={voiceEntry.onTogglePanel}
          >
            <MaterialSymbol
              name={voiceEntry.listening ? 'mic' : 'mic_none'}
              className={JIEYU_MATERIAL_PANEL}
            />
          </button>
        )}
      </div>
      <AiChatDirectiveConsole
        isZh={isZh}
        activeDirectiveRows={activeDirectiveRows}
        filteredDirectiveRows={filteredDirectiveRows}
        directiveSourceFilter={directiveSourceFilter}
        directiveActionNotice={directiveActionNotice}
        onDirectiveSourceFilterChange={setDirectiveSourceFilter}
        onDirectiveActionNoticeChange={setDirectiveActionNotice}
        {...(onDeactivateAiSessionDirective !== undefined ? { onDeactivateAiSessionDirective } : {})}
        {...(onPruneAiSessionDirectivesBySourceMessage !== undefined ? { onPruneAiSessionDirectivesBySourceMessage } : {})}
      />
      {(transientBlockedReason || inputBlockedReason) && (
        <p className="small-text ai-chat-composer-warning">{transientBlockedReason ?? inputBlockedReason}</p>
      )}

      <div className={`ai-chat-prompt-lab-panel ${showPromptLab ? 'is-open' : 'is-closed'}${promptTemplates.length === 0 ? ' is-empty' : ''}`}>
        <button
          type="button"
          className="ai-chat-prompt-lab-panel-head"
          onClick={() => setShowPromptLab((prev) => !prev)}
          aria-expanded={showPromptLab}
        >
          <span className="ai-chat-prompt-lab-panel-title">
            {cardMessages.promptLab}
            <span className="ai-chat-decision-panel-bracket"> · </span>
            <span className="ai-chat-decision-panel-count">{promptTemplates.length}{cardMessages.promptTemplateCountSuffix}</span>
          </span>
          <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
        </button>
        <div className="ai-chat-prompt-lab-panel-body" aria-hidden={!showPromptLab}>
          <AiChatPromptLabModal
            isZh={isZh}
            showPromptLab={showPromptLab}
            promptTemplates={promptTemplates}
            editingTemplateId={editingTemplateId}
            templateTitleInput={templateTitleInput}
            templateContentInput={templateContentInput}
            onInjectTemplate={injectPromptTemplate}
            onEditTemplate={editPromptTemplate}
            onRemoveTemplate={removePromptTemplate}
            onTemplateTitleInputChange={setTemplateTitleInput}
            onTemplateContentInputChange={setTemplateContentInput}
            onAppendPromptVariable={appendPromptVariable}
            onSaveTemplate={savePromptTemplate}
            onInjectAndClose={() => {
              injectPromptTemplate(templateContentInput);
            }}
          />
        </div>
      </div>
      {canUseVoiceEntry && voiceEntry && (
        <div
          className={`ai-chat-voice-drawer ${voiceEntry.expanded ? 'is-open' : 'is-closed'}${isVoiceDrawerResizing ? ' is-resizing' : ''}`}
          {...voiceDrawerStyleProps}
        >
          <div className="ai-chat-voice-drawer-shell">
            <div className="ai-chat-voice-drawer-body" aria-hidden={!voiceEntry.expanded}>
              {voiceEntry.expanded && (
                <div
                  className="ai-chat-voice-drawer-resizer"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={cardMessages.dragResizeVoicePanelHeight}
                  onPointerDown={startVoiceDrawerResize}
                />
              )}
              {voiceDrawer ?? <p className="ai-chat-fold-empty">{cardMessages.voicePanelUnavailable}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
