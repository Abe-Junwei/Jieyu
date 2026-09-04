import { formatTime } from '../utils/transcriptionFormatters';
import { buildTranscriptionDeepLinkHref } from '../utils/transcriptionUrlDeepLink';

export type CorpusWorksetExportUnit = {
  unitId: string;
  textId: string;
  mediaId: string;
  layerId: string;
  startTime: number;
  endTime: number;
  text: string;
};

export type CorpusWorksetExportPayload = {
  textId: string;
  mediaId: string;
  units: CorpusWorksetExportUnit[];
};

export function buildCorpusWorksetExportPayload(input: {
  textId: string;
  mediaId: string;
  basketUnitIds: readonly string[];
  units: readonly CorpusWorksetExportUnit[];
}): CorpusWorksetExportPayload {
  const byId = new Map(input.units.map((unit) => [unit.unitId, unit]));
  const selected: CorpusWorksetExportUnit[] = [];
  for (const id of input.basketUnitIds) {
    const match = byId.get(id);
    if (match) selected.push(match);
  }
  const mediaIds = [...new Set(selected.map((unit) => unit.mediaId).filter((id) => id.length > 0))];
  const mediaId = mediaIds.length === 1 ? mediaIds[0] : mediaIds.length === 0 ? input.mediaId : '';
  return { textId: input.textId, mediaId, units: selected };
}

export function toCorpusWorksetExportUnit(input: {
  id: string;
  textId?: string;
  mediaId?: string;
  layerId?: string;
  startTime: number;
  endTime: number;
  text: string;
  fallbackTextId: string;
  fallbackMediaId: string;
}): CorpusWorksetExportUnit {
  const textId =
    input.textId !== undefined && input.textId.length > 0 ? input.textId : input.fallbackTextId;
  const mediaId =
    input.mediaId !== undefined && input.mediaId.length > 0 ? input.mediaId : input.fallbackMediaId;
  return {
    unitId: input.id,
    textId,
    mediaId,
    layerId: input.layerId ?? '',
    startTime: input.startTime,
    endTime: input.endTime,
    text: input.text,
  };
}

function timeRange(unit: CorpusWorksetExportUnit): string {
  return `${formatTime(unit.startTime)}-${formatTime(unit.endTime)}`;
}

export function transcriptionHrefForExportUnit(unit: CorpusWorksetExportUnit): string {
  return buildTranscriptionDeepLinkHref({
    textId: unit.textId,
    ...(unit.mediaId.length > 0 ? { mediaId: unit.mediaId } : {}),
    unitId: unit.unitId,
  });
}

function formatExportHeader(payload: CorpusWorksetExportPayload): string[] {
  const header = [`textId: ${payload.textId}`];
  if (payload.mediaId.length > 0) {
    header.push(`mediaId: ${payload.mediaId}`);
  }
  return header;
}

export function formatCorpusWorksetPlain(payload: CorpusWorksetExportPayload): string {
  if (payload.units.length === 0) return '';
  const lines = payload.units.map((unit) => {
    const media = unit.mediaId.length > 0 ? `\t${unit.mediaId}` : '';
    const layer = unit.layerId.length > 0 ? `\t${unit.layerId}` : '';
    return `${timeRange(unit)}\t${unit.unitId}${media}${layer}\t${unit.text}`;
  });
  return [...formatExportHeader(payload), '', ...lines].join('\n');
}

export function formatCorpusWorksetMarkdown(payload: CorpusWorksetExportPayload): string {
  if (payload.units.length === 0) return '';
  const sections = payload.units.map((unit) => {
    const href = transcriptionHrefForExportUnit(unit);
    const layerLine = unit.layerId.length > 0 ? `\n- layerId: \`${unit.layerId}\`` : '';
    return `## ${unit.unitId}

- time: \`${timeRange(unit)}\`
- mediaId: \`${unit.mediaId}\`${layerLine}
- href: \`${href}\`

${unit.text}`;
  });
  const header = [`# Corpus workset`, '', `- textId: \`${payload.textId}\``];
  if (payload.mediaId.length > 0) {
    header.push(`- mediaId: \`${payload.mediaId}\``);
  }
  return [...header, '', ...sections].join('\n');
}
