import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { createDesktopClient } from '../db/desktop/client';
import {
  loadDesktopProjectRead,
  type DesktopProjectRead,
  type DesktopProjectReadApi,
} from '../db/desktop/projectRead';
import { readDesktopProjectHost, type DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { DesktopProjectReadView } from './DesktopProjectReadView';
import '../styles/pages/desktop-project-read.css';

export function DesktopProjectReadPage() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState<DesktopProjectRead | null>(null);
  const [error, setError] = useState('');

  if (host === null) return <Navigate to="/" replace />;

  const openFolder = () => {
    setError('');
    void host
      .chooseDesktopFolder()
      .then(async (picked) => {
        if (!('sessionId' in picked)) return;
        setSessionId(picked.sessionId);
        setModel(await loadDesktopProjectRead(readApi(host), picked.sessionId));
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const selectManuscript = (manuscriptId: string) => {
    if (sessionId === null) return;
    setError('');
    void loadDesktopProjectRead(readApi(host), sessionId, manuscriptId)
      .then(setModel)
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  return (
    <section className="desktop-project-read">
      <button type="button" className="btn btn-primary" onClick={openFolder}>
        {t(locale, 'app.desktopRead.openFolder')}
      </button>
      {error.length > 0 ? <p role="alert">{error}</p> : null}
      {model === null ? null : (
        <DesktopProjectReadView
          manuscripts={model.manuscripts}
          manuscriptId={model.manuscriptId}
          units={model.units}
          audioUrl={model.audioUrl}
          emptyLabel={t(locale, 'app.desktopRead.empty')}
          audioLabel={t(locale, 'app.desktopRead.audio')}
          onSelectManuscript={selectManuscript}
        />
      )}
    </section>
  );
}

function readApi(host: DesktopReadHost): DesktopProjectReadApi {
  const client = createDesktopClient({ desktopCall: host.desktopCall });
  return {
    listManuscripts: (sessionId) => client.listManuscripts(sessionId),
    listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
    listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
    mediaPlayUrl: async (sessionId, mediaId) =>
      (await host.desktopMediaUrl(sessionId, mediaId)).url,
  };
}
