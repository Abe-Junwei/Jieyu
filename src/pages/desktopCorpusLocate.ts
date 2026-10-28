export interface DesktopCorpusLocate {
  manuscriptId: string;
  layerId: string;
  unitId: string;
}

export function desktopCorpusLocateHref(locate: DesktopCorpusLocate): string {
  const query = new URLSearchParams();
  query.set('manuscriptId', locate.manuscriptId);
  query.set('layerId', locate.layerId);
  query.set('unitId', locate.unitId);
  return `/desktop-project?${query.toString()}`;
}

/** A locate link needs all three ids. A partial query is not a locate. */
export function readDesktopCorpusLocate(search: URLSearchParams): DesktopCorpusLocate | null {
  const manuscriptId = search.get('manuscriptId')?.trim() ?? '';
  const layerId = search.get('layerId')?.trim() ?? '';
  const unitId = search.get('unitId')?.trim() ?? '';
  if (manuscriptId.length === 0 || layerId.length === 0 || unitId.length === 0) return null;
  return { manuscriptId, layerId, unitId };
}
