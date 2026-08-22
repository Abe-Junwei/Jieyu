import type { RefObject } from 'react';
import { t, type Locale } from '../i18n';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { AiConversationManagementApi } from '../hooks/ai/aiConversationManager.types';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../utils/jieyuMaterialIcon';
import { AiConversationListPopover } from '../components/ai/AiConversationListPopover';
import type { getAiChatCardMessages } from '../i18n/messages';

type CardMessages = ReturnType<typeof getAiChatCardMessages>;

export interface TranscriptionPageChatWindowHeaderProps {
  uiLocale: Locale;
  isZh: boolean;
  title: string;
  chatTitle: string;
  windowTitleId: string;
  minimized: boolean;
  maximized: boolean;
  conversationManagementEnabled: boolean;
  conversationManagement: AiConversationManagementApi | null;
  conversationListOpen: boolean;
  conversationListGroupLabel: string;
  archivedConversationListGroupLabel: string;
  floatingTitleButtonRef: RefObject<HTMLButtonElement | null>;
  cardMessages: CardMessages;
  providerStatusTone: string;
  providerStatusLabel: string;
  activeProviderDefinition: { label: string };
  providerConfigOpen: boolean;
  aiChatState: AiChatContextValue;
  onToggleConversationList: () => void;
  onToggleProviderConfig: () => void;
  onCloseConversationList: () => void;
  onSetMinimized: (updater: (prev: boolean) => boolean) => void;
  onToggleMaximized: () => void;
  onCloseWindow: () => void;
  onHeaderPointerDown: React.PointerEventHandler<HTMLElement>;
  onHeaderPointerMove: React.PointerEventHandler<HTMLElement>;
  onHeaderPointerUp: React.PointerEventHandler<HTMLElement>;
  onHeaderPointerCancel: React.PointerEventHandler<HTMLElement>;
}

export function TranscriptionPageChatWindowHeader({
  uiLocale,
  isZh,
  title,
  chatTitle,
  windowTitleId,
  minimized,
  maximized,
  conversationManagementEnabled,
  conversationManagement,
  conversationListOpen,
  conversationListGroupLabel,
  archivedConversationListGroupLabel,
  floatingTitleButtonRef,
  cardMessages,
  providerStatusTone,
  providerStatusLabel,
  activeProviderDefinition,
  providerConfigOpen,
  aiChatState,
  onToggleConversationList,
  onToggleProviderConfig,
  onCloseConversationList,
  onSetMinimized,
  onToggleMaximized,
  onCloseWindow,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
  onHeaderPointerCancel,
}: TranscriptionPageChatWindowHeaderProps) {
  const maximizeLabel = t(
    uiLocale,
    maximized ? 'ai.chat.window.restoreSize' : 'ai.chat.window.maximize',
  );

  return (
    <header
      className="transcription-chat-window-header"
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={onHeaderPointerUp}
      onPointerCancel={onHeaderPointerCancel}
    >
      <div className="transcription-chat-window-header-meta">
        {conversationManagementEnabled && conversationManagement ? (
          <div className="ai-chat-header-anchor transcription-chat-window-conversation-anchor">
            <div className="ai-chat-conversation-chrome is-floating">
              <button
                type="button"
                className="icon-btn ai-chat-conversation-list-btn"
                onClick={onToggleConversationList}
                aria-expanded={conversationListOpen}
                aria-haspopup="dialog"
                aria-label={t(uiLocale, 'ai.chat.conversationList.openList')}
              >
                <MaterialSymbol name="format_list_bulleted" className={JIEYU_MATERIAL_INLINE} />
              </button>
              <button
                ref={floatingTitleButtonRef}
                type="button"
                className="ai-chat-conversation-title-btn is-floating"
                onClick={onToggleConversationList}
                aria-expanded={conversationListOpen}
                aria-haspopup="dialog"
                aria-label={t(uiLocale, 'ai.chat.conversationList.titleButton')}
                title={chatTitle}
              >
                <span id={windowTitleId} className="ai-chat-conversation-title-text">
                  {chatTitle}
                </span>
                <MaterialSymbol name="expand_more" className={JIEYU_MATERIAL_INLINE} aria-hidden />
              </button>
            </div>
            {conversationListOpen ? (
              <AiConversationListPopover
                locale={uiLocale}
                management={conversationManagement}
                groupLabel={conversationListGroupLabel}
                archivedGroupLabel={archivedConversationListGroupLabel}
                onStartNewConversation={async () => {
                  await aiChatState.onStartNewConversation?.();
                  onCloseConversationList();
                }}
                onSelectConversation={async (conversationId) => {
                  await aiChatState.onSwitchConversation?.(conversationId);
                  onCloseConversationList();
                }}
                onClose={onCloseConversationList}
                titleButtonRef={floatingTitleButtonRef}
              />
            ) : null}
          </div>
        ) : (
          <div id={windowTitleId} className="transcription-chat-window-title">
            {title}
          </div>
        )}
        <span
          className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone} ai-chat-provider-status-dot-inline`}
          role="status"
          aria-label={providerStatusLabel}
          title={`${activeProviderDefinition.label} · ${providerStatusLabel}`}
        />
      </div>
      <div
        className="transcription-chat-window-header-controls"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="transcription-chat-window-actions">
          <button
            type="button"
            className="transcription-chat-window-head-btn transcription-chat-window-config-btn"
            onClick={onToggleProviderConfig}
            aria-label={
              providerConfigOpen ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig
            }
            title={
              providerConfigOpen ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig
            }
          >
            <MaterialSymbol name="settings" className={JIEYU_MATERIAL_INLINE} />
          </button>
          {!conversationManagementEnabled ? (
            <button
              type="button"
              className="transcription-chat-window-head-btn"
              onClick={() => aiChatState.onClearAiMessages?.()}
              aria-label={t(uiLocale, 'ai.chat.clear')}
              title={t(uiLocale, 'ai.chat.clear')}
            >
              {t(uiLocale, 'ai.chat.clear')}
            </button>
          ) : null}
          <button
            type="button"
            className="transcription-chat-window-head-btn"
            onClick={() => onSetMinimized((prev) => !prev)}
            aria-label={
              minimized
                ? isZh
                  ? '\u5c55\u5f00\u7a97\u53e3'
                  : 'Expand'
                : isZh
                  ? '\u6536\u8d77\u7a97\u53e3'
                  : 'Minimize'
            }
            title={
              minimized
                ? isZh
                  ? '\u5c55\u5f00\u7a97\u53e3'
                  : 'Expand'
                : isZh
                  ? '\u6536\u8d77\u7a97\u53e3'
                  : 'Minimize'
            }
          >
            {minimized ? '▢' : '—'}
          </button>
          {!minimized ? (
            <button
              type="button"
              className="transcription-chat-window-head-btn transcription-chat-window-maximize-btn"
              data-testid="transcription-chat-window-maximize"
              onClick={onToggleMaximized}
              aria-label={maximizeLabel}
              title={maximizeLabel}
              aria-pressed={maximized}
            >
              <MaterialSymbol
                name={maximized ? 'close_fullscreen' : 'open_in_full'}
                className={JIEYU_MATERIAL_INLINE}
              />
            </button>
          ) : null}
          <button
            type="button"
            className="transcription-chat-window-close"
            onClick={onCloseWindow}
            aria-label={isZh ? '\u5173\u95ed\u804a\u5929\u7a97\u53e3' : 'Close chat window'}
            title={isZh ? '\u5173\u95ed\u804a\u5929\u7a97\u53e3' : 'Close chat window'}
          >
            ×
          </button>
        </div>
      </div>
    </header>
  );
}
