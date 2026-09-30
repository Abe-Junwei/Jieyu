import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import { formatTime, pickTranscriptionTextForLanguage } from '../../utils/transcriptionFormatters';
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
  speakerId?: string;
  speakerName?: string;
  addressee?: string;
  ungrammatical?: boolean;
  actualForm?: string;
  targetForm?: string;
  tokens: AnnotationIgtToken[];
  translation: string;
  transcriptionHref: string;
  analysisGraph?: AnnotationAnalysisGraphFixture;
};

function annotationSurfaceText(
  unit: LayerUnitDocType,
  surfaces: ReadonlyMap<string, string> | undefined,
  languageId?: string,
): string {
  const fromLayer = surfaces?.get(unit.id) ?? '';
  if (fromLayer.length > 0) return fromLayer;
  return pickTranscriptionTextForLanguage(unit.transcription ?? {}, languageId);
}

function glossForToken(token: UnitTokenDocType, languageId?: string): string {
  return pickTranscriptionTextForLanguage(token.gloss ?? {}, languageId);
}

export function buildAnnotationIgtRows(input: {
  units: readonly LayerUnitDocType[];
  tokens: readonly UnitTokenDocType[];
  textId: string;
  mediaId: string;
  translations?: ReadonlyMap<string, string>;
  /** Transcription-layer segment text, the same lines the transcription page shows as source. */
  surfaces?: ReadonlyMap<string, string>;
  languageId?: string;
  speakerNames?: ReadonlyMap<string, string>;
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
    const speakerId = unit.speakerId?.trim() ?? '';
    const speakerName = speakerId.length > 0 ? input.speakerNames?.get(speakerId)?.trim() : '';
    return {
      id: unit.id,
      timeLabel: formatTime(unit.startTime),
      startTime: unit.startTime,
      endTime: unit.endTime,
      mediaId: resolvedMediaId,
      ...(unit.selfCertainty ? { selfCertainty: unit.selfCertainty } : {}),
      ...(speakerId.length > 0 ? { speakerId } : {}),
      ...(speakerName ? { speakerName } : {}),
      ...(unit.addressee?.trim() ? { addressee: unit.addressee.trim() } : {}),
      ...(unit.ungrammatical ? { ungrammatical: true } : {}),
      ...(unit.actualForm?.trim() ? { actualForm: unit.actualForm.trim() } : {}),
      ...(unit.targetForm?.trim() ? { targetForm: unit.targetForm.trim() } : {}),
      surface: annotationSurfaceText(unit, input.surfaces, input.languageId),
      tokens: unitTokens.map((token) => ({
        id: token.id,
        form: pickTranscriptionTextForLanguage(token.form, input.languageId),
        gloss: glossForToken(token, input.languageId),
        pos: (token.pos ?? '').trim(),
        ...(token.provenance?.reviewStatus ? { reviewStatus: token.provenance.reviewStatus } : {}),
        ...(token.languageId?.trim() ? { languageId: token.languageId.trim() } : {}),
        glossLang: (() => {
          const preferred = input.languageId?.trim() ?? '';
          const stored = (token.gloss?.[preferred] ?? '').trim();
          return preferred.length > 0 && stored.length > 0
            ? preferred
            : resolveAnnotationGlossWriteLang(token.gloss);
        })(),
        ...(token.gloss ? { glossByLanguage: token.gloss } : {}),
      })),
      translation: input.translations?.get(unit.id) ?? '',
      ...(unit.analysisGraph ? { analysisGraph: unit.analysisGraph } : {}),
      transcriptionHref: buildTranscriptionDeepLinkHref({
        textId: unit.textId.length > 0 ? unit.textId : input.textId,
        ...(resolvedMediaId.length > 0 ? { mediaId: resolvedMediaId } : {}),
        ...(unit.layerId?.trim() ? { layerId: unit.layerId.trim() } : {}),
        unitId: unit.id,
      }),
    };
  });
}
