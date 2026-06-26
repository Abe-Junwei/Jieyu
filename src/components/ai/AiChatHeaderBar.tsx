import { useCallback, useRef } from 'react';
import { t, type Locale } from '../../i18n';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';
import type { AiChatSettings, AiToolFeedbackStyle } from '../../ai/providers/providerCatalog';
import type { AiConversationManagementApi } from '../../hooks/ai/aiConversationManager.types';
import { AiConversationListPopover } from './AiConversationListPopover';

type ProviderGroup = {
  label: string;
  items: Array<{ kind: AiChatSettings['providerKind']; label: string }>;
};

export function AiChatHeaderBar({
  locale,
  chatTitle,
  toolFeedbackStyleResolved,
  cardMessages,
  onUpdateAiChatSettings,
  providerStatusTone,
  providerStatusLabel,
  activeProviderLabel,
  aiChatSettings,
  providerGroups,
  showProviderConfigButton,
  showProviderConfig,
  onToggleProviderConfig,
  aiConversationManagement,
  conversationListOpen = false,
  onConversationListOpenChange,
  onStartNewConversation,
  onSwitchConversation,
  conversationListGroupLabel,
  archivedConversationListGroupLabel,
}: {
  locale: Locale;
  chatTitle: string;
  toolFeedbackStyleResolved: AiToolFeedbackStyle;
  cardMessages: {
    toolFeedbackStyle: string;
    detailed: string;
    concise: string;
    hideProviderConfig: string;
    openProviderConfig: string;
  };
  onUpdateAiChatSettings: ((patch: Partial<AiChatSettings>) => void) | undefined;
  providerStatusTone: 'error' | 'ok' | 'local' | 'idle';
  providerStatusLabel: string;
  activeProviderLabel: string;
  aiChatSettings: AiChatSettings | null | undefined;
  providerGroups: ProviderGroup[];
  showProviderConfigButton: boolean;
  showProviderConfig: boolean;
  onToggleProviderConfig: () => void;
  aiConversationManagement?: AiConversationManagementApi | null;
  conversationListOpen?: boolean;
  onConversationListOpenChange?: (open: boolean) => void;
  onStartNewConversation?: () => void | Promise<void>;
  onSwitchConversation?: (conversationId: string) => void | Promise<void>;
  conversationListGroupLabel?: string;
  archivedConversationListGroupLabel?: string;
}) {
  const titleButtonRef = useRef<HTMLButtonElement | null>(null);
  const conversationEnabled = aiConversationManagement?.enabled === true;

  const toggleConversationList = useCallback(() => {
    if (!onConversationListOpenChange) return;
    const next = !conversationListOpen;
    onConversationListOpenChange(next);
    if (next) {
      void aiConversationManagement?.refreshConversations();
    }
  }, [aiConversationManagement, conversationListOpen, onConversationListOpenChange]);

  const closeConversationList = useCallback(() => {
    onConversationListOpenChange?.(false);
  }, [onConversationListOpenChange]);

  const headerInner = (
    <div className="ai-chat-header">
      <div className="ai-chat-header-left">
        <div className="ai-chat-header-info">
          <div className="ai-chat-header-title-row">
            {conversationEnabled ? (
              <div className="ai-chat-conversation-chrome">
                <button
                  type="button"
                  className="icon-btn ai-chat-conversation-list-btn"
                  onClick={toggleConversationList}
                  aria-expanded={conversationListOpen}
                  aria-haspopup="dialog"
                  aria-label={t(locale, 'ai.chat.conversationList.openList')}
                >
                  <MaterialSymbol name="format_list_bulleted" className={JIEYU_MATERIAL_INLINE} />
                </button>
                <button
                  ref={titleButtonRef}
                  type="button"
                  className="ai-chat-conversation-title-btn"
                  onClick={toggleConversationList}
                  aria-expanded={conversationListOpen}
                  aria-haspopup="dialog"
                  aria-label={t(locale, 'ai.chat.conversationList.titleButton')}
                  title={chatTitle}
                >
                  <span className="ai-chat-conversation-title-text">{chatTitle}</span>
                  <MaterialSymbol
                    name="expand_more"
                    className={JIEYU_MATERIAL_INLINE}
                    aria-hidden
                  />
                </button>
              </div>
            ) : (
              <span className="ai-chat-header-title">{chatTitle}</span>
            )}
          </div>
        </div>
        <div className="ai-chat-header-tools">
          <div
            className="transcription-ai-mode-switch"
            role="group"
            aria-label={cardMessages.toolFeedbackStyle}
          >
            <button
              type="button"
              className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'detailed' ? 'is-active' : ''}`}
              aria-pressed={toolFeedbackStyleResolved === 'detailed'}
              onClick={() => {
                if (toolFeedbackStyleResolved === 'detailed') return;
                onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' });
              }}
            >
              {cardMessages.detailed}
            </button>
            <button
              type="button"
              className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'concise' ? 'is-active' : ''}`}
              aria-pressed={toolFeedbackStyleResolved === 'concise'}
              onClick={() => {
                if (toolFeedbackStyleResolved === 'concise') return;
                onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' });
              }}
            >
              {cardMessages.concise}
            </button>
          </div>
          <span
            className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone} ai-chat-provider-status-dot-inline`}
            role="status"
            aria-label={providerStatusLabel}
            title={`${activeProviderLabel} · ${providerStatusLabel}`}
          />
          <select
            className="ai-chat-provider-select"
            aria-label={t(locale, 'ai.chat.provider')}
            value={aiChatSettings?.providerKind ?? 'mock'}
            onChange={(e) =>
              onUpdateAiChatSettings?.({
                providerKind: e.currentTarget.value as AiChatSettings['providerKind'],
              })
            }
          >
            {providerGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((provider) => (
                  <option key={provider.kind} value={provider.kind}>
                    {provider.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {showProviderConfigButton && (
            <button
              type="button"
              className="icon-btn ai-chat-header-config-btn"
              aria-label={
                showProviderConfig
                  ? cardMessages.hideProviderConfig
                  : cardMessages.openProviderConfig
              }
              title={
                showProviderConfig
                  ? cardMessages.hideProviderConfig
                  : cardMessages.openProviderConfig
              }
              onClick={onToggleProviderConfig}
            >
              <MaterialSymbol name="settings" className={JIEYU_MATERIAL_INLINE} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (!conversationEnabled || !aiConversationManagement) {
    return headerInner;
  }

  return (
    <div className="ai-chat-header-anchor">
      {headerInner}
      {conversationListOpen &&
      onStartNewConversation &&
      onSwitchConversation &&
      conversationListGroupLabel &&
      archivedConversationListGroupLabel ? (
        <AiConversationListPopover
          locale={locale}
          management={aiConversationManagement}
          groupLabel={conversationListGroupLabel}
          archivedGroupLabel={archivedConversationListGroupLabel}
          onStartNewConversation={async () => {
            await onStartNewConversation();
            closeConversationList();
          }}
          onSelectConversation={onSwitchConversation}
          onClose={closeConversationList}
          titleButtonRef={titleButtonRef}
        />
      ) : null}
    </div>
  );
}
