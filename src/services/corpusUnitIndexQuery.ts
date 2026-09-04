import type { LayerUnitDocType } from '../db';
import { getUnitsByTextId } from './linguisticServiceUnitTokenOps';

/** Read-only corpus library projection for one text (project). Not a Dexie table. */
export type CorpusUnitIndexRow = {
  id: string;
  textId: string;
  mediaId: string;
  layerId: string;
  startTime: number;
  endTime: number;
  defaultText: string;
};

function compareCorpusUnitIndexRows(a: CorpusUnitIndexRow, b: CorpusUnitIndexRow): number {
  const media = a.mediaId.localeCompare(b.mediaId);
  if (media !== 0) return media;
  if (a.startTime !== b.startTime) return a.startTime - b.startTime;
  return a.id.localeCompare(b.id);
}

export function projectCorpusUnitIndexRows(
  units: readonly LayerUnitDocType[],
): CorpusUnitIndexRow[] {
  return units
    .map((unit) => ({
      id: unit.id,
      textId: unit.textId,
      mediaId: unit.mediaId ?? '',
      layerId: unit.layerId ?? '',
      startTime: unit.startTime,
      endTime: unit.endTime,
      defaultText: unit.transcription?.default ?? '',
    }))
    .sort(compareCorpusUnitIndexRows);
}

export async function listCorpusUnitIndexByTextId(textId: string): Promise<CorpusUnitIndexRow[]> {
  const trimmed = textId.trim();
  if (trimmed.length === 0) return [];
  const units = await getUnitsByTextId(trimmed);
  return projectCorpusUnitIndexRows(units);
}
