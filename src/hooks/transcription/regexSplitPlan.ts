import type { AnchorDocType, LayerUnitContentDocType, LayerUnitDocType } from '../../db/types';
import { newId } from '../../utils/transcriptionFormatters';

const MIN_SPAN_SEC = 0.05;

export type RegexSplitPlan = {
  anchors: AnchorDocType[];
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  /** 新句段上的整段译文副本，调用方据此做分词投影。 */
  projectionSources: Array<{ unit: LayerUnitDocType; translation: LayerUnitContentDocType }>;
  drafts: Record<string, string>;
  firstUnitIds: string[];
};

function boundsFor(
  target: LayerUnitDocType,
  segments: string[],
): Array<{ start: number; end: number }> | undefined {
  const totalChars = Math.max(
    1,
    segments.reduce((sum, part) => sum + part.length, 0),
  );
  const duration = target.endTime - target.startTime;
  const bounds: Array<{ start: number; end: number }> = [];
  let cursor = target.startTime;
  for (let i = 0; i < segments.length; i++) {
    if (i === segments.length - 1) {
      bounds.push({ start: cursor, end: target.endTime });
      break;
    }
    const ratio = segments[i]!.length / totalChars;
    const segDuration = Math.max(MIN_SPAN_SEC, Number((duration * ratio).toFixed(3)));
    const next = Number((cursor + segDuration).toFixed(3));
    bounds.push({ start: cursor, end: next });
    cursor = next;
  }
  if (bounds.some((item) => item.end - item.start < MIN_SPAN_SEC)) return undefined;
  return bounds;
}

/** 译文可能与原文同字；先取句段自己那一层的行，免得把译文当原文拆掉。 */
function primaryContent(
  translations: LayerUnitContentDocType[],
  target: LayerUnitDocType,
  fullText: string,
): LayerUnitContentDocType | undefined {
  const rows = translations.filter(
    (row) => row.unitId === target.id && (row.text ?? '').trim() === fullText,
  );
  const ownLayer = target.layerId ? rows.filter((row) => row.layerId === target.layerId) : [];
  const primary = rows.filter((row) => (row.contentRole ?? 'primary_text') === 'primary_text');
  const pool = ownLayer.length > 0 ? ownLayer : primary.length > 0 ? primary : rows;
  return [...pool].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function pieceContent(
  target: LayerUnitDocType,
  unitId: string,
  text: string,
  layerId: string | undefined,
  now: string,
): LayerUnitContentDocType {
  return {
    id: newId('luc'),
    textId: target.textId,
    unitId,
    ...(layerId ? { layerId } : {}),
    contentRole: 'primary_text',
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: now,
    updatedAt: now,
  };
}

function withoutCertainty<T extends { selfCertainty?: unknown }>(row: T, keep: boolean): T {
  if (keep) return row;
  const next = { ...row };
  delete next.selfCertainty;
  return next;
}

/**
 * 只算出要写入的行，不碰数据库。锚点接法与原先逐个 createAnchor 相同。
 * `fullText` 是调用方已经取到的正文。
 */
export function planRegexSplit(
  targets: Array<{ unit: LayerUnitDocType; fullText: string }>,
  translations: LayerUnitContentDocType[],
  splitter: RegExp,
  now: string,
): RegexSplitPlan {
  const anchors: AnchorDocType[] = [];
  const units: LayerUnitDocType[] = [];
  const contents: LayerUnitContentDocType[] = [];
  const projectionSources: RegexSplitPlan['projectionSources'] = [];
  const drafts: Record<string, string> = {};
  const firstUnitIds: string[] = [];

  for (const { unit: target, fullText } of targets) {
    if (!target.mediaId) continue;
    const trimmed = fullText.trim();
    if (!trimmed) continue;
    const segments = trimmed
      .split(splitter)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (segments.length < 2) continue;
    const bounds = boundsFor(target, segments);
    if (!bounds) continue;

    const keepCertainty = target.selfCertainty !== undefined;
    const first = bounds[0]!;
    const updatedFirst = withoutCertainty(
      {
        ...target,
        startTime: Number(first.start.toFixed(3)),
        endTime: Number(first.end.toFixed(3)),
        updatedAt: now,
      },
      keepCertainty,
    );
    units.push(updatedFirst);
    firstUnitIds.push(target.id);
    drafts[target.id] = segments[0]!;

    const primary = primaryContent(translations, target, trimmed);
    if (primary) {
      contents.push({ ...primary, text: segments[0]!, updatedAt: now });
    } else {
      const created = pieceContent(target, target.id, segments[0]!, target.layerId, now);
      contents.push(created);
      projectionSources.push({ unit: updatedFirst, translation: created });
    }

    let prevEndAnchorId = updatedFirst.endAnchorId;
    for (let i = 1; i < bounds.length; i++) {
      const bound = bounds[i]!;
      const id = newId('utt');
      const startAnchorId = prevEndAnchorId;
      let endAnchorId = target.endAnchorId;
      if (i < bounds.length - 1) {
        const splitAnchor: AnchorDocType = {
          id: newId('anc'),
          mediaId: target.mediaId,
          time: Number(bound.end.toFixed(3)),
          createdAt: now,
        };
        anchors.push(splitAnchor);
        endAnchorId = splitAnchor.id;
        prevEndAnchorId = splitAnchor.id;
      }
      const nextUnit = withoutCertainty(
        {
          ...target,
          id,
          startTime: Number(bound.start.toFixed(3)),
          endTime: Number(bound.end.toFixed(3)),
          startAnchorId,
          endAnchorId,
          annotationStatus: 'raw' as const,
          createdAt: now,
          updatedAt: now,
        },
        keepCertainty,
      );
      units.push(nextUnit);
      drafts[id] = segments[i]!;
      const piece = pieceContent(target, id, segments[i]!, primary?.layerId ?? target.layerId, now);
      contents.push(piece);
      projectionSources.push({ unit: nextUnit, translation: piece });

      for (const row of translations) {
        if (row.unitId !== target.id || row.id === primary?.id) continue;
        const copy: LayerUnitContentDocType = {
          ...row,
          id: newId('utr'),
          unitId: id,
          createdAt: now,
          updatedAt: now,
        };
        contents.push(copy);
        projectionSources.push({ unit: nextUnit, translation: copy });
      }
    }
  }

  return { anchors, units, contents, projectionSources, drafts, firstUnitIds };
}
