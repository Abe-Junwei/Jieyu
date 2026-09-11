import { formatTime, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import type { LayerUnitDocType, UnitTokenDocType } from '../../types/jieyuDbDocTypes';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import { resolveAnnotationGlossWriteLang, type AnnotationIgtToken } from './annotationTokenDrafts';
import { buildTranscriptionDeepLinkHref } from '../../utils/transcriptionUrlDeepLink';

export type AnnotationIgtRow = {
  id: string;
  timeLabel: string;
  startTime: number;
  endTime: number;
  mediaId: string;
  selfCertainty?: UnitSelfCertainty;
  surface: string;
  tokens: AnnotationIgtToken[];
  translation: string;
  transcriptionHref: string;
};

function glossForToken(token: UnitTokenDocType): string {
  return pickDefaultTranscriptionText(token.gloss ?? {});
}

export function buildAnnotationIgtRows(input: {
  units: readonly LayerUnitDocType[];
  tokens: readonly UnitTokenDocType[];
  textId: string;
  mediaId: string;
}): AnnotationIgtRow[] {
  const tokensByUnit = new Map<string, UnitTokenDocType[]>();
  for (const token of input.tokens) {
    const list = tokensByUnit.get(token.unitId) ?? [];
    list.push(token);
    tokensByUnit.set(token.unitId, list);
  }
  return input.units.map((unit) => {
    const unitTokens = [...(tokensByUnit.get(unit.id) ?? [])].sort(
      (a, b) => a.tokenIndex - b.tokenIndex,
    );
    const resolvedMediaId =
      unit.mediaId !== undefined && unit.mediaId.length > 0 ? unit.mediaId : input.mediaId;
    return {
      id: unit.id,
      timeLabel: formatTime(unit.startTime),
      startTime: unit.startTime,
      endTime: unit.endTime,
      mediaId: resolvedMediaId,
      ...(unit.selfCertainty ? { selfCertainty: unit.selfCertainty } : {}),
      surface: pickDefaultTranscriptionText(unit.transcription ?? {}),
      tokens: unitTokens.map((token) => ({
        id: token.id,
        form: pickDefaultTranscriptionText(token.form),
        gloss: glossForToken(token),
        pos: (token.pos ?? '').trim(),
        glossLang: resolveAnnotationGlossWriteLang(token.gloss),
      })),
      translation: '',
      transcriptionHref: buildTranscriptionDeepLinkHref({
        textId: unit.textId.length > 0 ? unit.textId : input.textId,
        ...(resolvedMediaId.length > 0 ? { mediaId: resolvedMediaId } : {}),
        unitId: unit.id,
      }),
    };
  });
}
