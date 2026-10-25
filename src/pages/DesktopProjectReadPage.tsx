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

  const reload = () => {
    if (sessionId === null) return Promise.resolve();
    const manuscriptId = model?.manuscriptId ?? undefined;
    return loadDesktopProjectRead(readApi(host), sessionId, manuscriptId).then(setModel);
  };

  const saveText = (unitId: string, text: string) => {
    if (sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateUnitText(sessionId, { unitId, text })
      .then(() => reload())
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const moveBoundary = (leftId: string, rightId: string, time: number) => {
    if (sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateBoundary(sessionId, { leftId, rightId, time })
      .then(() => reload())
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const saveMapping = (offsetSec: number, scale: number) => {
    if (sessionId === null || model?.manuscriptId === null || model?.manuscriptId === undefined) {
      return;
    }
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .setTimeMapping(sessionId, {
        manuscriptId: model.manuscriptId,
        expectedRevision:
          model.manuscripts.find((item) => item.id === model.manuscriptId)?.timeMapping?.revision ??
          0,
        offsetSec,
        scale,
      })
      .then(() => reload())
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const selected = model?.manuscripts.find((item) => item.id === model.manuscriptId);

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
          timeMapping={selected?.timeMapping ?? null}
          emptyLabel={t(locale, 'app.desktopRead.empty')}
          audioLabel={t(locale, 'app.desktopRead.audio')}
          textLabel={t(locale, 'app.desktopRead.text')}
          saveTextLabel={t(locale, 'app.desktopRead.saveText')}
          boundaryLabel={t(locale, 'app.desktopRead.boundary')}
          moveBoundaryLabel={t(locale, 'app.desktopRead.moveBoundary')}
          offsetLabel={t(locale, 'app.desktopRead.offset')}
          scaleLabel={t(locale, 'app.desktopRead.scale')}
          saveMappingLabel={t(locale, 'app.desktopRead.saveMapping')}
          onSelectManuscript={selectManuscript}
          onSaveText={saveText}
          onMoveBoundary={moveBoundary}
          onSaveMapping={saveMapping}
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
