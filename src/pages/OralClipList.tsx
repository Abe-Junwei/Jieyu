import { useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconTipButton } from '../components/ui/IconTip';
import { t, tf, type Locale } from '../i18n';
import { JIEYU_ICON_WAVE } from '../utils/jieyuIcon';

export function currentClipIndex(
  clips: readonly { id: string | null }[],
  currentId: string | null,
): number {
  return Math.max(
    0,
    clips.findIndex((clip) => clip.id !== null && clip.id === currentId),
  );
}

/** Opens to the right of the button. Choosing a row only changes which clip is current. */
export function OralClipList(props: {
  locale: Locale;
  clips: readonly { id: string | null }[];
  currentId: string | null;
  onPick: (id: string) => void;
}) {
  const { locale, clips, currentId } = props;
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  if (clips.length < 2) return null;
  const index = currentClipIndex(clips, currentId);
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = button.current?.getBoundingClientRect();
    setAt(at === null && rect ? { top: rect.top, left: rect.right + 4 } : null);
  };
  return (
    <>
      <IconTipButton
        ref={button}
        className="timeline-translation-audio-btn"
        label={t(locale, 'app.desktopTranscription.playlist')}
        aria-expanded={at !== null}
        onClick={open}
      >
        <svg
          className={['jieyu-icon', JIEYU_ICON_WAVE, 'lucide', 'lucide-list'].join(' ')}
          viewBox="0 0 24 24"
          width="24"
          height="24"
          aria-hidden="true"
        >
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
          <path d="M9 6h12" />
          <path d="M9 12h12" />
          <path d="M9 18h12" />
        </svg>
      </IconTipButton>
      {at === null
        ? null
        : createPortal(
            <>
              <button
                type="button"
                className="desktop-tx-menu-backdrop"
                aria-label={t(locale, 'app.desktopTranscription.cancel')}
                onClick={() => setAt(null)}
              />
              <div
                className="desktop-tx-menu desktop-tx-menu-fixed"
                style={{ top: at.top, left: at.left }}
                role="menu"
              >
                <p className="desktop-tx-playlist__title">
                  {tf(locale, 'app.desktopTranscription.playlistTitle', {
                    index: String(index + 1),
                    remain: String(clips.length - index - 1),
                  })}
                </p>
                {clips.map((clip, item) =>
                  clip.id === null ? null : (
                    <button
                      key={clip.id}
                      type="button"
                      role="menuitem"
                      className={clip.id === currentId ? 'is-on' : undefined}
                      onClick={() => {
                        if (clip.id === null) return;
                        props.onPick(clip.id);
                        setAt(null);
                      }}
                    >
                      {tf(locale, 'app.desktopTranscription.clipIndex', {
                        index: String(item + 1),
                      })}
                    </button>
                  ),
                )}
              </div>
            </>,
            document.body,
          )}
    </>
  );
}
