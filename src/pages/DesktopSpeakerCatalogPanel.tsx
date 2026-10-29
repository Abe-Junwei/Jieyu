import { useRef } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { useDesktopSpeakerCatalog } from './useDesktopSpeakerCatalog';

export function DesktopSpeakerCatalogPanel(props: {
  host: DesktopReadHost;
  sessionId: string;
  units: readonly { id: string; text: string; speakerId: string | null }[];
  onAssigned: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const catalog = useDesktopSpeakerCatalog(props.host, props.sessionId);
  const nameRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const languageRef = useRef<HTMLInputElement>(null);
  const scriptRef = useRef<HTMLInputElement>(null);
  const rulesRef = useRef<HTMLInputElement>(null);
  const speaker = catalog.speakers.find((item) => item.id === catalog.speakerId) ?? null;
  const language = catalog.languages.find((item) => item.id === catalog.languageId) ?? null;
  const orthography =
    catalog.orthographies.find((item) => item.id === catalog.orthographyId) ?? null;
  const bridge = catalog.bridges.find((item) => item.id === catalog.bridgeId) ?? null;
  const speakerName = (id: string | null) =>
    catalog.speakers.find((item) => item.id === id)?.name ?? '';

  return (
    <div className="desktop-project-read-units">
      {catalog.error.length > 0 ? <p role="alert">{catalog.error}</p> : null}
      {catalog.speakers.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === catalog.speakerId ? 'true' : 'false'}
          onClick={() => catalog.selectSpeaker(item.id)}
        >
          {item.name}
        </button>
      ))}
      <input ref={nameRef} aria-label={t(locale, 'app.desktopRead.speakerName')} />
      <button
        type="button"
        onClick={() => {
          void catalog.createSpeaker(nameRef.current?.value ?? '');
        }}
      >
        {t(locale, 'app.desktopRead.createSpeaker')}
      </button>
      {speaker === null ? null : (
        <>
          <input
            ref={noteRef}
            key={`${speaker.id}:${speaker.revisions.notes}:${speaker.notes?.zh ?? ''}`}
            aria-label={t(locale, 'app.desktopRead.speakerNote')}
            defaultValue={speaker.notes?.zh ?? ''}
          />
          <button
            type="button"
            onClick={() => {
              void catalog.saveNote(speaker, noteRef.current?.value ?? '');
            }}
          >
            {t(locale, 'app.desktopRead.saveSpeakerNote')}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          const id = catalog.speakerId;
          if (id === null) return;
          void catalog
            .assign(
              id,
              props.units.map((unit) => unit.id),
            )
            .then((ok) => {
              if (ok) void props.onAssigned();
            });
        }}
      >
        {t(locale, 'app.desktopRead.assignSpeaker')}
      </button>
      {props.units.map((unit) => (
        <span key={unit.id}>{unitLine(unit.text, speakerName(unit.speakerId))}</span>
      ))}
      {catalog.languages.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === catalog.languageId ? 'true' : 'false'}
          onClick={() => catalog.selectLanguage(item.id)}
        >
          {item.name.zh ?? Object.values(item.name)[0] ?? item.id}
        </button>
      ))}
      {language === null ? null : (
        <>
          <input
            ref={languageRef}
            key={language.id}
            aria-label={t(locale, 'app.desktopRead.languageName')}
            defaultValue={language.name.zh ?? ''}
          />
          <button
            type="button"
            onClick={() => {
              void catalog.saveLanguage(language.id, languageRef.current?.value ?? '');
            }}
          >
            {t(locale, 'app.desktopRead.saveLanguage')}
          </button>
        </>
      )}
      {catalog.orthographies.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === catalog.orthographyId ? 'true' : 'false'}
          onClick={() => catalog.selectOrthography(item.id)}
        >
          {item.scriptTag}
        </button>
      ))}
      {orthography === null ? null : (
        <>
          <input
            ref={scriptRef}
            key={orthography.id}
            aria-label={t(locale, 'app.desktopRead.scriptTag')}
            defaultValue={orthography.scriptTag}
          />
          <button
            type="button"
            onClick={() => {
              void catalog.saveOrthography(orthography.id, scriptRef.current?.value ?? '');
            }}
          >
            {t(locale, 'app.desktopRead.saveOrthography')}
          </button>
        </>
      )}
      {catalog.bridges.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === catalog.bridgeId ? 'true' : 'false'}
          onClick={() => catalog.selectBridge(item.id)}
        >
          {item.engine}
        </button>
      ))}
      {bridge === null ? null : (
        <>
          <input
            ref={rulesRef}
            key={`${bridge.id}:${JSON.stringify(bridge.rules)}`}
            aria-label={t(locale, 'app.desktopRead.bridgeRules')}
            defaultValue={JSON.stringify(bridge.rules)}
          />
          <button
            type="button"
            onClick={() => {
              void catalog.saveBridge(bridge.id, rulesRef.current?.value ?? '');
            }}
          >
            {t(locale, 'app.desktopRead.saveBridge')}
          </button>
        </>
      )}
    </div>
  );
}

function unitLine(text: string, speaker: string): string {
  return speaker.length === 0 ? text : `${text} · ${speaker}`;
}
