import { useEffect, useRef } from 'react';
import { tf, t, useLocale } from '../i18n';

export function DesktopDeletionReminderDialog(props: {
  items: {
    target: 'manuscript' | 'media';
    id: string;
    title: Record<string, string> | null;
    relpath: string | null;
    retainUntil: string;
  }[];
  onShown: (item: { target: 'manuscript' | 'media'; id: string }) => void;
  onClose: () => void;
}) {
  const { items, onShown, onClose } = props;
  const locale = useLocale();
  const sent = useRef(new Set<string>());
  useEffect(() => {
    for (const item of items) {
      const key = `${item.target}:${item.id}`;
      if (sent.current.has(key)) continue;
      sent.current.add(key);
      onShown(item);
    }
  }, [items, onShown]);
  return (
    <div role="dialog" aria-labelledby="desktop-deletion-reminder-title">
      <h2 id="desktop-deletion-reminder-title">{t(locale, 'app.desktopRead.reminderTitle')}</h2>
      {items.length === 0 ? <p>{t(locale, 'app.desktopRead.reminderEmpty')}</p> : null}
      <ul>
        {items.map((item) => (
          <li key={`${item.target}:${item.id}`}>{reminderLine(locale, item)}</li>
        ))}
      </ul>
      <p>{t(locale, 'app.desktopRead.reminderBackups')}</p>
      <button type="button" onClick={onClose}>
        {t(locale, 'app.desktopRead.reminderClose')}
      </button>
    </div>
  );
}

function reminderLine(
  locale: Parameters<typeof t>[0],
  item: {
    target: 'manuscript' | 'media';
    title: Record<string, string> | null;
    relpath: string | null;
    retainUntil: string;
  },
): string {
  if (item.target === 'manuscript') {
    const title = item.title?.zh ?? item.title?.default ?? '';
    return tf(locale, 'app.desktopRead.reminderManuscript', { title, until: item.retainUntil });
  }
  if (item.target === 'media') {
    return tf(locale, 'app.desktopRead.reminderRecording', {
      path: item.relpath ?? '',
      until: item.retainUntil,
    });
  }
  const unreachable: never = item.target;
  return unreachable;
}
