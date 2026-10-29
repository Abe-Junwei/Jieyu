import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

interface DesktopConversation {
  id: string;
  title: string;
  revisions: { title: number };
}

interface DesktopMessage {
  id: string;
  body: string;
}

export function useDesktopConversations(host: DesktopReadHost, sessionId: string) {
  const locale = useLocale();
  const [items, setItems] = useState<DesktopConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DesktopMessage[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const listRequest = useRef(0);
  const messageRequest = useRef(0);

  useEffect(() => {
    const id = ++listRequest.current;
    let cancelled = false;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .listConversations(sessionId)
      .then((listed) => {
        if (cancelled || id !== listRequest.current) return;
        setItems(
          listed.map((item) => ({ id: item.id, title: item.title, revisions: item.revisions })),
        );
      })
      .catch(() => {
        if (!cancelled && id === listRequest.current) {
          setError(t(locale, 'app.desktopRead.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, revision, sessionId]);

  useEffect(() => {
    if (selectedId === null) {
      setMessages([]);
      return;
    }
    const id = ++messageRequest.current;
    let cancelled = false;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .listMessages(sessionId, selectedId)
      .then((listed) => {
        if (cancelled || id !== messageRequest.current) return;
        setMessages(listed.map((item) => ({ id: item.id, body: item.body })));
      })
      .catch(() => {
        if (!cancelled && id === messageRequest.current) {
          setError(t(locale, 'app.desktopRead.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, revision, selectedId, sessionId]);

  const create = (title: string) => {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError(t(locale, 'app.desktopRead.conversationTitleRequired'));
      return;
    }
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .createConversation(sessionId, trimmed)
      .then((created) => {
        setSelectedId(created.id);
        setRevision((value) => value + 1);
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.conversationFailed'));
      });
  };

  const append = (body: string) => {
    const selected = items.find((item) => item.id === selectedId);
    const trimmed = body.trim();
    if (selected === undefined || trimmed.length === 0) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .appendMessage(sessionId, { conversationId: selected.id, role: 'user', body: trimmed })
      .then(() => {
        setRevision((value) => value + 1);
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.conversationFailed'));
        setRevision((value) => value + 1);
      });
  };

  const rename = (title: string) => {
    const selected = items.find((item) => item.id === selectedId);
    const trimmed = title.trim();
    if (selected === undefined || trimmed.length === 0 || trimmed === selected.title) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .patchConversation(sessionId, {
        operationId: crypto.randomUUID(),
        id: selected.id,
        title: { expectedRevision: selected.revisions.title, value: trimmed },
      })
      .then(() => {
        setRevision((value) => value + 1);
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.conversationFailed'));
        setRevision((value) => value + 1);
      });
  };

  return {
    items,
    selectedId,
    messages,
    error,
    select: setSelectedId,
    create,
    append,
    rename,
  };
}
