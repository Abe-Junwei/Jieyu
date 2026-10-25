import type { Layer } from './layers';
import type { Manuscript } from './manuscripts';
import type { Unit } from './units';

export interface DesktopProjectReadApi {
  listManuscripts(sessionId: string): Promise<Manuscript[]>;
  listLayers(sessionId: string, manuscriptId: string): Promise<Layer[]>;
  listUnits(sessionId: string, layerId: string): Promise<Unit[]>;
  mediaPlayUrl(sessionId: string, mediaId: string): Promise<string>;
}

export interface DesktopProjectRead {
  manuscripts: Manuscript[];
  manuscriptId: string | null;
  audioUrl: string | null;
  units: Unit[];
}

export async function loadDesktopProjectRead(
  api: DesktopProjectReadApi,
  sessionId: string,
  manuscriptId?: string,
): Promise<DesktopProjectRead> {
  const manuscripts = await api.listManuscripts(sessionId);
  const selected =
    manuscriptId === undefined
      ? manuscripts[0]
      : manuscripts.find((item) => item.id === manuscriptId);
  if (manuscriptId !== undefined && selected === undefined) {
    throw new Error('manuscript is missing');
  }
  if (selected === undefined) {
    return { manuscripts, manuscriptId: null, audioUrl: null, units: [] };
  }
  const layers = await api.listLayers(sessionId, selected.id);
  const layer = layers.find(
    (item) => item.tierType === 'time-aligned' && item.contentType === 'transcription',
  );
  const units = layer === undefined ? [] : await api.listUnits(sessionId, layer.id);
  const audioUrl = await api.mediaPlayUrl(sessionId, selected.mediaId);
  return { manuscripts, manuscriptId: selected.id, audioUrl, units };
}
