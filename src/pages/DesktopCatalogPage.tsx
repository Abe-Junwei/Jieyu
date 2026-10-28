import { useRef } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { readOpenProjectSession } from '../desktop/openProjectSession';
import { t, useLocale } from '../i18n';
import { useDesktopSpeakerCatalog } from './useDesktopSpeakerCatalog';

export type DesktopCatalogSection = 'language' | 'orthography' | 'bridge' | 'structure';

export function DesktopCatalogPage(props: {
  host: DesktopReadHost;
  section: DesktopCatalogSection;
}) {
  const locale = useLocale();
  const sessionId = readOpenProjectSession();
  if (sessionId === null) return null;
  if (props.section === 'structure') {
    return (
      <section className="desktop-project-read" data-testid="desktop-catalog-page">
        <p>{t(locale, 'app.desktopRead.structuralTemplatesStay')}</p>
      </section>
    );
  }
  return <DesktopCatalogEditor host={props.host} sessionId={sessionId} section={props.section} />;
}

function DesktopCatalogEditor(props: {
  host: DesktopReadHost;
  sessionId: string;
  section: Exclude<DesktopCatalogSection, 'structure'>;
}) {
  const locale = useLocale();
  const catalog = useDesktopSpeakerCatalog(props.host, props.sessionId);
  const languageRef = useRef<HTMLInputElement>(null);
  const scriptRef = useRef<HTMLInputElement>(null);
  const rulesRef = useRef<HTMLInputElement>(null);
  const language = catalog.languages.find((item) => item.id === catalog.languageId) ?? null;
  const orthography =
    catalog.orthographies.find((item) => item.id === catalog.orthographyId) ?? null;
  const bridge = catalog.bridges.find((item) => item.id === catalog.bridgeId) ?? null;

  return (
    <section className="desktop-project-read" data-testid="desktop-catalog-page">
      {catalog.error.length > 0 ? <p role="alert">{catalog.error}</p> : null}
      {props.section === 'language' ? (
        <div className="desktop-project-read-units">
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
        </div>
      ) : null}
      {props.section === 'orthography' ? (
        <div className="desktop-project-read-units">
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
        </div>
      ) : null}
      {props.section === 'bridge' ? (
        <div className="desktop-project-read-units">
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
      ) : null}
    </section>
  );
}
