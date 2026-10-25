import { useState } from 'react';
import {
  createDesktopClient,
  loadDesktopProjectRead,
  type DesktopProjectRead,
  type DesktopProjectReadApi,
} from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function useDesktopProjectReadController(host: DesktopReadHost | null) {
  const locale = useLocale();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState<DesktopProjectRead | null>(null);
  const [error, setError] = useState('');

  const openFolder = () => {
    if (host === null) return;
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
    if (host === null || sessionId === null) return;
    setError('');
    void loadDesktopProjectRead(readApi(host), sessionId, manuscriptId)
      .then(setModel)
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const reload = () => {
    if (host === null || sessionId === null) return Promise.resolve();
    const manuscriptId = model?.manuscriptId ?? undefined;
    return loadDesktopProjectRead(readApi(host), sessionId, manuscriptId).then(setModel);
  };

  const saveText = (unitId: string, text: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateUnitText(sessionId, { unitId, text })
      .then(() => reload())
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const moveBoundary = (leftId: string, rightId: string, time: number) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateBoundary(sessionId, { leftId, rightId, time })
      .then(() => reload())
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const saveMapping = (offsetSec: number, scale: number) => {
    if (
      host === null ||
      sessionId === null ||
      model?.manuscriptId === null ||
      model?.manuscriptId === undefined
    ) {
      return;
    }
    const manuscriptId = model.manuscriptId;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .setTimeMapping(sessionId, {
        manuscriptId,
        expectedRevision:
          model.manuscripts.find((item) => item.id === manuscriptId)?.timeMappingRevision ?? 0,
        offsetSec,
        scale,
      })
      .then(() => reload())
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  return { model, error, openFolder, selectManuscript, saveText, moveBoundary, saveMapping };
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
