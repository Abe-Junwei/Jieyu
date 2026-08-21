import { Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles/pages/ai-chat-window.css';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { TranscriptionPageChatWindowHeader } from './TranscriptionPage.ChatWindow.Header';
import { useTranscriptionChatWindowController } from './useTranscriptionChatWindowController';

const AssistantRuntime = lazy(async () =>
  import('./TranscriptionPage.AssistantRuntime').then((module) => ({
    default: module.TranscriptionPageAssistantRuntime,
  })),
);

export interface TranscriptionPageChatWindowProps {
  locale: string;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
}

export function TranscriptionPageChatWindow({
  locale,
  assistantRuntimeProps,
}: TranscriptionPageChatWindowProps) {
  const controller = useTranscriptionChatWindowController({ locale, assistantRuntimeProps });

  const content = (
    <div className="transcription-chat-window-host">
      <button
        ref={controller.triggerRef}
        type="button"
        className={`transcription-chat-window-trigger ${controller.open ? 'is-hidden' : ''}`}
        onClick={controller.handleOpenWindow}
        aria-label={controller.title}
        title={controller.title}
      >
        <span className="transcription-chat-window-trigger-dot" aria-hidden="true" />
        <span className="transcription-chat-window-trigger-label">{controller.title}</span>
        {controller.attentionCount > 0 ? (
          <span className="transcription-chat-window-trigger-badge">
            {controller.attentionCount}
          </span>
        ) : null}
      </button>
      {controller.open && (
        <section
          ref={(node) => {
            controller.windowRef.current = node;
          }}
          className={`transcription-chat-window ${controller.dragging ? 'is-dragging' : ''} ${controller.resizing ? 'is-resizing' : ''} ${controller.minimized ? 'is-minimized' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={controller.windowTitleId}
          aria-label={controller.title}
          style={{
            left: `${controller.position.x}px`,
            top: `${controller.position.y}px`,
            width: `${controller.size.width}px`,
            height: controller.minimized ? '44px' : `${controller.size.height}px`,
          }}
        >
          <TranscriptionPageChatWindowHeader
            uiLocale={controller.uiLocale}
            isZh={controller.isZh}
            title={controller.title}
            chatTitle={controller.chatTitle}
            windowTitleId={controller.windowTitleId}
            minimized={controller.minimized}
            conversationManagementEnabled={controller.conversationManagementEnabled}
            conversationManagement={controller.conversationManagement}
            conversationListOpen={controller.conversationListOpen}
            conversationListGroupLabel={controller.conversationListGroupLabel}
            archivedConversationListGroupLabel={controller.archivedConversationListGroupLabel}
            floatingTitleButtonRef={controller.floatingTitleButtonRef}
            providerKind={controller.providerKind}
            connectionStatus={controller.connectionStatus}
            pinnedCount={controller.pinnedCount}
            cardMessages={controller.cardMessages}
            toolFeedbackStyleResolved={controller.toolFeedbackStyleResolved}
            providerStatusTone={controller.providerStatusTone}
            providerStatusLabel={controller.providerStatusLabel}
            activeProviderDefinition={controller.activeProviderDefinition}
            providerGroups={controller.providerGroups}
            providerConfigOpen={controller.providerConfigOpen}
            aiChatState={controller.aiChatState}
            onToggleConversationList={controller.toggleConversationList}
            onToggleProviderConfig={controller.toggleProviderConfig}
            onCloseConversationList={() => controller.setConversationListOpen(false)}
            onSetMinimized={controller.setMinimized}
            onCloseWindow={() => controller.setOpen(false)}
            onHeaderPointerDown={controller.handleHeaderPointerDown}
            onHeaderPointerMove={controller.handleHeaderPointerMove}
            onHeaderPointerUp={controller.stopDragging}
            onHeaderPointerCancel={controller.stopDragging}
          />
          {!controller.minimized && (
            <div className="transcription-chat-window-body">
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <AssistantRuntime
                    {...assistantRuntimeProps}
                    cardChrome={{
                      showHeader: false,
                      showProviderConfigButton: false,
                      providerConfigOpen: controller.providerConfigOpen,
                      onProviderConfigOpenChange: controller.setProviderConfigOpen,
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {!controller.minimized && (
            <div
              className="transcription-chat-window-resizer"
              role="presentation"
              onPointerDown={controller.handleResizePointerDown}
              onPointerMove={controller.handleResizePointerMove}
              onPointerUp={controller.stopResizing}
              onPointerCancel={controller.stopResizing}
            />
          )}
        </section>
      )}
    </div>
  );

  if (!controller.isMounted) return null;
  return createPortal(content, document.body);
}
