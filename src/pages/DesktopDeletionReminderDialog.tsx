import { useEffect, useRef, useState } from 'react';
import { tf, t, useLocale } from '../i18n';
import { readLocalizedMultiLangLabel } from '../utils/multiLangLabels';

type CleanupResult = { state: 'intent' | 'confirmed' | 'failed' | 'unknown' };

export function DesktopDeletionReminderDialog(props: {
  items: {
    target: 'manuscript' | 'media';
    id: string;
    title: Record<string, string> | null;
    relpath: string | null;
    retainUntil: string;
    removable: boolean;
  }[];
  onShown: (item: { target: 'manuscript' | 'media'; id: string }) => void;
  onPurge: (id: string) => Promise<void>;
  onRemoveFile: (id: string, operationId: string) => Promise<CleanupResult>;
  onClose: () => void;
}) {
  const { items, onShown, onPurge, onRemoveFile, onClose } = props;
  const locale = useLocale();
  const sent = useRef(new Set<string>());
  const purgingRef = useRef(false);
  const removingRef = useRef(false);
  const operationIds = useRef(new Map<string, string>());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [unknownIds, setUnknownIds] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<'purge' | 'remove' | 'unknown' | null>(null);
  useEffect(() => {
    for (const item of items) {
      const key = `${item.target}:${item.id}`;
      if (sent.current.has(key)) continue;
      sent.current.add(key);
      onShown(item);
    }
  }, [items, onShown]);

  const confirmPurge = () => {
    if (pendingId === null || purgingRef.current) return;
    const id = pendingId;
    purgingRef.current = true;
    setPurging(true);
    setFailed(null);
    void onPurge(id)
      .then(() => {
        setPendingId(null);
      })
      .catch(() => {
        setFailed('purge');
        setPendingId(null);
      })
      .finally(() => {
        purgingRef.current = false;
        setPurging(false);
      });
  };

  const removeFile = (id: string) => {
    if (removingRef.current || unknownIds.has(id)) return;
    let operationId = operationIds.current.get(id);
    if (operationId === undefined) {
      operationId = crypto.randomUUID();
      operationIds.current.set(id, operationId);
    }
    removingRef.current = true;
    setRemoving(true);
    setFailed(null);
    void onRemoveFile(id, operationId)
      .then((result) => {
        const outcome = removalFailure(result.state);
        if (outcome === 'unknown') {
          setFailed('unknown');
          setUnknownIds((current) => new Set(current).add(id));
          return;
        }
        if (outcome === 'remove') setFailed('remove');
      })
      .catch(() => setFailed('remove'))
      .finally(() => {
        removingRef.current = false;
        setRemoving(false);
      });
  };

  const pendingItem = items.find((item) => item.target === 'manuscript' && item.id === pendingId);

  return (
    <div role="dialog" aria-labelledby="desktop-deletion-reminder-title">
      <h2 id="desktop-deletion-reminder-title">{t(locale, 'app.desktopRead.reminderTitle')}</h2>
      {items.length === 0 ? <p>{t(locale, 'app.desktopRead.reminderEmpty')}</p> : null}
      {failed === 'purge' ? <p role="alert">{t(locale, 'app.desktopRead.purgeFailed')}</p> : null}
      {failed === 'remove' ? <p role="alert">{t(locale, 'app.desktopRead.removeFailed')}</p> : null}
      {failed === 'unknown' ? (
        <p role="alert">{t(locale, 'app.desktopRead.removeUnknown')}</p>
      ) : null}
      <ul>
        {items.map((item) => (
          <li key={`${item.target}:${item.id}`}>
            {reminderLine(locale, item)}
            {item.target === 'manuscript' ? (
              <button
                type="button"
                disabled={pendingId !== null || purging}
                onClick={() => {
                  setFailed(null);
                  setPendingId(item.id);
                }}
              >
                {t(locale, 'app.desktopRead.purgeManuscript')}
              </button>
            ) : item.removable ? (
              <button
                type="button"
                disabled={removing || unknownIds.has(item.id)}
                onClick={() => removeFile(item.id)}
              >
                {t(locale, 'app.desktopRead.removeRecordingFile')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p>{t(locale, 'app.desktopRead.reminderBackups')}</p>
      <button type="button" onClick={onClose}>
        {t(locale, 'app.desktopRead.reminderClose')}
      </button>
      {pendingId === null ? null : (
        <div role="dialog" aria-labelledby="desktop-purge-confirm">
          <h2 id="desktop-purge-confirm">{t(locale, 'app.desktopRead.purgeConfirmTitle')}</h2>
          {pendingItem === undefined ? null : <p>{reminderLine(locale, pendingItem)}</p>}
          <p>{t(locale, 'app.desktopRead.reminderBackups')}</p>
          <button
            type="button"
            disabled={purging}
            onClick={() => {
              setPendingId(null);
              setFailed(null);
            }}
          >
            {t(locale, 'app.desktopRead.purgeCancel')}
          </button>
          <button type="button" disabled={purging} onClick={confirmPurge}>
            {t(locale, 'app.desktopRead.purgeConfirm')}
          </button>
        </div>
      )}
    </div>
  );
}

function reminderLine(
  locale: Parameters<typeof t>[0],
  item: {
    target: 'manuscript' | 'media';
    id: string;
    title: Record<string, string> | null;
    relpath: string | null;
    retainUntil: string;
  },
): string {
  if (item.target === 'manuscript') {
    const title = readLocalizedMultiLangLabel(item.title, locale) ?? item.id;
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

function removalFailure(state: CleanupResult['state']): 'remove' | 'unknown' | null {
  switch (state) {
    case 'confirmed':
      return null;
    case 'unknown':
      return 'unknown';
    case 'failed':
    case 'intent':
      return 'remove';
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}
