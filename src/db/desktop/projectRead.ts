import type { Layer, LayerLink } from './layers';
import type { Manuscript } from './manuscripts';
import type { Unit } from './units';

export interface DesktopProjectReadApi {
  listManuscripts(sessionId: string): Promise<Manuscript[]>;
  listLayers(sessionId: string, manuscriptId: string): Promise<Layer[]>;
  listLayerLinks(sessionId: string, manuscriptId: string): Promise<LayerLink[]>;
  listUnits(sessionId: string, layerId: string): Promise<Unit[]>;
  mediaPlayUrl(sessionId: string, mediaId: string): Promise<string>;
}

export interface DesktopProjectLayerRead extends Layer {
  units: Unit[];
}

export interface DesktopProjectRead {
  manuscripts: Manuscript[];
  manuscriptId: string | null;
  layers: DesktopProjectLayerRead[];
  /** Explicit text-layer → host-layer links of the manuscript. */
  links: LayerLink[];
  layerId: string | null;
  audioUrl: string | null;
  /** Units of `layerId`. The whole manuscript, including parent links, is `layers`. */
  units: Unit[];
}

export async function loadDesktopProjectRead(
  api: DesktopProjectReadApi,
  sessionId: string,
  manuscriptId?: string,
  includeMedia = true,
  layerId?: string,
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
    return {
      manuscripts,
      manuscriptId: null,
      layers: [],
      links: [],
      layerId: null,
      audioUrl: null,
      units: [],
    };
  }
  const listed = await api.listLayers(sessionId, selected.id);
  const layers = await Promise.all(
    listed.map(async (item) => ({
      ...item,
      units: await api.listUnits(sessionId, item.id),
    })),
  );
  const links = (await api.listLayerLinks(sessionId, selected.id)) ?? [];
  const layer =
    layers.find((item) => item.id === layerId) ??
    layers.find((item) => item.tierType === 'time-aligned' && item.contentType === 'transcription');
  const audioUrl =
    includeMedia && selected.mediaId !== null
      ? await api.mediaPlayUrl(sessionId, selected.mediaId)
      : null;
  return {
    manuscripts,
    manuscriptId: selected.id,
    layers,
    links,
    layerId: layer?.id ?? null,
    audioUrl,
    units: layer?.units ?? [],
  };
}
