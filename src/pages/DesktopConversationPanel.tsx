import { useRef } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { useDesktopConversations } from './useDesktopConversations';

export function DesktopConversationPanel(props: { host: DesktopReadHost; sessionId: string }) {
  const locale = useLocale();
  const conversations = useDesktopConversations(props.host, props.sessionId);
  const titleRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const selected = conversations.items.find((item) => item.id === conversations.selectedId) ?? null;

  return (
    <div className="desktop-project-read-units">
      {conversations.error.length > 0 ? <p role="alert">{conversations.error}</p> : null}
      {conversations.items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === conversations.selectedId}
          onClick={() => conversations.select(item.id)}
        >
          {item.title}
        </button>
      ))}
      <input ref={titleRef} aria-label={t(locale, 'app.desktopRead.conversationTitle')} />
      <button
        type="button"
        onClick={() => {
          conversations.create(titleRef.current?.value ?? '');
        }}
      >
        {t(locale, 'app.desktopRead.createConversation')}
      </button>
      {selected === null ? null : (
        <>
          {conversations.messages.map((message) => (
            <p key={message.id}>{message.body}</p>
          ))}
          <input ref={messageRef} aria-label={t(locale, 'app.desktopRead.conversationMessage')} />
          <button
            type="button"
            onClick={() => {
              conversations.append(messageRef.current?.value ?? '');
            }}
          >
            {t(locale, 'app.desktopRead.addMessage')}
          </button>
          <input ref={renameRef} aria-label={t(locale, 'app.desktopRead.conversationRename')} />
          <button
            type="button"
            onClick={() => {
              conversations.rename(renameRef.current?.value ?? '');
            }}
          >
            {t(locale, 'app.desktopRead.renameConversation')}
          </button>
        </>
      )}
    </div>
  );
}
