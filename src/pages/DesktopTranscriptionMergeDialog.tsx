import { layerLabel } from './DesktopTranscriptionLayerRows';
import { useEffect, useRef, useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { TEXT_AUDIO_CAP } from '../utils/textAudioCap';
import { t, tf, type Locale } from '../i18n';
import { JIEYU_ICON_WAVE } from '../utils/jieyuIcon';

export interface MergeClipView {
  id: string;
  unitId: string;
  layerId: string;
  fileId: string;
}

/** Kept clips on one target text row, after dropping chosen ids and duplicate files. */
export function keptOnFullestRow(
  earlier: readonly MergeClipView[],
  later: readonly MergeClipView[],
  discard: readonly string[],
): number {
  const dropped = new Set(discard);
  const files = new Map<string, Set<string>>();
  for (const clip of [...earlier, ...later]) {
    if (dropped.has(clip.id)) continue;
    const row = files.get(clip.layerId) ?? new Set<string>();
    row.add(clip.fileId);
    files.set(clip.layerId, row);
  }
  let fullest = 0;
  for (const row of files.values()) fullest = Math.max(fullest, row.size);
  return fullest;
}

export interface MergePreviewView {
  texts?: {
    layerId: string;
    name: Record<string, string>;
    official: string;
    draft: string | null;
    result: string;
  }[];
  keepId: string;
  removeId: string;
  gapMs: number;
  noteCount: number;
  separator: string;
  baseline: string;
  earlier: MergeClipView[];
  later: MergeClipView[];
}

const CAP = TEXT_AUDIO_CAP;

export function DesktopTranscriptionMergeDialog(props: {
  locale: Locale;
  sessionId: string;
  preview: MergePreviewView;
  stale: boolean;
  desktopCall: (sessionId: string, method: string, args: unknown) => Promise<unknown>;
  onCancel: () => void;
  onConfirm: (
    discardAudioIds: string[],
    textOverrides: { layerId: string; text: string }[],
  ) => void;
}) {
  const { locale, preview } = props;
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState<string[]>([]);
  const [seconds, setSeconds] = useState<Record<string, number>>({});
  const playing = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const closed = useRef(false);
  const clips = [...preview.earlier, ...preview.later];
  const fullest = keptOnFullestRow(preview.earlier, preview.later, []);
  const tooMany = fullest > CAP;
  const blocked = props.stale || keptOnFullestRow(preview.earlier, preview.later, discard) > CAP;
  const gap = (preview.gapMs / 1000).toFixed(3);

  const clipKey = clips.map((clip) => clip.id).join('\n');
  useEffect(() => {
    closed.current = false;
    let dead = false;
    const urls: string[] = [];
    for (const clip of [...preview.earlier, ...preview.later]) {
      void readClip(props.desktopCall, props.sessionId, clip).then((url) => {
        if (url === null || dead) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        urls.push(url);
        const audio = new Audio(url);
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          if (dead || !Number.isFinite(audio.duration)) return;
          setSeconds((current) => ({ ...current, [clip.id]: Math.round(audio.duration) }));
        };
      });
    }
    return () => {
      dead = true;
      closed.current = true;
      const current = playing.current;
      playing.current = null;
      current?.audio.pause();
      if (current) URL.revokeObjectURL(current.url);
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [clipKey, preview.earlier, preview.later, props.desktopCall, props.sessionId]);

  const play = (clip: MergeClipView) => {
    void readClip(props.desktopCall, props.sessionId, clip).then((url) => {
      if (url === null || closed.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      const previous = playing.current;
      playing.current = null;
      previous?.audio.pause();
      if (previous) URL.revokeObjectURL(previous.url);
      const audio = new Audio(url);
      playing.current = { audio, url };
      const release = () => {
        if (playing.current?.audio === audio) playing.current = null;
        URL.revokeObjectURL(url);
      };
      audio.onended = release;
      void audio.play().catch(release);
    });
  };

  return (
    <ModalPanel
      isOpen
      compact
      className="desktop-tx-merge desktop-tx-orthography-dialog"
      bodyClassName="desktop-tx-orthography-form"
      closeLabel={t(locale, 'app.desktopTranscription.cancel')}
      onClose={props.onCancel}
      title={t(locale, 'app.desktopTranscription.mergeTitle')}
      footer={
        <>
          <button autoFocus type="button" className="btn btn-secondary" onClick={props.onCancel}>
            {t(locale, 'app.desktopTranscription.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocked}
            onClick={() =>
              props.onConfirm(
                discard,
                Object.entries(texts).map(([layerId, text]) => ({ layerId, text })),
              )
            }
          >
            {t(
              locale,
              preview.texts?.some((row) => row.draft !== null)
                ? 'app.desktopTranscription.mergeDraftConfirm'
                : 'app.desktopTranscription.mergeConfirm',
            )}
          </button>
        </>
      }
    >
      {preview.gapMs > 0 ? <p>{tf(locale, 'app.desktopTranscription.mergeGap', { gap })}</p> : null}
      {preview.noteCount > 0 ? (
        <p>{tf(locale, 'app.desktopTranscription.mergeNotes', { notes: preview.noteCount })}</p>
      ) : null}
      {tooMany ? (
        <p>{tf(locale, 'app.desktopTranscription.mergeTooMany', { count: fullest })}</p>
      ) : null}
      {props.stale ? <p>{t(locale, 'app.desktopTranscription.mergeStale')}</p> : null}
      {preview.texts?.map((row) => (
        <section key={row.layerId}>
          <h3>{layerLabel(row.name, locale, row.layerId)}</h3>
          <label>
            {t(locale, 'app.desktopTranscription.officialText')}
            <input readOnly value={row.official} />
          </label>
          {row.draft === null ? null : (
            <label>
              {t(locale, 'app.desktopTranscription.unsavedDraft')}
              <input readOnly value={row.draft} />
            </label>
          )}
          <label>
            {t(locale, 'app.desktopTranscription.mergeResult')}
            <input
              value={texts[row.layerId] ?? row.result}
              onChange={(event) =>
                setTexts((current) => ({ ...current, [row.layerId]: event.target.value }))
              }
            />
          </label>
        </section>
      ))}
      {tooMany ? (
        <>
          <ClipGroup
            locale={locale}
            title={t(locale, 'app.desktopTranscription.mergeEarlier')}
            clips={preview.earlier}
            seconds={seconds}
            discard={discard}
            onToggle={(id) =>
              setDiscard((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onPlay={play}
          />
          <ClipGroup
            locale={locale}
            title={t(locale, 'app.desktopTranscription.mergeLater')}
            clips={preview.later}
            seconds={seconds}
            discard={discard}
            onToggle={(id) =>
              setDiscard((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onPlay={play}
          />
        </>
      ) : null}
    </ModalPanel>
  );
}

function ClipGroup(props: {
  locale: Locale;
  title: string;
  clips: readonly MergeClipView[];
  seconds: Record<string, number>;
  discard: readonly string[];
  onToggle: (id: string) => void;
  onPlay: (clip: MergeClipView) => void;
}) {
  if (props.clips.length === 0) return null;
  return (
    <div className="desktop-tx-merge__region">
      <p className="desktop-tx-merge__region-title">{props.title}</p>
      {props.clips.map((clip, index) => {
        const shown = props.seconds[clip.id];
        return (
          <label key={clip.id} className="desktop-tx-merge__row">
            <input
              type="checkbox"
              checked={props.discard.includes(clip.id)}
              onChange={() => props.onToggle(clip.id)}
            />
            <span>
              {tf(props.locale, 'app.desktopTranscription.mergeClip', { index: index + 1 })}
            </span>
            {shown === undefined ? null : (
              <span className="desktop-tx-merge__time">
                {tf(props.locale, 'app.desktopTranscription.mergeSeconds', { seconds: shown })}
              </span>
            )}
            <button
              type="button"
              className="timeline-translation-audio-btn"
              aria-label={t(props.locale, 'app.desktopTranscription.mergeListen')}
              onClick={(event) => {
                event.preventDefault();
                props.onPlay(clip);
              }}
            >
              <JieyuIcon name="Play" className={JIEYU_ICON_WAVE} />
            </button>
          </label>
        );
      })}
    </div>
  );
}

async function readClip(
  desktopCall: (sessionId: string, method: string, args: unknown) => Promise<unknown>,
  sessionId: string,
  clip: MergeClipView,
): Promise<string | null> {
  try {
    const read = (await desktopCall(sessionId, 'recordings.read', {
      unitId: clip.unitId,
      layerId: clip.layerId,
      audioId: clip.id,
    })) as { mimeType?: unknown; bytes?: unknown };
    if (!(read.bytes instanceof Uint8Array) || typeof read.mimeType !== 'string') return null;
    return URL.createObjectURL(new Blob([new Uint8Array(read.bytes)], { type: read.mimeType }));
  } catch {
    return null;
  }
}
